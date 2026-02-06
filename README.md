# <img src="data/logo.png" alt="ToastTV logo" width="80" height="80" valign="middle"> ToastTV

**The warm, crispy, 90s TV experience for your Raspberry Pi.**

No more "what should we watch?" — **Turn it on, and the station is already running.**

The anti-algorithm for tired parents and kids who just want to watch cartoons.

<img src="docs/toasttv_hero.png" alt="A picture of 3 kids watching cartoons on a TV in a cozy 90s living room" />

## Install (Raspberry Pi)

```bash
curl -fsSL https://raw.githubusercontent.com/yvg/toasttv/main/scripts/install.sh | sudo bash
```

## Getting Started

Once installed, your station needs content:

- **Web UI**: Upload videos directly at `http://<your-pi-ip>:1993`
- **Manual**: Copy files to `/opt/toasttv/media/videos/` and restart

## Broadcast Control Center

The dashboard puts you in the director's chair:

### Library Management
Upload videos, categorize content, and toggle interludes instantly.

<img src="docs/library.png" alt="Library Management" width="100%">

### Bedtime Enforcement
One tap to "Sign Off" manually, or set automatic daily limits.

<img src="docs/off_air.png" alt="Bedtime Enforcement" width="100%">

## Why It's Better Than a Playlist

- **Smart Channel Engine**: ToastTV builds a dynamic "Channel" schedule: `[Intro] → [Video] → [Video] → [Interlude] → [Video]`.
- **Screen Time Limits**: Set a daily quota (e.g. 45 mins). When time is up, the station plays the sign-off sequence and stops. No arguments.
- **Seasonal Awareness**: Christmas interludes in December, Spooky bumpers in October. The engine tracks dates automatically—zero config required.
- **Native MPV Power**: Plays MKV, AVI, MP4 directly with hardware acceleration (DRM/KMS). No transcoding, no buffering, rock-solid sync.
- **Living Room Ready**: No keyboard needed. Control playback with your **TV remote** via HDMI-CEC.

### TV Remote Control (HDMI-CEC)

ToastTV listens for HDMI-CEC commands from your TV remote:

| Button | Action |
|--------|--------|
| **SELECT / OK** | Start playback or toggle pause |
| **RIGHT →** | Skip to next video |
| **PLAY** | Start playback |
| **PAUSE** | Pause video |

> **Note**: CEC support varies by TV. Arrow keys and SELECT typically work best.

### Starter Content

ToastTV works out of the box. It includes a full "broadcast day" so you can test the flow immediately:

Three episodes of **[Caminandes](https://studio.blender.org/films/caminandes-1/)** (by Blender Studio, CC-BY) are included.

The mascots **Penny & Chip** are ready to run your station.
- **Good morning!** — Penny signs on.
- **Bumpers** — Chip keeps the flow moving.
- **Bedtime** — Penny signs off.
- **Seasonal** — They even celebrate holidays.

<img src="docs/penny_and_chip.png" alt="Penny & Chip" width="400">




## Tech Stack

See [ARCHITECTURE.md](./ARCHITECTURE.md) for tech stack, and design decisions.

## Development

```bash
make install   # Install Bun, MPV, FFmpeg
make start     # Start MPV + server
make dev       # Start with watch mode
make test      # Run tests
```

### Simulator Testing

Test the install flow locally using a Raspberry Pi VM (or any ARM64 VM):

```bash
# On your computer: start the dev server
make serve-local

# In the VM: curl install from your computer
curl -fsSL http://<computer-ip>:3000/install.sh | sudo LOCAL_SERVER=http://<computer-ip>:3000 bash
```

This builds a fresh tarball and serves it via a local HTTP server that mocks GitHub release endpoints.

## License

MIT
