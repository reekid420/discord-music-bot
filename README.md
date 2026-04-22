# 🎵 Groove — Discord Music Bot

A self-hosted Discord music bot with a real-time web dashboard. Supports YouTube, SoundCloud, Spotify (bridged), TikTok, and local file uploads.

## Quick Start

```bash
pnpm install
cp .env.example .env   # fill in DISCORD_TOKEN, CLIENT_ID, DASHBOARD_PASSWORD
node src/bot/deploy-commands.js
pnpm run dev
```

Dashboard: `http://localhost:3000`

## Key Features

- **Multi-source playback** — YouTube (yt-dlp), SoundCloud, Spotify bridge, TikTok, uploaded files
- **15 slash commands** — play, skip, queue, vote-skip, playlists, extract, and more
- **DJ role system** — configurable per-guild role restricts sensitive commands
- **Smart vote-skip** — 51% democratic threshold with full edge case handling
- **Web dashboard** — live queue, controls, playlist management, and file uploads via browser
- **SQLite database** — zero-config, auto-migrates on startup
- **PM2 + systemd ready** — for Debian/Linux production deployment

## Documentation

| Guide                                        | Description                                                     |
| -------------------------------------------- | --------------------------------------------------------------- |
| [docs/SETUP.md](docs/SETUP.md)               | Creating your Discord bot, getting tokens, installing on Debian |
| [docs/COMMANDS.md](docs/COMMANDS.md)         | All slash commands, permissions, and usage examples             |
| [docs/DASHBOARD.md](docs/DASHBOARD.md)       | Web dashboard views, API reference, Socket.io events            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Project structure, tech stack, database schema, developer notes |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | PM2, systemd, server requirements, troubleshooting              |

## Tech Stack

`discord.js` v14 · `discord-player` v7 · `better-sqlite3` · `express` · `socket.io` · `Node.js 22`
