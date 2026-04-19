# Web Dashboard

Access at `http://<server-ip>:3000` (port configurable via `DASHBOARD_PORT`).

---

## Authentication

- Visit the dashboard URL → redirected to login if not authenticated
- POST `/api/login` with `{ password }` → sets a session cookie (24-hour expiry)
- Sessions are stored in the SQLite `sessions` table
- POST `/api/logout` to invalidate the current session
- All `/api/*` routes require a valid session cookie (except `/api/login` and `/api/logout`)

---

## Views

### Now Playing
Large album art, track title and artist, a text progress bar, and playback controls:
- Play / Pause / Skip / Stop buttons
- Volume slider (1–100)
- Loop mode toggle (off / track / queue)

### Queue
Ordered list of upcoming tracks. Each row shows position, title, duration, and requester. Actions:
- Remove a track (trash icon)
- Shuffle the entire queue

### Playlists
Grid of playlist cards. Each card shows the playlist name, track count, and owner. Actions:
- **Create** — inline form to name a new playlist
- **Expand** — view all tracks; remove individual tracks
- **Play** — enqueues all tracks to the bot for the selected guild

### Upload
Drag-and-drop zone for local audio files (MP3, FLAC, WAV, OGG, M4A; max 100 MB each).
- Upload progress bar shown per file
- Uploaded files listed below with:
  - **Play now** — queues the file in the bot immediately
  - **Add to playlist** — adds to any of your playlists
  - **Delete** — removes from server and database

### Settings
Per-guild configuration form:
- **DJ role** — dropdown populated from the guild's actual roles
- **Vote-skip threshold** — percentage slider
- **Auto-leave timeout** — seconds input
- **Default volume** — slider

Changes are saved immediately to the database via the settings API.

---

## Guild Selector

The top navigation bar has a guild dropdown listing every server the bot is in. Switching guilds re-scopes the Now Playing, Queue, and Settings views to that guild's state and subscribes the Socket.io client to the correct guild room.

---

## Real-time Events (Socket.io)

The dashboard connects to Socket.io on load and emits `selectGuild <guildId>` to subscribe to live updates.

| Event | Direction | Trigger | Payload |
|---|---|---|---|
| `selectGuild` | Client → Server | User switches guild | `guildId: string` |
| `playerState` | Server → Client | Response to `selectGuild` | Full player state snapshot |
| `trackStart` | Server → Client | New track begins | `{ guildId, track, queue }` |
| `queueUpdate` | Server → Client | Track added / removed / shuffled / queue empties | `{ guildId, queue }` |
| `playerDisconnect` | Server → Client | Bot leaves voice | `{ guildId }` |

`track` objects in payloads: `{ title, artist, duration, durationMs, thumbnail, url, requestedBy }`

---

## REST API Reference

All endpoints require the session cookie unless noted.

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/login` | `{ password }` | Login — returns session cookie |
| `POST` | `/api/logout` | — | Logout — clears session |

### Guilds

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/guilds` | List guilds the bot is in (`{ id, name, icon, memberCount }`) |

### Player

| Method | Endpoint | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/player` | `?guild=<id>` | Full player state |
| `POST` | `/api/player/play` | `{ guild, query }` | Play by URL or search |
| `POST` | `/api/player/skip` | `{ guild }` | Force-skip |
| `POST` | `/api/player/pause` | `{ guild }` | Pause |
| `POST` | `/api/player/resume` | `{ guild }` | Resume |
| `POST` | `/api/player/stop` | `{ guild }` | Stop + clear + disconnect |
| `POST` | `/api/player/volume` | `{ guild, volume }` | Set volume (1–100) |

### Queue

| Method | Endpoint | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/queue` | `?guild=<id>` | Full queue |
| `DELETE` | `/api/queue/:position` | `?guild=<id>` | Remove track at position |
| `POST` | `/api/queue/shuffle` | `{ guild }` | Shuffle |
| `POST` | `/api/queue/move` | `{ guild, from, to }` | Reorder track |

### Playlists

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/playlists` | — | List all playlists |
| `GET` | `/api/playlists/:id` | — | Single playlist + tracks |
| `POST` | `/api/playlists` | `{ name, ownerId, guildId? }` | Create |
| `PUT` | `/api/playlists/:id` | `{ name?, is_public? }` | Update |
| `DELETE` | `/api/playlists/:id` | — | Delete |
| `POST` | `/api/playlists/:id/tracks` | `{ title, url, duration_ms?, thumbnail? }` | Add track |
| `DELETE` | `/api/playlists/:id/tracks/:trackId` | — | Remove track |
| `POST` | `/api/playlists/:id/play` | `{ guild }` | Enqueue to bot |

### Upload

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/upload` | Multipart `file` | Upload audio (max 100 MB) |
| `GET` | `/api/upload/files` | — | List uploaded files |
| `POST` | `/api/upload/play` | `{ guild, fileId }` | Play uploaded file |
| `DELETE` | `/api/upload/files/:id` | — | Delete uploaded file |

### Settings

| Method | Endpoint | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/settings` | `?guild=<id>` | Get settings + guild role list |
| `POST` | `/api/settings` | `{ guild, dj_role_id?, vote_threshold?, auto_leave_s?, default_volume? }` | Update settings |
