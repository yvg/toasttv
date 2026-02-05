# ToastTV Makefile

.PHONY: install start dev test typecheck clean help mpv pack serve-local

# Auto-detect bun
BUN := $(shell command -v bun 2>/dev/null || echo "$$HOME/.bun/bin/bun")

# Auto-detect MPV
MPV := $(shell command -v mpv 2>/dev/null || echo "/opt/homebrew/bin/mpv")
MPV_SOCKET := /tmp/toasttv-mpv.sock

help:
	@echo "ToastTV Commands:"
	@echo "  make install      - Install Bun + dependencies (mpv, ffmpeg)"
	@echo "  make start        - Start MPV + daemon"
	@echo "  make dev          - Start with watch mode"
	@echo "  make test         - Run unit tests"
	@echo "  make typecheck    - Run TypeScript type checking"
	@echo "  make mpv          - Start MPV daemon locally"
	@echo "  make pack         - Build local release tarball"
	@echo "  make serve-local  - Pack + start dev server for VM testing"
	@echo "  make clean        - Remove build artifacts"

install:
	@# Install Bun if needed
	@if [ ! -f "$(BUN)" ]; then \
		echo "Installing Bun..."; \
		curl -fsSL https://bun.sh/install | bash; \
	fi
	@# Install MPV if needed
	@if ! command -v mpv >/dev/null 2>&1; then \
		echo "Installing MPV..."; \
		if command -v brew >/dev/null 2>&1; then \
			brew install mpv; \
		elif command -v apt-get >/dev/null 2>&1; then \
			sudo apt-get update && sudo apt-get install -y mpv; \
		else \
			echo "❌ MPV not found. Install manually."; \
			exit 1; \
		fi; \
	fi
	@# Install ffmpeg if needed
	@if ! command -v ffprobe >/dev/null 2>&1; then \
		echo "Installing ffmpeg..."; \
		if command -v brew >/dev/null 2>&1; then \
			brew install ffmpeg; \
		elif command -v apt-get >/dev/null 2>&1; then \
			sudo apt-get update && sudo apt-get install -y ffmpeg; \
		else \
			echo "❌ ffmpeg not found. Install manually."; \
			exit 1; \
		fi; \
	fi
	@$(BUN) install
	@mkdir -p media/videos media/interludes data

mpv:
	@if pgrep -x mpv >/dev/null; then \
		echo "MPV already running"; \
	else \
		echo "Starting MPV daemon..."; \
		$(MPV) --idle --input-ipc-server=$(MPV_SOCKET) --script=scripts/logo.lua --no-terminal &>/dev/null & \
		sleep 1; \
	fi

start: mpv
	@$(BUN) run src/main.ts

dev: mpv
	@$(BUN) --watch run src/main.ts

test:
	@$(BUN) test

typecheck:
	@$(BUN) tsc --noEmit

clean:
	@rm -rf node_modules .bun data/media.db dist
	@pkill -x mpv 2>/dev/null || true

pack:
	@chmod +x scripts/pack.sh
	@./scripts/pack.sh

serve-local: pack
	@$(BUN) run scripts/dev-server.ts
