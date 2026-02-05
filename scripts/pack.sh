#!/bin/bash
#
# Pack local ToastTV release for dev testing
# Creates: dist/toasttv-dev.tar.gz
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

VERSION="dev"
DIST_DIR="dist"
RELEASE_DIR="$DIST_DIR/toasttv"

# Clean previous release structure (but preserve bin)
rm -rf "$RELEASE_DIR"

echo "[pack] Building binary for linux-arm64..."
mkdir -p "$DIST_DIR/bin"
bun build --compile --minify --bytecode --target=bun-linux-arm64 --outfile="$DIST_DIR/bin/toasttv" ./src/main.ts

echo "[pack] Assembling release structure..."
mkdir -p "$RELEASE_DIR"

# Binary
cp "$DIST_DIR/bin/toasttv" "$RELEASE_DIR/"

# Assets
cp -r public "$RELEASE_DIR/"
cp -r media "$RELEASE_DIR/"
cp -r data "$RELEASE_DIR/"

# Scripts
mkdir -p "$RELEASE_DIR/scripts"
cp scripts/install.sh "$RELEASE_DIR/scripts/"
cp scripts/logo.lua "$RELEASE_DIR/scripts/" 2>/dev/null || true

# Docs
cp README.md "$RELEASE_DIR/"
cp LICENSE "$RELEASE_DIR/" 2>/dev/null || true

echo "[pack] Creating tarball..."
cd "$DIST_DIR"
COPYFILE_DISABLE=1 tar -czvf "toasttv-${VERSION}.tar.gz" toasttv/

echo "[pack] ✅ Created $DIST_DIR/toasttv-${VERSION}.tar.gz"
