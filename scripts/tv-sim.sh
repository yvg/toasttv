#!/bin/bash
#
# ToastTV TV Simulator
# Simulates CEC events for black-box testing in VM
#
# Usage: ./tv-sim.sh <command>
#

set -e

# Trigger files (mock binaries watch these)
CEC_TRIGGER="/tmp/toasttv-cec-trigger"
# Power state for heartbeat queries
POWER_STATE="/tmp/toasttv-power-state"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

show_help() {
    echo ""
    echo "ToastTV TV Simulator"
    echo ""
    echo "Usage: ./tv-sim.sh <command>"
    echo ""
    echo "Commands:"
    echo "  setup        Install mock cec-client (requires sudo)"
    echo "  on           Simulate TV power on"
    echo "  off          Simulate TV standby"
    echo "  status       Show current simulated state"
    echo ""
}

cmd_setup() {
    info "Installing mock cec-client..."
    
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    
    # Create trigger files
    touch "$CEC_TRIGGER"
    echo "standby" > "$POWER_STATE"
    chmod 666 "$CEC_TRIGGER" "$POWER_STATE"
    
    # Install mock binary
    if [[ -f "$SCRIPT_DIR/mock-cec-client" ]]; then
        sudo cp "$SCRIPT_DIR/mock-cec-client" /usr/local/bin/cec-client
    elif [[ -f "$SCRIPT_DIR/vm-testing/mock-cec-client" ]]; then
        sudo cp "$SCRIPT_DIR/vm-testing/mock-cec-client" /usr/local/bin/cec-client
    fi
    sudo chmod +x /usr/local/bin/cec-client
    
    log "Mock cec-client installed to /usr/local/bin/cec-client"
    log "Trigger files created in /tmp/"
    echo ""
    
    # Configure systemd service
    if systemctl list-units --type=service | grep -q toasttv; then
        info "Restarting toasttv service..."
        systemctl restart toasttv
        log "ToastTV service restarted"
    else
        warn "ToastTV service not found, skipping restart"
    fi
}

cmd_on() {
    info "Simulating TV ON..."
    
    # Set power state for heartbeat queries
    echo "on" > "$POWER_STATE"
    
    # CEC: Power on + Active source
    echo ">> 0f:04" >> "$CEC_TRIGGER"
    sleep 0.1
    echo "<< 1f:82:10:00" >> "$CEC_TRIGGER"
    
    log "TV ON event sent (power state: on)"
}

cmd_off() {
    info "Simulating TV OFF..."
    
    # Set power state for heartbeat queries
    echo "standby" > "$POWER_STATE"
    
    # CEC: Standby
    echo ">> 0f:36" >> "$CEC_TRIGGER"
    
    log "TV OFF (standby) event sent"
}

cmd_status() {
    echo ""
    echo "TV Simulator Status"
    echo "-------------------"
    
    if [[ -f "$POWER_STATE" ]]; then
        STATE=$(cat "$POWER_STATE")
        echo "Power State: $STATE"
    else
        echo "Power State: (not initialized - run './tv-sim.sh setup')"
    fi
    
    if [[ -x /usr/local/bin/cec-client ]]; then
        echo "Mock cec-client: installed"
    else
        echo "Mock cec-client: not installed"
    fi
    echo ""
}

# Main
case "${1:-}" in
    setup)      cmd_setup ;;
    on)         cmd_on ;;
    off)        cmd_off ;;
    status)     cmd_status ;;
    *)          show_help ;;
esac
