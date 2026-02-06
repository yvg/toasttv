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
INSTALL_DIR="/opt/toasttv"
SERVICE_NAME="toasttv"
APP_PORT=1993
TOTAL_STEPS=7
CURRENT_STEP=0

# Allow overriding URLs for local dev testing
REPO_URL="${LOCAL_SERVER:-https://github.com/${REPO_OWNER}/${REPO_NAME}}"
API_URL="${LOCAL_SERVER:-https://api.github.com}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Install Steps ---
TOTAL_STEPS=8
CURRENT_STEP=0

# Progress helpers
step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo -e "${BOLD}[${CURRENT_STEP}/${TOTAL_STEPS}] $1${NC}"
}

log() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
error() { echo -e "  ${RED}✗${NC} $1" >&2; }
info() { echo -e "  ${CYAN}→${NC} $1"; }

# --- Uninstall Mode ---
if [[ "$1" == "--uninstall" ]]; then
    echo ""
    echo -e "${BOLD}Uninstalling ToastTV...${NC}"
    
    systemctl stop $SERVICE_NAME 2>/dev/null || true
    systemctl disable $SERVICE_NAME 2>/dev/null || true
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    
    rm -rf $INSTALL_DIR/bin
    rm -rf $INSTALL_DIR/public
    rm -rf $INSTALL_DIR/scripts
    
    if [[ -d "$INSTALL_DIR/data" ]] || [[ -d "$INSTALL_DIR/media" ]]; then
        warn "Kept user data at: $INSTALL_DIR/data and $INSTALL_DIR/media"
        warn "To remove completely: sudo rm -rf $INSTALL_DIR"
    fi
    
    userdel $SERVICE_NAME 2>/dev/null || true
    
    echo ""
    log "ToastTV uninstalled!"
    exit 0
fi

# --- Header ---
echo ""
echo -e "${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        🍞 ToastTV Installer            ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════╝${NC}"

# --- Pre-flight Checks ---
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Try: sudo bash install.sh"
    exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" ]]; then
    error "Unsupported architecture: $ARCH"
    error "ToastTV requires a 64-bit ARM OS (aarch64)."
    exit 1
fi

# --- Determine Version ---
step "Checking for updates"
if [[ -z "$VERSION" ]]; then
    info "Fetching latest release..."
    VERSION=$(curl -fsSL "${API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" 2>/dev/null | grep '"tag_name"' | cut -d'"' -f4 || echo "")
fi

if [[ -z "$VERSION" ]]; then
    error "Could not determine latest version. Please check internet connection."
    exit 1
fi
log "Version: $VERSION"

# --- Install System Dependencies ---
step "Installing system dependencies"
info "Checking system dependencies..."
# apt-get update -qq  <-- Removed eager update

PACKAGES="mpv ffmpeg"
for pkg in $PACKAGES; do
    printf "    %-12s" "$pkg"
    if dpkg -s "$pkg" >/dev/null 2>&1; then
        echo -e "${YELLOW}(already installed)${NC}"
    else
        # Lazy update: only update if we actually need to install something
        if [ ! -f /tmp/apt_updated ]; then
             echo -e "${CYAN}(updating apt...)${NC}"
             apt-get update -qq
             touch /tmp/apt_updated
        fi

        if apt-get install -y -qq "$pkg" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}failed${NC}"
            exit 1
        fi
    fi
done
log "System dependencies ready"

# --- Create System User ---
step "Configuring system user"
if id -u $SERVICE_NAME &>/dev/null; then
    log "User '$SERVICE_NAME' already exists"
    usermod -s /bin/bash $SERVICE_NAME
else
    info "Creating system user..."
    useradd -r -s /bin/bash -d $INSTALL_DIR $SERVICE_NAME
    log "User '$SERVICE_NAME' created"
fi

usermod -a -G audio,video,render $SERVICE_NAME
log "Permissions granted (audio, video, render)"

# --- Install Bun Runtime (Decoupled) ---
step "Checking Bun runtime"
BUN_INSTALL_DIR="/opt/toasttv/.bun"
export BUN_INSTALL="$BUN_INSTALL_DIR"

if [[ -x "$BUN_INSTALL_DIR/bin/bun" ]]; then
    CURRENT_BUN=$($BUN_INSTALL_DIR/bin/bun --version)
    if [[ "$CURRENT_BUN" == "1.3.6" ]]; then
        echo -e "${YELLOW}(Bun $CURRENT_BUN already installed)${NC}"
    else
        echo -e "${CYAN}Bun $CURRENT_BUN detected. Downgrading to 1.3.6 for Pi Zero 2 W compatibility...${NC}"
        curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.6 >/dev/null 2>&1
    fi
else
    info "Installing Bun 1.3.6 (required for ARM64 compatibility)..."
    curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.6 >/dev/null 2>&1
    log "Bun 1.3.6 installed"
fi

# --- Download Application ---
step "Downloading ToastTV $VERSION"
# Strip 'v' prefix for filename consistency (e.g. v0.3.0 -> 0.3.0)
CLEAN_VERSION="${VERSION#v}"
TARBALL_URL="${REPO_URL}/releases/download/${VERSION}/toasttv-${CLEAN_VERSION}.tar.gz"
TMP_DIR=$(mktemp -d)

info "Downloading tarball..."
echo "  $TARBALL_URL"
curl -f# "$TARBALL_URL" -o "$TMP_DIR/toasttv.tar.gz"
log "Download complete"

# --- Install Application ---
step "Installing application"

# Cleanup old installation
rm -rf $INSTALL_DIR/bin $INSTALL_DIR/public $INSTALL_DIR/scripts
mkdir -p $INSTALL_DIR/{bin,data,media/videos,media/interludes,scripts}

# Extract (use -m to ignore timestamps/clock skew)
info "Extracting files..."
tar -mxzf "$TMP_DIR/toasttv.tar.gz" -C $INSTALL_DIR

# Install Server Bundle
if [[ -f "$INSTALL_DIR/toasttv/bin/server.js" ]]; then
    mv $INSTALL_DIR/toasttv/bin/server.js $INSTALL_DIR/bin/server.js
    mv $INSTALL_DIR/toasttv/package.json $INSTALL_DIR/ 2>/dev/null || true
    log "Server bundle installed"
else
    # Fallback for old binaries (safety)
    if [[ -f "$INSTALL_DIR/toasttv/toasttv" ]]; then
        mv $INSTALL_DIR/toasttv/toasttv $INSTALL_DIR/bin/toasttv
        chmod +x $INSTALL_DIR/bin/toasttv
        log "Binary installed (legacy)"
    fi
fi

# Static Assets
if [[ -d "$INSTALL_DIR/toasttv/public" ]]; then
    mv $INSTALL_DIR/toasttv/public $INSTALL_DIR/public
fi

# Remote source variables
SRC_DATA="$INSTALL_DIR/toasttv/data"

# Install/Seed Starter Media (from separate tarball if needed)
NEED_VIDEOS=false
NEED_INTERLUDES=false

if [[ -z "$(ls -A $INSTALL_DIR/media/videos 2>/dev/null)" ]]; then NEED_VIDEOS=true; fi
if [[ -z "$(ls -A $INSTALL_DIR/media/interludes 2>/dev/null)" ]]; then NEED_INTERLUDES=true; fi

# Strict check: Only download media if BOTH are empty (fresh install or nuclear wipe)
if $NEED_VIDEOS && $NEED_INTERLUDES; then
    step "Downloading starter media"
    MEDIA_URL="${REPO_URL}/releases/download/${VERSION}/media.tar.gz"
    if curl -f# "$MEDIA_URL" -o "$TMP_DIR/media.tar.gz"; then
        info "Extracting media..."
        # Extract to media_tmp first so we don't overwrite blindly (use -m for timestamps)
        mkdir -p "$TMP_DIR/media_extracted"
        tar -mxzf "$TMP_DIR/media.tar.gz" -C "$TMP_DIR/media_extracted"
        
        SRC_MEDIA="$TMP_DIR/media_extracted/media"

        # Seed EVERYTHING (All or Nothing)
        if [[ -d "$SRC_MEDIA/videos" ]]; then
            cp $SRC_MEDIA/videos/* $INSTALL_DIR/media/videos/ 2>/dev/null || true
            log "Starter videos seeded"
        fi

        if [[ -d "$SRC_MEDIA/interludes" ]]; then
            cp $SRC_MEDIA/interludes/* $INSTALL_DIR/media/interludes/ 2>/dev/null || true
            log "Starter interludes seeded"
        fi
    else
        echo -e "${YELLOW}Warning: Starter media not found (media.tar.gz). Skipping.${NC}"
    fi
else
    log "Media library already populated (skipping download)"
fi

# Install/Seed Data (Config/Logo/MPV)
if [[ -d "$SRC_DATA" ]]; then
    for file in "$SRC_DATA"/*; do
        filename=$(basename "$file")
        
        # Files to ALWAYS overwrite (App configuration/assets)
        if [[ "$filename" == "mpv.conf" ]] || [[ "$filename" == "logo.png" ]]; then
             cp -r "$file" "$INSTALL_DIR/data/"
             log "Updated $filename"
             continue
        fi

        # Files to PRESERVE (User data)
        # config.json, media.db
        if [[ ! -e "$INSTALL_DIR/data/$filename" ]]; then
            cp -r "$file" "$INSTALL_DIR/data/"
        else
            info "Preserved user data: $filename"
        fi
    done
fi

# --- Audio Auto-Magic ---
USER_CONF="$INSTALL_DIR/data/user.conf"
if [[ -f "$USER_CONF" ]] && command -v aplay >/dev/null; then
    # Only try to help if user hasn't already configured audio
    if ! grep -q "^audio-device=" "$USER_CONF"; then
        AUDIO_DETECTED=false
        
        # 1. Detect HDMI (Raspberry Pi Standard)
        if aplay -l 2>/dev/null | grep -q "vc4hdmi"; then
             # Prefer sysdefault for HDMI as it handles plugvents better
             echo "" >> "$USER_CONF"
             echo "audio-device=alsa/sysdefault:CARD=vc4hdmi" >> "$USER_CONF"
             echo -e "  ${MAGENTA}🪄  Auto-configured Audio: HDMI (vc4hdmi)${NC}"
             AUDIO_DETECTED=true
        
        # 2. Detect Headphone Jack / USB Stick
        elif aplay -l 2>/dev/null | grep -q "Headphones"; then
             echo "" >> "$USER_CONF"
             echo "audio-device=alsa/sysdefault:CARD=Headphones" >> "$USER_CONF"
             echo -e "  ${MAGENTA}🪄  Auto-configured Audio: Headphones${NC}"
             AUDIO_DETECTED=true
        fi
        
        if $AUDIO_DETECTED; then
             log "Updated user.conf with detected audio device"
        fi
    fi
fi

# Install Scripts (logo.lua)
if [[ -f "$INSTALL_DIR/toasttv/scripts/logo.lua" ]]; then
    cp $INSTALL_DIR/toasttv/scripts/logo.lua $INSTALL_DIR/scripts/
fi

# Cleanup
rm -rf $INSTALL_DIR/toasttv "$TMP_DIR"
log "Application installed"

# --- Configure Service ---
step "Configuring service"
info "Creating launcher script..."

cat > $INSTALL_DIR/bin/start-toasttv << 'LAUNCHER'
#!/bin/bash
# ToastTV Launcher (MPV + Binary)

INSTALL_DIR="/opt/toasttv"
MPV_SOCKET="/tmp/toasttv-mpv.sock"
APP_PORT=1993

# Write info file for OSD
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "ToastTV" > /tmp/toasttv-info
if [ -n "$IP" ]; then
    echo "Dashboard: http://${IP}:${APP_PORT}" >> /tmp/toasttv-info
else
    echo "Dashboard: http://localhost:${APP_PORT}" >> /tmp/toasttv-info
fi

# 1. Start MPV in background
rm -f $MPV_SOCKET
echo "Starting MPV daemon..."
mpv --idle --input-ipc-server=$MPV_SOCKET --include=$INSTALL_DIR/data/mpv.conf --vo=gpu --gpu-context=drm --hwdec=auto --script=$INSTALL_DIR/scripts/logo.lua --no-terminal > /tmp/mpv.log 2>&1 &
MPV_PID=$!

# Wait for socket
echo "Waiting for MPV socket..."
for i in {1..20}; do
    if ! kill -0 $MPV_PID 2>/dev/null; then
        echo "MPV died unexpectedly. Check /tmp/mpv.log"
        exit 1
    fi
    if [ -S $MPV_SOCKET ]; then 
        echo "MPV socket ready."
        break 
    fi
    sleep 0.5
done

# 2. Start Application
echo "Starting ToastTV App..."
echo "🍞 ToastTV starting..."

# Run with local Bun
export BUN_INSTALL="/opt/toasttv/.bun"
$BUN_INSTALL/bin/bun run $INSTALL_DIR/bin/server.js

# Cleanup when app exits
echo "Stopping MPV..."
kill $MPV_PID 2>/dev/null
LAUNCHER

chmod +x $INSTALL_DIR/bin/start-toasttv

# Systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service << SERVICE
[Unit]
Description=ToastTV - Retro TV Experience
Documentation=https://github.com/${REPO_OWNER}/${REPO_NAME}
After=network.target sound.target

[Service]
Type=simple
User=$SERVICE_NAME
Group=$SERVICE_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/bin/start-toasttv
Restart=on-failure
RestartSec=5
TimeoutStopSec=5

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

log "Service configured"

# --- Set Permissions ---
chown -R $SERVICE_NAME:$SERVICE_NAME $INSTALL_DIR

# --- Start Service ---
step "Starting ToastTV"
systemctl daemon-reload
systemctl enable $SERVICE_NAME &>/dev/null
systemctl restart $SERVICE_NAME

info "Waiting for dashboard to be ready..."

# Wait up to 30 seconds for HTTP server to respond
# Wait up to 30 seconds for HTTP server to respond
READY=false
for i in {1..30}; do
    # Check if service is still running
    STATUS=$(systemctl is-active $SERVICE_NAME)
    if [[ "$STATUS" == "failed" ]] || [[ "$STATUS" == "inactive" ]]; then
        echo ""
        error "Service crashed during startup. Logs:"
        journalctl -u $SERVICE_NAME -n 20 --no-pager
        break
    fi

    # Check HTTP
    if curl -sf "http://localhost:${APP_PORT}/" >/dev/null 2>&1; then
        READY=true
        break
    fi
    
    # Progress feedback with status
    printf "\rWaiting for dashboard... [%d/30] (Status: $STATUS)" "$i"
    sleep 1
done
echo ""
echo ""

if ! $READY; then
    echo -e "${RED}Startup timed out.${NC} Last logs:"
    journalctl -u $SERVICE_NAME -n 15 --no-pager
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOSTNAME=$(hostname)

if $READY; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║       ✅ Installation Complete!        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Dashboard:${NC}"
    if [[ -n "$IP" ]]; then
        echo "    http://${HOSTNAME}.local:${APP_PORT}"
        echo "    http://${IP}:${APP_PORT}"
    else
        echo "    http://localhost:${APP_PORT}"
    fi
    echo ""
    echo -e "  ${BOLD}Add videos:${NC}"
    echo "    $INSTALL_DIR/media/videos/"
    echo ""
    echo -e "  ${BOLD}Manage:${NC}"
    echo "    sudo systemctl status $SERVICE_NAME"
    echo "    sudo journalctl -u $SERVICE_NAME -f"
    echo ""
else
    error "Dashboard not responding after 30 seconds. Check logs:"
    echo "  sudo journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

