# ToastTV Architecture

## Stack

- **Runtime:** Bun 1.3+
- **Framework:** Hono (HTTP)
- **Database:** SQLite (via bun:sqlite)
- **Playback:** VLC (telnet control)
- **UI:** HTMX + Server-rendered HTML

## Layer Structure

```
Controllers → Services → Repositories → Clients
    ↓            ↓            ↓            ↓
  HTTP      Business      Data        External
  routes    logic         access      systems
```

## File Layout

```
src/
├── main.ts              # Entry point
├── daemon.ts            # Orchestrator, DI
├── server.ts            # Hono app factory
├── controllers/         # HTTP handlers
├── services/            # Business logic
├── repositories/        # SQLite access
├── clients/             # VLC, FFmpeg, CEC
├── templates/           # HTML rendering
└── types.ts             # Shared types
```

## Component Ownership

| Component | Owns |
|-----------|------|
| `PlaybackService` | Current video, playback loop, **off-air state** |
| `PlaylistEngine` | Queue, shuffle, interludes |
| `SessionManager` | Session state, timing, **daily quotas** |
| `MediaRepository` | Media items (DB) |
| `ConfigRepository` | App config |

## Principles

1. **Single Owner** — One component owns each piece of state
2. **Controllers are thin** — Delegate to services
3. **Services don't call controllers** — One-way dependency
4. **Repositories don't contain business logic** — Pure data access
5. **Clients are stateless** — VLC, FFmpeg wrappers

## Data Flow

```
[USB/Folder] → MediaIndexer → SQLite
                    ↓
            PlaylistEngine → Queue
                    ↓
            PlaybackService → VLC → HDMI
```

## Config

Two-tier config:
- **Bootstrap** (`data/config.json`): Paths, ports
- **Runtime** (SQLite): Session limits, interludes
