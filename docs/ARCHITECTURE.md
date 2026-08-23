# Architecture

Technical overview of the DJ Miyabi codebase — structure, design decisions, database schema, and developer notes.

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
discord-music-bot/
├── src/
│   ├── bot/
│   │   ├── index.js                # Entry point: env validation, DB init, player setup, boot
│   │   ├── deploy-commands.js      # One-shot: registers slash commands with Discord API
│   │   ├── commands/               # One file per slash command (17 total, incl. lyrics, replay)
│   │   ├── events/
│   │   │   ├── ready.js            # Sets bot activity status on login
│   │   │   ├── interactionCreate.js# Dispatches slash commands to handlers
│   │   │   └── voiceStateUpdate.js # Removes votes when users leave VC; auto_leave_s timer
│   │   ├── player/
│   │   │   ├── setup.js            # Creates Player, registers extractors, wires player events,
│   │   │   │                       #   and captures queue snapshots for /replay
│   │   │   ├── YoutubeDlpExtractor.js # YouTube search/video/playlist via yt-dlp (cookies + pacing)
│   │   │   └── TikTokExtractor.js  # Custom extractor: yt-dlp + embed-page resolution for sound URLs
│   │   └── utils/
│   │       ├── voteSkip.js         # Vote-skip state machine (per-guild Map)
│   │       ├── queuePersist.js     # Queue snapshot capture/clear (SQLite-backed)
│   │       ├── trackDto.js         # Canonical plain-object track shape (shared bot + web)
│   │       ├── lyrics.js           # lrclib.net lookup + YouTube title cleanup
│   │       ├── permissions.js      # isDJ(), getMemberVoiceChannel(), isInSameVC()
│   │       ├── formatters.js       # Duration/progress bar, truncate, safeEmbedUrl()
│   │       └── logger.js           # Verbose debug log writer (to logs/)
│   ├── web/
│   │   ├── server.js               # Express app, authenticated Socket.io, bot event bridge
│   │   ├── helpers.js              # serializeQueue, getGuildQueue, resolveVoiceChannel,
│   │   │                           #   queueNodeDefaults, emitPlayerState
│   │   ├── middleware/auth.js      # Session auth: rate-limited login, timing-safe compare,
│   │   │                           #   fail-closed password, secure-cookie opt-in
│   │   ├── routes/                 # All factories follow the (client) => Router convention
│   │   │   ├── player.js           # /api/player — playback control
│   │   │   ├── queue.js            # /api/queue — queue management
│   │   │   ├── playlists.js        # /api/playlists — CRUD + enqueue + YouTube import
│   │   │   ├── upload.js           # /api/upload — upload + mediaplex content probing
│   │   │   ├── settings.js         # /api/settings — guild config
│   │   │   └── guilds.js           # /api/guilds — guild listing
│   │   └── public/
│   │       ├── index.html          # SPA shell (5 views)
│   │       ├── css/styles.css      # Dark theme, glassmorphism, responsive layout
│   │       └── js/                 # ES modules (type="module", no build step)
│   │           ├── main.js         # Entry: auth, guilds, navigation, socket wiring
│   │           ├── state.js        # Shared state + DOM/format helpers
│   │           ├── socket.js       # Socket.io client (session-authenticated handshake)
│   │           ├── nowPlaying.js   # Now-playing view, scrubber, transport controls
│   │           ├── queueView.js    # Queue list rendering
│   │           ├── playback.js     # Search bar → /api/player/play
│   │           ├── playlistView.js # Playlists view
│   │           ├── uploadView.js   # Upload view (drag & drop, progress)
│   │           └── settingsView.js # Settings view
│   └── db/
│       ├── database.js             # SQLite init, WAL mode, auto-migrations, CRUD helpers
│       └── schema.sql              # Reference schema (auto-applied on startup)
├── test/                           # vitest suite (db, auth, utils)
├── uploads/                        # Uploaded audio files (gitignored)
├── data/                           # SQLite .db + yt-dlp cookie files (gitignored)
├── logs/                           # PM2 / verbose logs
├── docs/                           # You are here
├── .env / .env.example
├── eslint.config.js                # ESLint 9 flat config (npm run lint)
├── .prettierrc                     # Prettier (npm run format)
├── package.json                    # ES module ("type": "module"), pnpm
├── pm2.ecosystem.config.cjs        # PM2 production config
└── dj-miyabi.service               # Systemd unit file (production uses this)
```

---

## Tech Stack

| Concern                      | Library                                          | Version | Notes                                                                    |
| ---------------------------- | ------------------------------------------------ | ------- | ------------------------------------------------------------------------ |
| Runtime                      | Node.js                                          | 22 LTS  | ES Modules throughout                                                    |
| Discord                      | `discord.js`                                     | ^14.26  | Slash commands, voice intents                                            |
| Audio engine                 | `discord-player`                                 | ^7.2    | Modular extractor system                                                 |
| YouTube                      | Custom `YoutubeDlpExtractor`                     | —       | yt-dlp (`youtube-dl-exec`) — direct stream URLs                          |
| SoundCloud / Spotify / Files | `@discord-player/extractor`                      | ^7.2    | `DefaultExtractors` bundle                                               |
| TikTok                       | Custom `TikTokExtractor`                         | —       | yt-dlp + embed-page sound resolution                                     |
| Audio codec                  | `sodium-native` / `opusscript` + system `ffmpeg` | —       | Opus encoding; requires `FFMPEG_BIN=/usr/bin/ffmpeg` (see DEPLOYMENT.md) |
| Database                     | `better-sqlite3`                                 | ^12.8   | Synchronous SQLite, WAL mode                                             |
| Web server                   | `express`                                        | ^5.2    | REST API                                                                 |
| WebSockets                   | `socket.io`                                      | ^4.8    | Real-time dashboard (session-authenticated handshake)                    |
| Auth                         | `cookie-parser`                                  | ^1.4    | httpOnly session cookies, rate-limited login                             |
| File uploads                 | `multer`                                         | ^2.1    | Multipart parsing                                                        |
| Audio metadata               | `mediaplex`                                      | ^1.0    | Upload probing: duration/tags + content validation                       |

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

-- Persistent queue snapshots (restored with /replay; survive restarts and /stop)
CREATE TABLE IF NOT EXISTS queue_snapshots (
  guild_id  TEXT PRIMARY KEY,
  payload   TEXT NOT NULL,                       -- JSON: { current, position, tracks, volume }
  saved_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_playlists_owner          ON playlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_playlists_guild          ON playlists(guild_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
```

---

## Development Tooling

| Command            | What it does                                    |
| ------------------ | ----------------------------------------------- |
| `npm run lint`     | ESLint 9 (flat config) — must pass before commit |
| `npm run lint:fix` | Auto-fix lint issues                            |
| `npm run format`   | Prettier over the repo                          |
| `npm test`         | vitest suite (`test/`) — db, auth, formatters, urlHelpers, voteSkip |
| `pnpm deploy`      | Register slash commands with Discord (guild-instant if `GUILD_ID` set) |

CI-style verification before deploying: `npm run lint && npm test`, then a
module-graph smoke boot (`node` importing `src/web/server.js` with a fake
client) — see `AGENTS.md`.

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
2. `TikTokExtractor` — custom TikTok (yt-dlp + embed-page sound resolution)
3. `YoutubeDlpExtractor` — YouTube via yt-dlp (youtube-dl-exec)

> Note: `discord-player-youtubei` was removed from the runtime path in Aug 2026 —
> its stream URLs silently failed. It has since been removed from `package.json`
> entirely (along with the unused `crypto-js`, `@snazzah/davey`,
> `@tobyg74/tiktok-api-dl`, and `ffmpeg-static`; extraction uses system ffmpeg
> via `FFMPEG_BIN`, and yt-dlp handles all YouTube/TikTok resolution).

To change priority, reorder the `register` / `loadMulti` calls in `setup.js`.

### Cross-Platform Paths

All file paths use `path.join()` / `path.resolve()` — never hardcoded slashes. The project is developed on Windows 11 and deployed on Debian 13.

### Spotify Support

Spotify has no public audio streaming API. `@discord-player/extractor`'s Spotify extractor resolves Spotify links → searches YouTube/SoundCloud for the same track automatically. Users see the Spotify metadata; audio comes from YouTube.
