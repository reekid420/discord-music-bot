# Architecture

Technical overview of the Groove bot codebase — structure, design decisions, database schema, and developer notes.

---

## Process Model

The bot and web dashboard run **in a single Node.js process**, sharing memory. They communicate via Node's built-in `EventEmitter` on the `client` object.

```
┌───────────────────────────────────────────────────────────────────┐
│                     Single Node.js Process                        │
│                                                                   │
│  ┌─────────────┐    ┌──────────────────┐      ┌───────────────┐   │
│  │ discord.js  │───▶│ discord-player   │      │ better-sqlite │   │
│  │   Client    │    │ (audio engine)   │      │    (SQLite)   │   │
│  └──────┬──────┘    └──────────────────┘      └───────┬───────┘   │
│         │ EventEmitter bridge                         │           │
│  ┌──────▼─────────────────────────────────────────────▼───────┐   │
│  │              Express + Socket.io Server                    │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────┴──────────────────────────────────────┴──────────────────┘
          │ WebSocket (discord.js)               │ HTTP + WS
          ▼                                      ▼
  ┌───────────────┐                    ┌──────────────────┐
  │Discord Gateway│                    │ Browser Dashboard│
  │  (external)   │                    │   (user browser) │
  └───────────────┘                    └──────────────────┘
```

**Event bridge flow:**

1. `discord-player` events fire in the bot
2. `player/setup.js` re-emits them on `client` (`playerTrackStart`, `playerQueueUpdate`, `playerDisconnect`)
3. `web/server.js` listens for those events and forwards them to Socket.io guild rooms

This avoids needing Redis or a message broker for a typical 1–5 server deployment, while keeping the coupling clean enough to split later.

---

## Project Structure

```
discord-bot/
├── src/
│   ├── bot/
│   │   ├── index.js                # Entry point: env validation, DB init, player setup, boot
│   │   ├── deploy-commands.js      # One-shot: registers slash commands with Discord API
│   │   ├── commands/               # One file per slash command (14 total)
│   │   ├── events/
│   │   │   ├── ready.js            # Sets bot activity status on login
│   │   │   ├── interactionCreate.js# Dispatches slash commands to handlers
│   │   │   └── voiceStateUpdate.js # Removes votes when users leave VC; handles auto-leave
│   │   ├── player/
│   │   │   ├── setup.js            # Creates Player, registers extractors, wires player events
│   │   │   └── TikTokExtractor.js  # Custom extractor using @tobyg74/tiktok-api-dl
│   │   └── utils/
│   │       ├── voteSkip.js         # Vote-skip state machine (per-guild Map)
│   │       ├── permissions.js      # isDJ(), getMemberVoiceChannel(), isInSameVC()
│   │       ├── formatters.js       # Duration formatting, progress bar generation
│   │       └── logger.js           # Verbose debug log writer (to logs/)
│   ├── web/
│   │   ├── server.js               # Express app, Socket.io, and bot event bridge
│   │   ├── middleware/auth.js       # Session cookie auth (login/logout/verify)
│   │   └── routes/
│   │       ├── player.js           # /api/player — playback control
│   │       ├── queue.js            # /api/queue — queue management
│   │       ├── playlists.js        # /api/playlists — CRUD + enqueue
│   │       ├── upload.js           # /api/upload — file upload + metadata
│   │       └── settings.js         # /api/settings — guild config
│   │   └── public/
│   │       ├── index.html          # SPA shell (5 views)
│   │       ├── css/styles.css      # Dark theme, glassmorphism, responsive layout
│   │       └── js/app.js           # Auth, Socket.io client, all view controllers
│   └── db/
│       ├── database.js             # SQLite init, WAL mode, auto-migrations, CRUD helpers
│       └── schema.sql              # Reference schema (auto-applied on startup)
├── uploads/                        # Uploaded audio files (gitignored)
├── data/                           # SQLite .db file (gitignored)
├── logs/                           # PM2 / verbose logs
├── docs/                           # You are here
├── .env / .env.example
├── package.json                    # ES module ("type": "module"), pnpm
├── pm2.ecosystem.config.cjs        # PM2 production config
└── groove-bot.service              # Systemd unit file (alternative to PM2)
```

---

## Tech Stack

| Concern                      | Library                        | Version | Notes                                          |
| ---------------------------- | ------------------------------ | ------- | ---------------------------------------------- |
| Runtime                      | Node.js                        | 22 LTS  | ES Modules throughout                          |
| Discord                      | `discord.js`                   | ^14.26  | Slash commands, voice intents                  |
| Audio engine                 | `discord-player`               | ^7.2    | Modular extractor system                       |
| YouTube                      | `discord-player-youtubei`      | ^2.0    | Routed through `yt-dlp` (`useYoutubeDL: true`) |
| SoundCloud / Spotify / Files | `@discord-player/extractor`    | ^7.2    | `DefaultExtractors` bundle                     |
| TikTok                       | Custom `TikTokExtractor`       | —       | `@tobyg74/tiktok-api-dl`                       |
| Audio codec                  | `opusscript` + `ffmpeg-static` | —       | Opus encoding; bundled ffmpeg                  |
| Database                     | `better-sqlite3`               | ^12.8   | Synchronous SQLite, WAL mode                   |
| Web server                   | `express`                      | ^5.2    | REST API                                       |
| WebSockets                   | `socket.io`                    | ^4.8    | Real-time dashboard                            |
| Auth                         | `cookie-parser`                | ^1.4    | Signed session cookies                         |
| File uploads                 | `multer`                       | ^2.1    | Multipart parsing                              |
| Audio metadata               | `mediaplex`                    | ^1.0    | ID3/tag extraction from uploads                |

---

## Database Schema

Migrations run automatically on startup. The source of truth is `src/db/schema.sql`.

```sql
-- Per-server bot configuration
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id       TEXT    PRIMARY KEY,
  dj_role_id     TEXT,                          -- Discord role snowflake (nullable)
  vote_threshold REAL    DEFAULT 0.51,           -- 0.0–1.0 fraction (51% default)
  auto_leave_s   INTEGER DEFAULT 300,            -- Seconds before leaving empty VC
  default_volume INTEGER DEFAULT 80,             -- 1–100
  created_at     INTEGER DEFAULT (unixepoch())
);

-- User-created playlists
CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   TEXT    NOT NULL,                   -- Discord user snowflake
  guild_id   TEXT,                               -- Scoped to guild if set
  name       TEXT    NOT NULL,
  is_public  INTEGER DEFAULT 0,                  -- 0 = private, 1 = server-wide
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(owner_id, name)
);

-- Tracks within a playlist
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  duration_ms INTEGER,
  thumbnail   TEXT,
  track_order REAL    NOT NULL,                  -- Fractional index for reordering
  added_at    INTEGER DEFAULT (unixepoch())
);

-- Uploaded local audio files
CREATE TABLE IF NOT EXISTS local_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT    NOT NULL,
  filepath    TEXT    NOT NULL,                  -- Absolute server path
  title       TEXT,                              -- From audio metadata tags
  duration_ms INTEGER,
  uploaded_at INTEGER DEFAULT (unixepoch())
);

-- Dashboard session tokens
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL                    -- Unix timestamp; checked on each request
);

CREATE INDEX IF NOT EXISTS idx_playlists_owner          ON playlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_playlists_guild          ON playlists(guild_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
```

---

## Developer Notes

### Adding a New Slash Command

1. Create `src/bot/commands/<name>.js`
2. Export `data` (a `SlashCommandBuilder`) and an async `execute(interaction)` function
3. The dynamic loader in `index.js` picks it up automatically on next start — no registration needed in the loader
4. Re-run `node src/bot/deploy-commands.js` to register the new command with Discord

### Adding a New API Route

1. Create `src/web/routes/<name>.js` exporting a function `(client) => Router`
2. Import and mount it in `src/web/server.js` under `/api/<name>`

### Audio Extractor Priority

`discord-player` tries extractors in the order they were registered. Current order in `src/bot/player/setup.js`:

1. `DefaultExtractors` — SoundCloud, Spotify bridge, file attachments
2. `TikTokExtractor` — custom TikTok
3. `YoutubeiExtractor` — YouTube via yt-dlp

To change priority, reorder the `register` / `loadMulti` calls in `setup.js`.

### Cross-Platform Paths

All file paths use `path.join()` / `path.resolve()` — never hardcoded slashes. The project is developed on Windows 11 and deployed on Debian 13.

### Spotify Support

Spotify has no public audio streaming API. `@discord-player/extractor`'s Spotify extractor resolves Spotify links → searches YouTube/SoundCloud for the same track automatically. Users see the Spotify metadata; audio comes from YouTube.
