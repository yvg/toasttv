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
if [[ "$ARCH" != "aarch64" && "$ARCH" != "x86_64" && "$ARCH" != "armv7l" ]]; then
    error "Unsupported architecture: $ARCH"
    error "ToastTV requires ARM64, ARMv7, or x86_64"
    exit 1
fi

if ! command -v apt-get &>/dev/null; then
    error "This installer requires apt-get (Debian/Ubuntu/Raspberry Pi OS)"
    exit 1
fi

echo ""
echo "🍞 ToastTV Installer"
echo "===================="
echo ""

# --- Determine Version ---
if [[ -z "$VERSION" ]]; then
    log "Fetching latest release..."
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest" 2>/dev/null | grep '"tag_name"' | cut -d'"' -f4 || echo "")
fi

if [[ -z "$VERSION" ]]; then
    warn "No releases found, using main branch"
    USE_GIT=true
else
    log "Installing version: $VERSION"
    USE_GIT=false
fi

# --- Install System Dependencies ---
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq vlc ffmpeg curl

# --- Install Bun Runtime ---
if command -v bun &>/dev/null; then
    log "Bun already installed: $(bun --version)"
else
    log "Installing Bun runtime..."
    export BUN_INSTALL="/root/.bun"
    curl -fsSL https://bun.sh/install | bash
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun
    log "Bun installed: $(/usr/local/bin/bun --version)"
fi

# --- Create System User ---
if id -u $SERVICE_NAME &>/dev/null; then
    log "User '$SERVICE_NAME' already exists"
else
    log "Creating system user '$SERVICE_NAME'..."
    useradd -r -s /bin/false -d $INSTALL_DIR $SERVICE_NAME
fi

# --- Create Directory Structure ---
log "Setting up directories..."
mkdir -p $INSTALL_DIR/{app,data,media/videos,media/interludes,bin}

# --- Download Application ---
if [[ "$USE_GIT" == "true" ]]; then
    # Fallback: Clone from git
    log "Downloading from git (main branch)..."
    apt-get install -y -qq git
    
    if [[ -d "$INSTALL_DIR/app/.git" ]]; then
        git -C $INSTALL_DIR/app fetch --depth 1
        git -C $INSTALL_DIR/app reset --hard origin/main
    else
        rm -rf $INSTALL_DIR/app
        git clone --depth 1 ${REPO_URL}.git $INSTALL_DIR/app
    fi
    
    log "Installing dependencies..."
    cd $INSTALL_DIR/app
    /usr/local/bin/bun install --production
else
    # Preferred: Download release tarball
    log "Downloading release tarball..."
    TARBALL_URL="${REPO_URL}/releases/download/${VERSION}/toasttv-${VERSION}.tar.gz"
    
    TMP_DIR=$(mktemp -d)
    curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/toasttv.tar.gz"
    
    # Extract (tarball contains toasttv/ directory)
    rm -rf $INSTALL_DIR/app
    mkdir -p $INSTALL_DIR/app
    tar -xzf "$TMP_DIR/toasttv.tar.gz" -C $INSTALL_DIR/app --strip-components=1
    
    rm -rf "$TMP_DIR"
    log "Downloaded and extracted successfully"
fi

# --- Create Launcher Script ---
log "Creating launcher script..."
cat > $INSTALL_DIR/bin/toasttv << 'LAUNCHER'
#!/bin/bash
#
# ToastTV Launcher - Manages VLC + Application
#

INSTALL_DIR="/opt/toasttv"
VLC_PORT=9999

cleanup() {
    echo "ToastTV shutting down..."
    pkill -P $$ cvlc 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT EXIT

# Start VLC in headless mode with RC interface and logo filter
echo "Starting VLC..."

# Create logo args helper script
mkdir -p $INSTALL_DIR/scripts
cat > $INSTALL_DIR/scripts/vlc-logo-args.ts << 'EOF'
import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'

const dbPath = process.argv[2] || './data/media.db'

if (!existsSync(dbPath)) process.exit(0)

try {
  const db = new Database(dbPath, { readonly: true })
  const get = (k: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | null
    return row?.value
  }

  const enabled = get('logo.enabled') !== 'false'
  const path = get('logo.imagePath')

  if (enabled && path && existsSync(path)) {
    const opacity = get('logo.opacity') || '128'
    const rawPos = parseInt(get('logo.position') || '2', 10)
    const x = parseInt(get('logo.x') || '8', 10)
    const y = parseInt(get('logo.y') || '8', 10)
    
    // ToastTV Position Enum -> VLC Logo Position ID
    const map: Record<number, number> = {
      0: 5, 1: 4, 2: 6,
      3: 1, 4: 0, 5: 2,
      6: 9, 7: 8, 8: 10
    }
    const vlcPos = map[rawPos] ?? 6
    console.log(\`--sub-source=logo --logo-file=\${path} --logo-position=\${vlcPos} --logo-opacity=\${opacity} --logo-x=\${x} --logo-y=\${y}\`)
  }
} catch (e) {}
EOF

LOGO_ARGS=$(/usr/local/bin/bun $INSTALL_DIR/scripts/vlc-logo-args.ts "$INSTALL_DIR/data/media.db")

cvlc --extraintf rc --rc-host localhost:$VLC_PORT $LOGO_ARGS 2>/dev/null &
VLC_PID=$!

# Wait for VLC to be ready
echo "Waiting for VLC..."
for i in {1..20}; do
    if nc -z localhost $VLC_PORT 2>/dev/null; then
        echo "VLC ready on port $VLC_PORT"
        break
    fi
    sleep 0.5
done

if ! nc -z localhost $VLC_PORT 2>/dev/null; then
    echo "ERROR: VLC failed to start on port $VLC_PORT"
    exit 1
fi

# Start the application
echo "Starting ToastTV application..."
cd "$INSTALL_DIR/app"
exec /usr/local/bin/bun run src/main.ts
LAUNCHER

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
User=$SERVICE_NAME
Group=$SERVICE_NAME
WorkingDirectory=$INSTALL_DIR/app
ExecStart=$INSTALL_DIR/bin/toasttv
Restart=on-failure
RestartSec=5

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
