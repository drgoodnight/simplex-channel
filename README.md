# openclaw-channel-simplex

OpenClaw channel plugin for [SimpleX Chat](https://simplex.chat) — the most private messenger.

SimpleX has no user IDs, no phone numbers, no metadata. This plugin makes it a native OpenClaw channel, just like WhatsApp or Telegram — full agent access, memory, tools, workspace.

```
SimpleX App (Phone/Desktop)
        │
        ▼
┌──────────────────────────┐
│  simplex-chat CLI        │  ← Docker container or bare-metal
│  WebSocket server :5225  │
└───────────┬──────────────┘
            │ ws://
            ▼
┌──────────────────────────┐
│  OpenClaw Gateway        │
│  ├─ simplex plugin  ←────── this repo
│  ├─ agent pipeline       │
│  ├─ memory / tools       │
│  └─ other channels       │
└──────────────────────────┘
```

## What you get

- **Full OpenClaw agent** — same brain, memory, and tools as your WhatsApp/Telegram channels
- **Cross-channel continuity** — conversation context shared across all channels
- **Voice messages** — optional local Whisper transcription (no audio leaves your infra)
- **Auto-accept contacts** — or pair manually like other channels
- **DM sessions** — each SimpleX contact gets their own session (`agent:main:simplex:dm:<name>`)

## Prerequisites

1. **OpenClaw** installed and running (bare-metal or Docker)
2. **simplex-chat CLI** running in WebSocket server mode (Docker container included)
3. **Node.js ≥ 22** (already required by OpenClaw)

## Install

### 1. Get the plugin into OpenClaw's extensions directory

```bash
# Clone into OpenClaw's extensions path
cd ~/.openclaw/extensions
git clone https://github.com/YOUR_USER/openclaw-channel-simplex.git simplex
cd simplex
npm install
```

Or use the OpenClaw CLI:
```bash
openclaw plugins install -l /path/to/openclaw-channel-simplex
```

### 2. Start the SimpleX CLI

The SimpleX CLI is a Haskell binary that holds your SimpleX identity and contacts. It runs as a WebSocket server that the plugin connects to.

**Option A — Docker (recommended):**
```bash
cd /path/to/openclaw-channel-simplex
docker compose up -d simplex-cli
```

**Option B — Bare-metal:**
```bash
# Install simplex-chat CLI
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash

# Run in WebSocket server mode
simplex-chat -p 5225
```

### 3. Configure OpenClaw

Add to your `openclaw.json`:

```json
{
  "channels": {
    "simplex": {
      "wsUrl": "ws://localhost:5225",
      "autoAccept": true
    }
  }
}
```

### 4. Restart the gateway

```bash
openclaw gateway restart
```

### 5. Connect from your phone

Get the bot's SimpleX address:
```bash
# The agent can create this, or via CLI:
docker compose exec simplex-cli simplex-chat
# Then type: /address
```

Scan the QR code or paste the address into your SimpleX app → "Connect via link".

## Voice Messages (Optional)

For local Whisper transcription of voice messages:

### Start the Whisper sidecar:
```bash
docker compose --profile whisper up -d
```

### Enable in config:
```json
{
  "channels": {
    "simplex": {
      "wsUrl": "ws://localhost:5225",
      "whisper": {
        "enabled": true,
        "apiUrl": "http://localhost:9000/transcribe"
      }
    }
  }
}
```

### Whisper model selection

Set `WHISPER_MODEL` in your environment or `docker-compose.yml`:

| Model | RAM | Best for |
|-------|-----|----------|
| `tiny` | ~1 GB | Quick, English-only |
| `base` | ~1 GB | **Default** — good accuracy |
| `small` | ~2 GB | Better with accents |
| `medium` | ~5 GB | Great accuracy |
| `large-v3` | ~10 GB | Best (GPU recommended) |

## Configuration Reference

All config goes under `channels.simplex` in `openclaw.json`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `wsUrl` | string | `ws://localhost:5225` | SimpleX CLI WebSocket URL |
| `displayName` | string | `openclaw` | Bot profile name in SimpleX |
| `autoAccept` | boolean | `true` | Auto-accept contact requests |
| `whisper.enabled` | boolean | `false` | Enable voice transcription |
| `whisper.apiUrl` | string | `http://localhost:9000/transcribe` | Whisper service URL |

## Architecture

This is a **native OpenClaw channel plugin** — it runs inside the gateway process, not as a separate bridge. The flow is:

1. **simplex-chat CLI** runs as a WebSocket server (Docker or bare-metal)
2. **This plugin** connects to the CLI via WebSocket from inside the OpenClaw gateway
3. **Inbound messages** are parsed and dispatched through OpenClaw's auto-reply system → agent pipeline
4. **Agent responses** are sent back through the plugin's `outbound.sendText` → SimpleX CLI → your phone

This means you get the full OpenClaw stack: persistent memory, tool execution, workspace files, browser control, cron jobs, and cross-channel context sharing.

## Project Structure

```
├── package.json              # npm manifest + OpenClaw plugin metadata
├── openclaw.plugin.json      # Config schema for validation
├── src/
│   ├── index.ts              # Plugin entry — register + startup
│   ├── channel.ts            # Channel definition (outbound.sendText, config)
│   ├── monitor.ts            # Inbound message handling + auto-reply dispatch
│   ├── simplex-cli.ts        # WebSocket client for simplex-chat CLI
│   ├── parser.ts             # Extract messages from SimpleX event structures
│   ├── whisper.ts            # Optional Whisper transcription client
│   ├── runtime.ts            # Plugin API reference bridge
│   └── types.ts              # TypeScript type definitions
├── docker-compose.yml        # SimpleX CLI + Whisper sidecars
└── docker/
    ├── simplex-cli/          # SimpleX CLI container
    └── whisper/              # Whisper transcription container
```

## Backup

The SimpleX CLI data directory contains your identity and all contacts. **Loss = new identity, all contacts gone.**

```bash
# Stop CLI, backup volume, restart
docker compose stop simplex-cli
docker run --rm -v simplex-channel_simplex-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/simplex-backup-$(date +%Y%m%d).tar.gz -C /data .
docker compose start simplex-cli
```

## Security Notes

- SimpleX CLI data = private keys. Treat like SSH keys.
- The plugin runs in-process with OpenClaw — it has the same trust level as any other channel.
- Whisper runs fully offline — no audio leaves your infrastructure.
- Don't expose port 5225 to the public internet. Use localhost or Tailscale only.

## Status

**Alpha** — the core integration point (`runtime.handleAutoReply()` in `monitor.ts`) needs validation against the actual OpenClaw runtime API. The exact method signature may differ between OpenClaw versions. Everything else (SimpleX CLI connection, message parsing, outbound delivery, voice transcription) is production-ready.

## License

MIT
