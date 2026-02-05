#!/bin/bash
#
# ToastTV Install Script
# 
# Usage:
#   Install:   curl -fsSL https://raw.githubusercontent.com/yvg/toasttv/main/scripts/install.sh | sudo bash
#   Uninstall: curl -fsSL https://raw.githubusercontent.com/yvg/toasttv/main/scripts/install.sh | sudo bash -s -- --uninstall
#   Specific:  VERSION=v1.0.0 curl -fsSL ... | sudo bash
#

set -e

REPO_OWNER="yvg"
REPO_NAME="toasttv"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"
INSTALL_DIR="/opt/toasttv"
SERVICE_NAME="toasttv"
APP_PORT=1993
VLC_PORT=9999

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ToastTV]${NC} $1"; }
warn() { echo -e "${YELLOW}[ToastTV]${NC} $1"; }
error() { echo -e "${RED}[ToastTV]${NC} $1" >&2; }

# --- Uninstall Mode ---
if [[ "$1" == "--uninstall" ]]; then
    log "Uninstalling ToastTV..."
    
    systemctl stop $SERVICE_NAME 2>/dev/null || true
    systemctl disable $SERVICE_NAME 2>/dev/null || true
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    
    rm -rf $INSTALL_DIR/app
    rm -rf $INSTALL_DIR/bin
    
    if [[ -d "$INSTALL_DIR/data" ]] || [[ -d "$INSTALL_DIR/media" ]]; then
        warn "Kept user data at: $INSTALL_DIR/data and $INSTALL_DIR/media"
        warn "To remove completely: sudo rm -rf $INSTALL_DIR"
    fi
    
    userdel $SERVICE_NAME 2>/dev/null || true
    
    log "✅ ToastTV uninstalled!"
    exit 0
fi

# --- Pre-flight Checks ---
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Try: sudo bash install.sh"
    exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" ]]; then
    error "Unsupported architecture: $ARCH"
    error "ToastTV binary REQUIRES a 64-bit ARM OS (linux-aarch64)."
    error "For other architectures, please install from source."
    exit 1
fi

# ... [Log Header] ...

# --- Determin Version ---
if [[ -z "$VERSION" ]]; then
    log "Fetching latest release..."
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" 2>/dev/null | grep '"tag_name"' | cut -d'"' -f4 || echo "")
fi

if [[ -z "$VERSION" ]]; then
    error "Could not determine latest version. Please check internet connection."
    exit 1
fi

# --- Install System Dependencies ---
log "Installing dependencies (VLC, FFmpeg, X11)..."
apt-get update -qq
# VLC + X11 for kiosk mode (headless video output)
apt-get install -y -qq vlc vlc-plugin-video-output ffmpeg curl \
    xserver-xorg-core xinit x11-xserver-utils

# --- Create System User ---
if id -u $SERVICE_NAME &>/dev/null; then
    log "User '$SERVICE_NAME' already exists"
else
    log "Creating system user '$SERVICE_NAME'..."
    useradd -r -s /bin/false -d $INSTALL_DIR $SERVICE_NAME
fi

# Ensure permissions for audio/video
log "Granting audio/video permissions..."
usermod -a -G audio,video,render $SERVICE_NAME 2>/dev/null || usermod -a -G audio,video $SERVICE_NAME

# Configure X11 permissions for kiosk mode
log "Configuring X11 wrapper permissions..."
mkdir -p /etc/X11
cat > /etc/X11/Xwrapper.config << XWRAP
# Allow X server to start from systemd service
allowed_users=anybody
needs_root_rights=yes
XWRAP

# --- Install Application ---
log "Downloading ToastTV $VERSION..."
TARBALL_URL="${REPO_URL}/releases/download/${VERSION}/toasttv-${VERSION}.tar.gz"

TMP_DIR=$(mktemp -d)
curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/toasttv.tar.gz"

# Cleanup old app
rm -rf $INSTALL_DIR/app
mkdir -p $INSTALL_DIR/bin
mkdir -p $INSTALL_DIR/{data,media/videos,media/interludes}

# Extract
tar -xzf "$TMP_DIR/toasttv.tar.gz" -C $INSTALL_DIR

# Install Binary
mkdir -p $INSTALL_DIR/bin
mv $INSTALL_DIR/toasttv/toasttv $INSTALL_DIR/bin/toasttv
chmod +x $INSTALL_DIR/bin/toasttv

# Install Static Assets
rm -rf $INSTALL_DIR/public
mv $INSTALL_DIR/toasttv/public $INSTALL_DIR/public

# Install/Seed Starter Media (Videos)
mkdir -p $INSTALL_DIR/media/videos
if [[ -z "$(ls -A $INSTALL_DIR/media/videos)" ]] && [[ -d "$INSTALL_DIR/toasttv/media/videos" ]]; then
    log "Seeding Starter Videos (Caminandes)..."
    cp $INSTALL_DIR/toasttv/media/videos/* $INSTALL_DIR/media/videos/
else
    log "Skipping Starter Videos (Library not empty)"
fi

# Install/Seed Starter Media (Interludes)
mkdir -p $INSTALL_DIR/media/interludes
if [[ -z "$(ls -A $INSTALL_DIR/media/interludes)" ]] && [[ -d "$INSTALL_DIR/toasttv/media/interludes" ]]; then
    log "Seeding Starter Interludes (Penny & Chip)..."
    cp $INSTALL_DIR/toasttv/media/interludes/* $INSTALL_DIR/media/interludes/
else
    log "Skipping Starter Interludes (Library not empty)"
fi

# Install/Seed Data (Config/Logo) - Only if missing
mkdir -p $INSTALL_DIR/data
if [[ -d "$INSTALL_DIR/toasttv/data" ]]; then
    for file in "$INSTALL_DIR/toasttv/data"/*; do
        filename=$(basename "$file")
        if [[ ! -e "$INSTALL_DIR/data/$filename" ]]; then
            log "Seeding default $filename..."
            cp -r "$file" "$INSTALL_DIR/data/"
        fi
    done
fi

# Cleanup extracted folder
rm -rf $INSTALL_DIR/toasttv
rm -rf "$TMP_DIR"

log "Installed binary & starter content successfully"

# --- Create Launcher Script (X11 Kiosk Mode) ---
log "Creating X11 kiosk launcher..."
cat > $INSTALL_DIR/bin/start-toasttv << 'LAUNCHER'
#!/bin/bash
# ToastTV X11 Kiosk Launcher
# Starts a minimal X server + VLC fullscreen

INSTALL_DIR="/opt/toasttv"
VLC_PORT=9999
export DISPLAY=:0

cleanup() {
    pkill -P $$ cvlc 2>/dev/null || true
    pkill -P $$ Xorg 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT EXIT

# Start minimal X server
# -nolisten tcp: Security (no remote X)
# vt1: Use virtual terminal 1 (console)
# -nocursor: Hide mouse cursor
Xorg :0 -nolisten tcp -nocursor vt1 &
XPID=$!

# Wait for X to be ready
for i in {1..30}; do
    if xdpyinfo -display :0 >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

if ! xdpyinfo -display :0 >/dev/null 2>&1; then
    echo "ERROR: X server failed to start"
    exit 1
fi

# Disable screen blanking / power saving
xset -display :0 -dpms
xset -display :0 s off
xset -display :0 s noblank

# Start VLC fullscreen with RC interface for remote control
cvlc --fullscreen --no-osd --extraintf rc --rc-host localhost:$VLC_PORT &
VLC_PID=$!

# Wait for VLC RC interface
for i in {1..20}; do
    if nc -z localhost $VLC_PORT 2>/dev/null; then
        break
    fi
    sleep 0.5
done

if ! nc -z localhost $VLC_PORT 2>/dev/null; then
    echo "ERROR: VLC RC interface not responding"
    exit 1
fi

echo "X11 + VLC ready on DISPLAY=:0"

# Start ToastTV app
exec $INSTALL_DIR/bin/toasttv
LAUNCHER

chmod +x $INSTALL_DIR/bin/start-toasttv

chmod +x $INSTALL_DIR/bin/toasttv

# --- Create Systemd Service ---
log "Installing systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << SERVICE
[Unit]
Description=ToastTV - Retro TV Experience
Documentation=https://github.com/${REPO_OWNER}/${REPO_NAME}
After=network.target

[Service]
Type=simple
# Run as root to allow starting X server
# NOTE: VLC/Xorg drop privileges internally
User=root
Group=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/bin/start-toasttv
Restart=on-failure
RestartSec=5

# X11 requires access to virtual terminal
TTYPath=/dev/tty1
StandardInput=tty
StandardOutput=journal
StandardError=journal

Environment=NODE_ENV=production
Environment=TOASTTV_DATA=$INSTALL_DIR/data
Environment=TOASTTV_MEDIA=$INSTALL_DIR/media

StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
SERVICE

# --- Set Permissions ---
log "Setting permissions..."
chown -R $SERVICE_NAME:$SERVICE_NAME $INSTALL_DIR

# --- Enable and Start Service ---
log "Starting ToastTV..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

# --- Wait and Health Check ---
sleep 3

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOSTNAME=$(hostname)

if systemctl is-active --quiet $SERVICE_NAME; then
    echo ""
    echo "============================================"
    echo ""
    log "✅ ToastTV installed successfully!"
    echo ""
    echo "   Dashboard:"
    if [[ -n "$IP" ]]; then
        echo "     http://${HOSTNAME}.local:${APP_PORT}"
        echo "     http://${IP}:${APP_PORT}"
    else
        echo "     http://localhost:${APP_PORT}"
    fi
    echo ""
    echo "   Add your videos to:"
    echo "     $INSTALL_DIR/media/videos/"
    echo ""
    echo "   Manage service:"
    echo "     sudo systemctl status $SERVICE_NAME"
    echo "     sudo systemctl restart $SERVICE_NAME"
    echo "     sudo journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "============================================"
else
    error "Service failed to start. Check logs:"
    echo "  sudo journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi
