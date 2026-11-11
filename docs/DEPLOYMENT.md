# Deployment

Production deployment guide for Debian 13 (or any systemd-based Linux).

---

## Prerequisites

```bash
# Node.js 22 LTS (via fnm)
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# ffmpeg (required for audio encoding)
sudo apt update && sudo apt install -y ffmpeg

# libopus (prevents opusscript native errors)
sudo apt install -y libopus0
```

---

## PM2 (Recommended)

PM2 handles process management, auto-restart on crash, and log rotation.

```bash
# Install PM2 globally
pnpm add -g pm2

# Start the bot
pm2 start pm2.ecosystem.config.cjs

# Auto-start on system reboot
pm2 startup systemd
pm2 save
```

### Common PM2 commands

```bash
pm2 logs dj-miyabi          # Tail logs (stdout + stderr)
pm2 restart dj-miyabi       # Restart (e.g. after .env change)
pm2 stop dj-miyabi          # Graceful stop
pm2 delete dj-miyabi        # Remove from PM2 process list
pm2 monit                    # Real-time CPU / memory dashboard
```

### PM2 config summary (`pm2.ecosystem.config.cjs`)

| Setting         | Value              | Effect                                             |
| --------------- | ------------------ | -------------------------------------------------- |
| `script`        | `src/bot/index.js` | Entry point                                        |
| `watch`         | `false`            | No file watching in production                     |
| `max_restarts`  | `10`               | Max crashes in a 60s window before giving up       |
| `min_uptime`    | `10s`              | Process must stay alive 10s to count as successful |
| `restart_delay` | `5000ms`           | Wait 5s between restart attempts                   |
| `error_file`    | `./logs/error.log` | Stderr log path                                    |
| `out_file`      | `./logs/out.log`   | Stdout log path                                    |

---

## systemd (Alternative to PM2)

A pre-written unit file is included at `dj-miyabi.service` in the project root.
Install it as `/etc/systemd/system/dj-miyabi.service`.

Before installing, edit the file and set:

- `User=` — the Linux user that will run the bot
- `WorkingDirectory=` — absolute path to the project root (e.g. `/home/youruser/discord-bot`)
- `ExecStart=` — absolute path to `node` (run `which node` to find it)

**Required: force system ffmpeg.** The formerly-bundled `ffmpeg-static` binary
segfaulted on this host when reading YouTube/TikTok stream URLs (verified cause
of a "joins VC but no audio" outage in Aug 2026); it has since been **removed
from `package.json` entirely**. yt-dlp and discord-player now use the distro
ffmpeg, located via `FFMPEG_BIN`. The included unit already sets this in the
`[Service]` section; preserve it if using a custom unit:

```ini
Environment=FFMPEG_BIN=/usr/bin/ffmpeg
```

(`FFMPEG_PATH` does not work — prism-media and @discord-player/ffmpeg ignore it.)

```bash
sudo cp dj-miyabi.service /etc/systemd/system/dj-miyabi.service
sudo systemctl daemon-reload
sudo systemctl enable dj-miyabi    # Auto-start on boot
sudo systemctl start dj-miyabi     # Start now

sudo systemctl status dj-miyabi    # Check if running
sudo journalctl -u dj-miyabi -f    # Follow logs
```

### Boot-time connection failures

Discord login failures now exit with status 1 instead of leaving only the
dashboard running. The unit's `Restart=on-failure` retries after 10 seconds.
`StartLimitIntervalSec=0` disables the start-rate limit so a long network outage
does not exhaust the retries.

The unit also requests and starts after `network-online.target`. This is only
as useful as the container's network manager and wait-online service; it does
not guarantee DNS or Discord is reachable. Failed-login restarts provide the
fallback when the container boots before the host's network is ready.

To update an existing deployment, pull the code, then review the unit's
`User=`, `WorkingDirectory=`, `ExecStart=`, and any existing custom settings
before installing it. Preserve the `FFMPEG_BIN` setting described above.

```bash
cd /root/discord-music-bot
git pull --ff-only
# Review/edit dj-miyabi.service for this host before copying.
sudo cp dj-miyabi.service /etc/systemd/system/dj-miyabi.service
sudo systemctl daemon-reload
sudo systemctl reset-failed dj-miyabi
sudo systemctl enable dj-miyabi
sudo systemctl restart dj-miyabi
sudo journalctl -u dj-miyabi -n 50 --no-pager
```

The dashboard restarts with the bot on a failed login. Invalid credentials also
cause retries, so inspect the actual error: a connection timeout does not mean
the token is wrong.

---

## First-time Setup on a New Server

```bash
# 1. Clone the repo
git clone <your-repo-url> discord-bot
cd discord-bot

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
nano .env    # Fill in DISCORD_TOKEN, CLIENT_ID, DASHBOARD_PASSWORD

# 4. Register slash commands (one-time)
node src/bot/deploy-commands.js

# 5. Start
pm2 start pm2.ecosystem.config.cjs
pm2 startup systemd && pm2 save
```

---

## Firewall

If your server has a firewall, allow the dashboard port:

```bash
# ufw (Debian default)
sudo ufw allow 3000/tcp

# Or restrict to your home IP only (recommended for home servers)
sudo ufw allow from <your-ip> to any port 3000
```

---

## Troubleshooting

| Symptom                                      | Likely Cause                                        | Fix                                                                                     |
| -------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Bot not responding to slash commands         | Commands not registered                             | Run `node src/bot/deploy-commands.js`                                                   |
| "Missing Access" on bot invite               | Incorrect permissions                               | Re-invite via OAuth2 URL Generator (see SETUP.md)                                       |
| `DISCORD_TOKEN` error at startup             | Missing or wrong env var                            | Check `.env` exists and has correct values                                              |
| Audio cuts out immediately / silent playback | ffmpeg missing or wrong binary | `ffmpeg -version`; set `Environment=FFMPEG_BIN=/usr/bin/ffmpeg` in the unit and restart |
| All TikTok URLs fail with `Usage: yt-dlp [OPTIONS] URL` | Invalid yt-dlp flag injected by an extractor option (e.g. `cookieFile` instead of `cookies`) | Check extractor option names against `yt-dlp --help`; `youtube-dl-exec` maps camelCase → dashed flags |
| YouTube search: "This content isn't available, try again later" for everything | yt-dlp session rate-limited by YouTube (up to 1 h) | Set `YOUTUBE_COOKIES_FILE=./data/cookies.txt` (Netscape-format cookies) and restart |
| YouTube 403 / stream errors                  | YouTube bot detection                               | Usually transient; try again or use SoundCloud link                                     |
| TikTok URL not playing                       | Private or region-blocked video                     | Only public TikTok videos are supported                                                 |
| Dashboard unreachable                        | Firewall blocking port                              | `sudo ufw allow 3000/tcp`                                                               |
| Dashboard login loop                         | Wrong password or stale cookie                      | Clear browser cookies; verify `DASHBOARD_PASSWORD` in `.env`                            |
| `opusscript` native errors                   | Missing libopus                                     | `sudo apt install -y libopus0`                                                          |
| PM2 doesn't restart on reboot                | `pm2 save` not run                                  | `pm2 startup systemd && pm2 save`                                                       |
| Bot stays in empty VC                        | Auto-leave disabled                                 | `/settings auto_leave 300` to set 5-minute timeout                                      |
