# Commands Reference

All 15 slash commands, their permission requirements, and usage notes.

## Permission Tiers

1. **Admin** — Discord `ADMINISTRATOR` permission (always full access)
2. **DJ** — `Manage Channels` permission, or the guild's configured DJ role (set via `/settings`)
3. **Anyone in VC** — any member currently in a voice channel
4. **Anyone** — no voice channel required

---

## Playback

### `/play <query>`
**Who:** Anyone in VC

Accepts: YouTube URL, SoundCloud URL, Spotify track/album/playlist URL, TikTok video URL, plain search text, or a file attachment. Joins your voice channel automatically. If the queue is empty, playback starts immediately.

### `/pause`
**Who:** Anyone in VC

Pauses the current track.

### `/resume`
**Who:** Anyone in VC

Resumes paused playback.

### `/nowplaying`
**Who:** Anyone

Displays an embed showing the current track, a text progress bar, volume, loop mode, and who requested it.

### `/queue [page]`
**Who:** Anyone

Paginated queue display (10 tracks per page). Shows position, title, duration, and requester.

---

## Skipping

### `/voteskip`
**Who:** Anyone in VC

Casts a vote to skip the current track. See [Vote-Skip System](#vote-skip-system) below for full behaviour.

### `/skip`
**Who:** DJ or Admin

Force-skips the current track immediately, bypassing the vote system. If a regular user runs this command, it redirects to `/voteskip` logic automatically.

---

## Queue Management

### `/stop`
**Who:** DJ or Admin

Stops playback, clears the entire queue, and disconnects the bot from voice.

### `/volume <1-100>`
**Who:** DJ or Admin

Sets playback volume.

### `/loop <off|track|queue>`
**Who:** DJ or Admin

Toggles loop mode:
- `off` — no looping
- `track` — repeat the current track forever
- `queue` — replay the whole queue when it ends

### `/shuffle`
**Who:** DJ or Admin

Randomly shuffles the order of tracks currently in the queue.

### `/remove <position>`
**Who:** Owner of the track, or DJ

Removes the track at the given queue position. Position `1` is the next track up. Users may always remove their own queued tracks; a DJ can remove anyone's.

---

## Playlists

All playlist subcommands are available to anyone. Ownership rules apply for delete/share.

### `/playlist create <name>`
Creates a new named playlist owned by you.

### `/playlist add <name> [query]`
Adds a track to a playlist. If no query is given, adds the currently playing track.

### `/playlist play <name>`
Enqueues all tracks from the named playlist into the bot's queue. You must be in a voice channel.

### `/playlist list`
Lists your playlists (and any server-wide public playlists).

### `/playlist view <name>`
Shows all tracks in the named playlist with their URLs and durations.

### `/playlist delete <name>`
Deletes the playlist. Owner only.

### `/playlist share <name>`
Toggles the playlist between private (you only) and public (server-wide, anyone can play it).

---

## Server Configuration

### `/settings <key> <value>`
**Who:** Admin only

Configures bot behaviour for the current server. Changes persist in the database.

| Key | Accepted Value | Description |
|---|---|---|
| `dj_role` | Role mention, role ID, or `none` | Sets (or clears) the DJ role |
| `vote_threshold` | `1`–`100` (percentage) | Required votes to skip (default: `51`) |
| `auto_leave` | `0`–`3600` (seconds) | How long to wait in an empty VC before leaving (default: `300`) |
| `default_volume` | `1`–`100` | Default volume for new queues (default: `80`) |

**Examples:**
```
/settings dj_role @DJ
/settings vote_threshold 60
/settings auto_leave 120
/settings default_volume 70
/settings dj_role none
```

---

## Utility

### `/extract [url] [format]`
**Who:** Anyone

Downloads a track from any supported source and sends it directly to your DMs as a file.

| Option | Required | Description |
|---|---|---|
| `url` | No | YouTube, SoundCloud, Spotify, TikTok, or any yt-dlp-supported URL. If omitted, extracts the currently-playing track. |
| `format` | No (default: `mp4`) | Output container — see table below. |

**Supported formats:**

| Format | Type | Notes |
|---|---|---|
| `mp4` | Video | Default |
| `mp3` | Audio | |
| `wav` | Audio | Lossless, large |
| `flac` | Audio | Lossless, compressed |
| `aac` | Audio | |
| `ogg` | Audio | |
| `webm` | Video | |
| `mkv` | Video | |

> **Note:** Discord's 25 MB upload limit applies to non-boosted servers. For long videos, use an audio format (`mp3`, `aac`, or `flac`) to stay under the limit.

**Examples:**
```
/extract url:https://www.youtube.com/watch?v=dQw4w9WgXcQ
/extract url:https://www.tiktok.com/@user/video/123 format:mp3
/extract format:flac
```

---

## Vote-Skip System

Votes are tracked per-guild in memory with a 60-second expiry.

**Required votes:** `Math.ceil(eligibleVCMembers × threshold)` — minimum 1.

**Full flow:**
1. User calls `/voteskip` — must be in the bot's VC
2. If they are the only non-bot member → instant skip (no vote needed)
3. Vote is added to a `Set<userId>` for this guild
4. If votes ≥ required → skip fires, Set is cleared
5. Otherwise bot replies with progress: `(2/3 votes needed)`

**Edge cases:**

| Scenario | Behaviour |
|---|---|
| User votes twice | "Already voted" reply; second vote ignored |
| Song changes while vote is active | Vote state is cleared; new song starts fresh |
| Voter leaves VC mid-vote | Their vote is removed; threshold recalculated; may auto-skip |
| 60 seconds pass with no result | Vote expires, Set is cleared |
| Bot disconnects or queue empties | Vote state is cleared |
