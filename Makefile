# ToastTV Makefile

.PHONY: install start dev test typecheck clean help vlc

# Auto-detect bun
BUN := $(shell command -v bun 2>/dev/null || echo "$$HOME/.bun/bin/bun")

# Auto-detect VLC
VLC := $(shell command -v vlc 2>/dev/null || echo "/Applications/VLC.app/Contents/MacOS/VLC")

help:
	@echo "ToastTV Commands:"
	@echo "  make install    - Install Bun + dependencies"
	@echo "  make start      - Start VLC + daemon"
	@echo "  make dev        - Start with watch mode"
	@echo "  make test       - Run unit tests"
	@echo "  make typecheck  - Run TypeScript type checking"
	@echo "  make vlc        - Start VLC with RC interface"
	@echo "  make clean      - Remove build artifacts"

install:
	@# Install Bun if needed
	@if [ ! -f "$(BUN)" ]; then \
		echo "Installing Bun..."; \
		curl -fsSL https://bun.sh/install | bash; \
	fi
	@# Install VLC if needed
	@if ! command -v vlc >/dev/null 2>&1 && [ ! -f "$(VLC)" ]; then \
		echo "Installing VLC..."; \
		if command -v brew >/dev/null 2>&1; then \
			brew install --cask vlc; \
		elif command -v apt-get >/dev/null 2>&1; then \
			sudo apt-get update && sudo apt-get install -y vlc; \
		else \
			echo "❌ VLC not found. Install manually."; \
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

vlc:
	@if pgrep -x vlc >/dev/null; then \
		echo "VLC already running"; \
	else \
		echo "Starting VLC with RC interface..."; \
		$(VLC) --extraintf rc --rc-host localhost:9999 &>/dev/null & \
		sleep 1; \
	fi

start: vlc
	@$(BUN) run src/main.ts

dev: vlc
	@$(BUN) --watch run src/main.ts

test:
	@$(BUN) test

typecheck:
	@$(BUN) tsc --noEmit

clean:
	@rm -rf node_modules .bun data/media.db
	@pkill -x vlc 2>/dev/null || true
