# AGENTS.md — DJ Miyabi (Discord music bot + web dashboard)

Guidance for AI coding agents working in this repo. Human-facing docs live in
`docs/` — read the relevant one before non-trivial changes.

## What this is

Single-process Node.js app (ESM, pnpm, Node 22+): a discord.js music bot
(discord-player v7 with custom yt-dlp TikTok/YouTube extractors) and an
Express 5 + Socket.io dashboard sharing memory and one SQLite database
(better-sqlite3, WAL). Production runs on this host via systemd unit
`dj-miyabi` from this directory.

## Read first

| Doc | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Process model, full file tree, schema, extractor priority, conventions |
| `docs/COMMANDS.md` | All 17 slash commands + permission tiers |
| `docs/DASHBOARD.md` | Auth model, REST + Socket.io API reference |
| `docs/SETUP.md` | Discord app setup, env vars, dev workflow, troubleshooting |
| `docs/DEPLOYMENT.md` | systemd/PM2, ffmpeg, production troubleshooting |
| `docs/CHANGELOG-2026-08.md` | Debugging history: ffmpeg segfault, cookies bugs, rate limits |

## Commands

```bash
pnpm install        # deps
npm run lint        # ESLint 9 flat config — must be clean before commit
npm test            # vitest (test/) — must pass before commit
npm run dev         # watch mode
pnpm deploy         # register slash commands with Discord (REQUIRED after adding/changing commands)
```

Deploy to production (this host): `systemctl restart dj-miyabi`, then check
`journalctl -u dj-miyabi -f`.

## Verification workflow (every change)

1. `npm run lint && npm test`
2. Smoke-boot the module graph without Discord login:

```js
process.env.DASHBOARD_PASSWORD = 'smoke';
const { initDatabase } = await import('./src/db/database.js');
initDatabase('/tmp/smoke.db');
await import('./src/web/server.js'); // catches broken imports across bot+web
```

3. For command changes: `pnpm deploy` + restart, then confirm
   `[Commands] Loaded: /<name>` in journalctl.

## Conventions

- ESM only (`"type": "module"`); no build step anywhere, including the
  dashboard frontend (plain ES modules in `src/web/public/js/`).
- Web route files export `(client) => Router` factories; shared logic goes in
  `src/web/helpers.js`, never import back from `server.js` (cycle).
- Track serialization uses `src/bot/utils/trackDto.js#serializeTrack` — don't
  hand-build track objects.
- DB access only through `src/db/database.js` helpers (add one if missing);
  schema changes go in `src/db/schema.sql` (applied automatically at boot).
- Errors: user-facing responses never include raw `err.message`; log details
  server-side. The central Express error handler in `server.js` is the backstop.
- Auth: password comes only from `DASHBOARD_PASSWORD` (fail closed at boot);
  new endpoints must sit behind `authMiddleware`; Socket.io handshake is
  session-authenticated — keep it that way.
- Reply flags: use `flags: MessageFlags.Ephemeral`, never `ephemeral: true`
  (deprecated in discord.js 14.27).

## Gotchas (each caused a real outage — see CHANGELOG)

- **yt-dlp option names**: `youtube-dl-exec` converts camelCase to dashed
  flags. `cookies` → `--cookies` works; `cookieFile` → `--cookie-file` breaks
  every invocation. Verify new options against `yt-dlp --help`.
- **YouTube rate limiting**: without `YOUTUBE_COOKIES_FILE`, YouTube bans the
  anonymous session for up to an hour ("This content isn't available, try
  again later" on everything). Cookie files live in `data/` (gitignored).
- **ffmpeg**: must be the distro binary via `FFMPEG_BIN` (systemd unit sets
  it). The bundled ffmpeg-static segfaulted and was removed from deps.
- **Protocol-relative URLs** (`//yt3.ggpht.com/...`) from YouTube crash
  `setThumbnail` — run media URLs through `safeEmbedUrl()`.
- **Slash commands** need `pnpm deploy` after changes — booting the bot alone
  is not enough; Discord-side registration is a separate REST call.
- `data/` and `uploads/` are gitignored runtime state; never commit them.
  `.env` holds secrets — never print or commit it.

## Current state (November 2026)

The production changes from `improve/everything` are merged into `main`: security
hardening (socket.io auth, rate-limited login, upload content probing),
refactor (shared helpers, route factories, split dashboard modules), wired-up
`default_volume`/`auto_leave_s` settings, persistent queues (`/replay`),
`/lyrics` via lrclib.net, ESLint/Prettier/vitest tooling, and the extractor
fixes above. Use `main` for future work and production updates.
Discord login failures exit nonzero so systemd retries after boot-time network
outages. `npm test` runs both the Vitest suite and isolated Node startup tests.
