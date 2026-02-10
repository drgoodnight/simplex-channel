# SimpleX Chat Channel for OpenClaw

OpenClaw channel plugin for [SimpleX Chat](https://simplex.chat) — private messaging with full agent access, memory, tools, and cross-channel continuity.

No user IDs. No phone numbers. No metadata. Full agent.

---

## How It Works

```
SimpleX App (Phone)
        │
        ▼
┌──────────────────────────────┐
│   simplex-chat CLI           │
│   (WebSocket server :5225)   │
└──────────┬───────────────────┘
           │ ws://localhost:5225
           ▼
┌──────────────────────────────┐
│   OpenClaw Gateway           │
│   └─ simplex plugin          │
│       ├─ monitor.ts (inbound)│
│       └─ channel.ts (outbound│)
└──────────┬───────────────────┘
           │
           ▼
     LLM API (GPT / Claude)
```

The plugin connects to the SimpleX CLI via WebSocket, receives inbound messages, and dispatches them through OpenClaw's standard reply pipeline — the same path used by Telegram, WhatsApp, and every other channel. This gives SimpleX contacts full access to the agent's memory, tools, workspace, and skills.

---

## Prerequisites

- **OpenClaw** installed and running (`openclaw gateway status`)
- **Node.js ≥ 22** (already required by OpenClaw)
- **simplex-chat CLI** running in WebSocket server mode (setup below)

---

## Step 1: Set Up the SimpleX CLI

The SimpleX CLI is the headless chat client that bridges your phone to the server. You have two options: install it directly on the host (recommended) or run it in Docker.

### Option A: Docker Container (Recommended)

This is the battle-tested approach. The included Docker container handles first-run profile creation automatically and keeps the SimpleX CLI isolated.

```bash
cd ~/.openclaw/extensions/simplex

# Set your display name (what contacts see) — default is "openclaw"
SIMPLEX_DISPLAY_NAME=nerp docker compose up -d simplex-cli

# Watch the logs until you see "Starting SimpleX CLI on port 5225"
docker compose logs -f simplex-cli
```

**First run** takes ~30 seconds — the entrypoint creates the user profile, waits for the database, then restarts cleanly in WebSocket server mode.

**Verify it's healthy:**

```bash
docker compose ps
# Should show: simplex-cli   Up (healthy)

docker ps --filter name=simplex-cli
```

**Get your contact address** (needed to connect from your phone):

```bash
docker exec -it simplex-cli simplex-chat -e '/address'
```

If no address exists yet, create one:

```bash
docker exec -it simplex-cli simplex-chat -e '/address create'
```

Copy the `simplex://` link — you'll paste this into the SimpleX app on your phone.

> **Troubleshooting:** If the container restart-loops on first run with "Address already in use", the init process didn't release the port fast enough. Run `docker compose down && docker compose up -d simplex-cli` — the profile already exists in the volume so second boot is clean.

### Option B: Bare-Metal Install

If you prefer running without Docker.

**Download the binary:**

```bash
# For x86_64 (most VPS):
curl -fsSL "https://github.com/simplex-chat/simplex-chat/releases/download/v6.4.1/simplex-chat-ubuntu-24_04-x86-64" \
  -o ~/.local/bin/simplex-chat
chmod +x ~/.local/bin/simplex-chat

# For ARM64:
curl -fsSL "https://github.com/simplex-chat/simplex-chat/releases/download/v6.4.1/simplex-chat-ubuntu-24_04-aarch64" \
  -o ~/.local/bin/simplex-chat
chmod +x ~/.local/bin/simplex-chat
```

> Check [SimpleX releases](https://github.com/simplex-chat/simplex-chat/releases) for the latest version.

**First run — create your profile interactively:**

```bash
simplex-chat -p 5225
```

You'll be prompted for a display name (e.g., `nerp`, `openclaw`, whatever you want contacts to see). Enter it, then type `/address` to create your contact address. Copy the link — you'll need it to connect from your phone.

Press Ctrl+C to stop.

**Create a systemd service for 24/7 operation:**

```bash
cat > ~/.config/systemd/user/simplex-chat.service << 'EOF'
[Unit]
Description=SimpleX Chat CLI (WebSocket mode)
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/simplex-chat -p 5225
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now simplex-chat.service
```

**Verify it's running:**

```bash
systemctl --user status simplex-chat.service
# Should show "active (running)"

# Test the WebSocket port:
ss -tlnp | grep 5225
```

---

## Step 2: Install the Plugin

```bash
# Clone into OpenClaw's extensions directory
mkdir -p ~/.openclaw/extensions
cd ~/.openclaw/extensions
git clone https://github.com/YOUR_USER/simplex-channel.git simplex
cd simplex
npm install
```

---

## Step 3: Configure OpenClaw

Edit `~/.openclaw/openclaw.json` and add the simplex plugin under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      },
      "simplex": {
        "enabled": true,
        "config": {
          "wsUrl": "ws://localhost:5225",
          "autoAccept": true
        }
      }
    }
  }
}
```

> **Important:** The config goes under `plugins.entries.simplex.config`, NOT under `channels.simplex`. OpenClaw treats plugin channels differently from built-in ones.

**Full config options:**

| Key | Default | Description |
|-----|---------|-------------|
| `wsUrl` | `ws://localhost:5225` | SimpleX CLI WebSocket URL |
| `displayName` | `openclaw` | Name shown in agent context |
| `autoAccept` | `true` | Auto-accept contact requests |
| `whisper.enabled` | `false` | Enable voice transcription |
| `whisper.apiUrl` | `http://localhost:9000/transcribe` | Whisper server URL |

---

## Step 4: Restart and Connect

```bash
openclaw gateway restart
```

You should see in the logs:

```
[simplex] Loading SimpleX Chat channel plugin
[simplex] Config: ws=ws://localhost:5225 autoAccept=true whisper=false
[simplex] Monitor started → ws://localhost:5225
[simplex] Connected to SimpleX CLI
```

### Get Your Contact Address

If you ran the CLI interactively during setup, you already have the address. Otherwise, check the CLI directly:

```bash
# If bare-metal, attach briefly:
simplex-chat
# Type: /address
# Copy the simplex:// link
# Ctrl+C
```

Or if using Docker:

```bash
docker exec -it simplex-cli simplex-chat -e '/address'
```

### Connect from Your Phone

1. Open SimpleX Chat on your phone
2. Tap **+** → **Connect via link**
3. Paste the `simplex://` address
4. Send a message — the agent should reply

---

## Chat Commands

All standard OpenClaw commands work via SimpleX:

| Command | Action |
|---------|--------|
| `/new` or `/reset` | Reset session (start fresh) |
| `/status` | Show model, tokens, cost |
| `/compact` | Manually compact context |
| `/think <level>` | Set thinking level |
| `/verbose on/off` | Toggle verbose mode |
| `/usage off/tokens/full` | Usage footer display |

---

## Architecture Details

### Inbound Flow (Phone → Agent)

1. SimpleX CLI receives encrypted message via SimpleX protocol
2. CLI emits event on WebSocket (port 5225)
3. Plugin's `monitor.ts` parses the event into an `InboundMessage`
4. Monitor builds an OpenClaw `ctx` payload (same format as Telegram/WhatsApp)
5. `dispatchReplyWithBufferedBlockDispatcher()` feeds it into the agent pipeline
6. Agent processes the message (LLM call, tools, memory)
7. Agent response arrives in the `deliver` callback
8. Plugin sends the reply back via `simplex-chat` CLI command: `@'contact name' response text`

### Outbound Flow (Agent → Phone)

The `channel.ts` module registers a `sendText` handler. When the agent needs to send a message (e.g., from a cron job or webhook), OpenClaw calls this handler, which forwards to the CLI.

### Session Keys

Session format: `agent:main:simplex:dm:<contact_display_name>`

This follows OpenClaw's standard session key pattern. Each SimpleX contact gets their own session with independent memory and context.

### Contact Names with Spaces

SimpleX assigns display names like `dolphin smooth_1`. The CLI command syntax uses single quotes to handle spaces: `@'dolphin smooth_1' message text`.

---

## Voice Transcription (Optional)

For voice message support, run the Whisper container:

```bash
cd ~/.openclaw/extensions/simplex
docker compose --profile whisper up -d
```

Enable in config:

```json
{
  "simplex": {
    "enabled": true,
    "config": {
      "wsUrl": "ws://localhost:5225",
      "autoAccept": true,
      "whisper": {
        "enabled": true,
        "apiUrl": "http://localhost:9000/transcribe"
      }
    }
  }
}
```

---

## Backup

**Critical directories:**

```bash
# SimpleX CLI data (identity, contacts, messages)
~/.simplex/                        # bare-metal
# or Docker volume: simplex-channel_simplex-data

# OpenClaw plugin
~/.openclaw/extensions/simplex/

# OpenClaw memory (shared across all channels)
~/.clawdbot/                       # or ~/.openclaw/
~/clawd/
```

**Backup commands:**

```bash
# Bare-metal SimpleX data
rsync -avz ~/.simplex/ ./backup-simplex-$(date +%Y%m%d)/

# Docker SimpleX data
docker run --rm \
  -v simplex-channel_simplex-data:/data \
  -v $(pwd):/backup \
  ubuntu tar czf /backup/simplex-data-$(date +%Y%m%d).tar.gz -C /data .
```

> **Loss of `~/.simplex/` = loss of all SimpleX contacts and identity.** Back it up.

---

## Troubleshooting

### Plugin not loading

```bash
openclaw gateway restart 2>&1 | grep simplex
```

Should show `[simplex] Loading SimpleX Chat channel plugin`. If not, check that the extension directory is discoverable:

```bash
ls ~/.openclaw/extensions/simplex/package.json
# Must exist and contain "openclaw.extensions"
```

### Connected but no replies

1. Check for stale gateway processes: `ps aux | grep openclaw-gateway`
2. Kill all and restart: `kill $(pgrep -f openclaw-gateway); sleep 2; openclaw gateway start`
3. Check logs: `grep simplex /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | tail -20`

### "runtime.handleAutoReply is not a function"

You're running an old version of `monitor.ts`. The correct dispatch method is `api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher()`. Pull the latest code.

### SimpleX CLI won't start (port busy)

```bash
# Check what's using port 5225
ss -tlnp | grep 5225

# Kill it
kill $(lsof -t -i:5225) 2>/dev/null
```

### Config validation error

The simplex config goes under `plugins.entries.simplex.config` in `openclaw.json`, NOT under `channels.simplex`. The `channels` section is for built-in channels only.

---

## File Structure

```
~/.openclaw/extensions/simplex/
├── src/
│   ├── index.ts          # Plugin entry point
│   ├── monitor.ts         # Inbound: SimpleX → agent pipeline
│   ├── channel.ts         # Outbound: agent → SimpleX
│   ├── simplex-cli.ts     # WebSocket client for SimpleX CLI
│   ├── parser.ts          # Event parser
│   ├── whisper.ts         # Voice transcription client
│   ├── runtime.ts         # Shared API state
│   └── types.ts           # TypeScript types
├── docker/
│   └── simplex-cli/
│       ├── Dockerfile
│       └── entrypoint.sh
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Security Notes

- SimpleX provides quantum-resistant end-to-end encryption with perfect forward secrecy
- No user identifiers are transmitted — contacts connect via one-time invitation links
- The CLI stores identity keys in `~/.simplex/` — protect this directory
- `autoAccept: true` means anyone with your address can start a conversation
- Set `autoAccept: false` and use `openclaw pairing` for manual approval

---

*Last updated: February 2026*
