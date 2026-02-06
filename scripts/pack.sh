#!/bin/bash
#
# Pack local ToastTV release for dev testing
# Creates: dist/toasttv-dev.tar.gz
#
# Uses compiled binary approach (requires Bun 1.3.6 for Cortex-A53 compatibility)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

VERSION="dev"
DIST_DIR="dist"
RELEASE_DIR="$DIST_DIR/toasttv"

# Check Bun version (1.3.6 required for Cortex-A53)
BUN_VERSION=$(bun --version 2>/dev/null || echo "0.0.0")
if [[ "$BUN_VERSION" != "1.3.6" ]]; then
    echo "⚠️  Warning: Bun $BUN_VERSION detected. Version 1.3.6 is required for Pi Zero 2 W."
    echo "   Install with: curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.6"
fi

# Clean previous release structure
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "[pack] Building server bundle (Bun 1.3.6 compatible)..."
mkdir -p "$DIST_DIR/bin"
# Build single-file bundle (no runtime included)
bun build --minify --target=bun --outfile="$DIST_DIR/bin/server.js" ./src/main.ts

echo "[pack] Assembling release structure..."

# Bundle (Server Code)
mkdir -p "$RELEASE_DIR/bin"
cp "$DIST_DIR/bin/server.js" "$RELEASE_DIR/bin/"
cp package.json "$RELEASE_DIR/"

# Static Assets
cp -r public "$RELEASE_DIR/"

# Media (Excluded from main tarball, packed separately)
# cp -r media "$RELEASE_DIR/"

# Data (config, logo)
cp -r data "$RELEASE_DIR/"

# Scripts
mkdir -p "$RELEASE_DIR/scripts"
cp scripts/install.sh "$RELEASE_DIR/scripts/"
cp scripts/logo.lua "$RELEASE_DIR/scripts/" 2>/dev/null || true

# Docs
cp README.md "$RELEASE_DIR/"
cp LICENSE "$RELEASE_DIR/" 2>/dev/null || true

echo "[pack] Creating app tarball..."
cd "$DIST_DIR"
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='.DS_Store' -czf "toasttv-${VERSION}.tar.gz" toasttv/

echo "[pack] Creating media tarball..."
cd "$PROJECT_ROOT"
# Pack media folder directly (produces media/videos/...)
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='.DS_Store' -czf "$DIST_DIR/media.tar.gz" media/

echo "[pack] ✅ Created:"
echo "  - App:   $DIST_DIR/toasttv-${VERSION}.tar.gz"
echo "  - Media: $DIST_DIR/media.tar.gz"
