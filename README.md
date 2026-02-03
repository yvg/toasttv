<p align="center">
  <img src="data/logo.png" alt="ToastTV" width="120">
</p>

# ToastTV

**The warm, crispy, 90s television station for your Raspberry Pi.**

No Netflix menus. No YouTube algorithms. Just cartoons.

## What It Does

- Plays videos in an endless loop via VLC
- Injects interludes (bumpers) between shows
- Session time limits ("bedtime mode")
- Web UI for managing content
- HDMI-CEC support (TV remote → play/pause)

## Quick Start

```bash
make install   # Install Bun, VLC, FFmpeg, dependencies
make start     # Start VLC + server
```

Then open http://localhost:1993

## Development

```bash
make help      # Show all commands
make dev       # Start with watch mode
make test      # Run tests
make typecheck # TypeScript check
make clean     # Remove artifacts
```

## Production (Raspberry Pi)

TODO

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md)

## License

MIT — see [LICENSE](./LICENSE)
