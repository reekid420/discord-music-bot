# Changelog — Groove (DJ-Miyabi) Discord Music Bot

All changes made during the Aug 22–23, 2026 debugging session. Uncommitted as of
this writing (`git status` shows 6 modified + 2 new files).

---

## 1. Fix: no audio on playback (root cause: ffmpeg segfault) — INFRA

**Symptom:** Bot joins voice, "Now playing" fires in logs, but no audio is heard
for search results and links.

**Root cause:** The `ffmpeg-static` 7.0.2 bundled binary **segfaults (SIGSEGV,
exit 139)** on this host when reading YouTube/TikTok stream URLs. discord-player
spawned it, it crashed instantly, and `playerStart` still fired — hence silent
"playback". Verified by feeding the same googlevideo URL to both binaries:
static build → segfault; distro ffmpeg → decodes fine.

**Fix (system config, not repo):**

- Installed distro ffmpeg via apt.
- `/etc/systemd/system/dj-miyabi.service`:
  ```
  # Use distro ffmpeg: ffmpeg-static 7.0.2 segfaults on YouTube googlevideo streams
  Environment=FFMPEG_BIN=/usr/bin/ffmpeg
  ```
- Note: `FFMPEG_PATH` does **not** work here — prism-media and
  @discord-player/ffmpeg ignore it and try `ffmpeg-static` first. This version of
  the `ffmpeg-static` module honors **`FFMPEG_BIN`** and exports the system path
  instead, so every consumer resolves to the working binary.
- Service restarted; playback confirmed working.

## 2. Upgrade: TikTok link parsing — `src/bot/player/TikTokExtractor.js`

Rewritten with three improvements:

### a. Sound/music share pages now resolve

`tiktok.com/music/<slug>-<id>` and `/audio/...` URLs previously failed with
"Unsupported URL" (yt-dlp's sound extractor is broken: "No working app info is
available"; TikTok locked their web APIs behind signed tokens).

New resolution path, verified end-to-end:

1. Hit TikTok's public embed page `https://www.tiktok.com/embed/music/<id>`
   (server-rendered, needs no cookies/auth).
2. Scrape up to 10 real video URLs using that sound.
3. Verify each via yt-dlp metadata dump; queue the top 3 as tracks.

### b. Optional cookies for age-gated posts

Age-restricted TikToks fail with "Log in for access". Set in `.env`:

```
TIKTOK_COOKIES_FILE=/path/to/cookies.txt   # Netscape format from your browser
```

When present, the cookie file is passed to every yt-dlp call in the extractor
(metadata dumps and streaming).

### c. Cleanup

- All URL shapes matched by one consolidated regex (`TIKTOK_URL_RE`):
  `@user/video/N`, `vt.`/`vm.` short links, `/t/` share codes, `/music/`,
  `/audio/`.
- Track construction deduplicated into a private `#makeTrack()`.
- Every yt-dlp call goes through a shared `ytdlpOptions()` helper that injects
  the cookies file when configured.

## 3. Fix: verbose.log spam + rotation — `src/bot/utils/logger.js`

The log had grown to 33 MB of ~99% discord-player Lag Monitor heartbeats
(two per minute).

- **Throttle:** `[Lag Monitor]` debug lines under 100 ms latency are dropped;
  spikes ≥ 100 ms are still recorded.
- **Rotate:** at 10 MB, `verbose.log` → `verbose.log.old` → `verbose.log.older`.
- Log file was truncated at deploy time.

---

## Pre-existing uncommitted changes (from before this session)

These were already dirty in the working tree before debugging started; included
in any future commit:

- `src/bot/player/setup.js` — replaces `discord-player-youtubei` extractor with
  custom `YoutubeDlpExtractor` (youtubei stream URLs silently failed).
- `src/bot/player/YoutubeDlpExtractor.js` — NEW: yt-dlp-backed YouTube
  search/video/playlist extraction returning direct stream URLs (keeps seek
  working).
- `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` — dep bumps
  (discord-player-youtubei beta, discord.js 14.27, youtube-dl-exec 3.1.12),
  added `@snazzah/davey` + `sodium-native`, pnpm `allowBuilds`/`overrides`.

## New files this session

- `scripts/test-music-resolve.mjs` — standalone test for the music-page embed
  resolution (run: `node scripts/test-music-resolve.mjs <music-url>`).
- `CHANGELOG.md` — this file.

## Ops notes

- Service unit: `dj-miyabi.service` (not `groove-bot.service`; that old name
  fails at boot due to the removed youtubei import — safe to disable:
  `systemctl disable groove-bot`).
- yt-dlp version on host: 2026.08.19 (current).
- Known remaining limitation: age-gated TikToks fail until
  `TIKTOK_COOKIES_FILE` is configured.

---

# Session 2 — Aug 23, 2026 (branch `improve/everything`)

Full review + hardening + features. Details live in the git log (8+ commits,
`main..improve/everything`) and `AGENTS.md`; summary of production incidents:

## 1. Fix: every TikTok URL failing (`Usage: yt-dlp [OPTIONS] URL`) — EXTRACTOR

**Symptom:** After `TIKTOK_COOKIES_FILE` was configured, *all* TikTok playback
broke (not just age-gated posts).

**Root cause:** `TikTokExtractor` passed the cookie path as
`cookieFile`, which `youtube-dl-exec` converts to the nonexistent
`--cookie-file` flag. yt-dlp rejects the whole invocation.

**Fix:** option renamed to `cookies` (→ `--cookies`). Verified against the
bundled yt-dlp binary with the real cookies file.

## 2. Fix: YouTube rate-limited ("This content isn't available, try again later")

**Root cause:** anonymous yt-dlp session banned by YouTube for up to an hour;
`data/cookies.txt` existed but was never wired up.

**Fix:** `YOUTUBE_COOKIES_FILE` env (set to `./data/cookies.txt` in `.env`)
consumed by `YoutubeDlpExtractor` COMMON_FLAGS, plus `sleepRequests: 1` on
search/playlist dumps to avoid re-tripping the limiter.

## 3. Fix: `/play` crash on `setThumbnail` (ValidationError)

**Root cause:** YouTube channel avatars arrive as protocol-relative URLs
(`//yt3.ggpht.com/...`); discord.js requires absolute URLs.

**Fix:** `safeEmbedUrl()` in `bot/utils/formatters.js`, applied at every
embed thumbnail site. Also softened the misleading "Could not play:
Cancelled" when `/stop` interrupts an in-flight search.

## 4. Fix: `/lyrics` + `/replay` "Unknown command"

**Root cause:** the systemd process predated the new command files and
`pnpm deploy` had never been re-run after adding them. Commands load into the
bot's Collection at boot, but Discord-side registration is a separate REST step.

**Fix:** `pnpm deploy` (guild-scoped, instant) + `systemctl restart dj-miyabi`.

## Ops notes (updated)

- `pnpm deploy` must be re-run after adding/changing any slash command, then
  restart the service.
- Both cookie files live in `data/` (gitignored): `cookies.txt` (YouTube),
  `tiktok-cookies.txt` (TikTok).
- Deps pruned this session: `crypto-js`, `discord-player-youtubei`,
  `@snazzah/davey`, `@tobyg74/tiktok-api-dl`, `ffmpeg-static`.
- `scripts/test-music-resolve.mjs` was removed (superseded by the vitest suite).

## Session 3 (Aug 23, evening): flaky search + wrong lyrics

**Symptom 1 — "search not working good (but does work)":** `/play big dick
randy` intermittently returned `NoResultError` (16:59 EDT), and one `/play
goodkid` queued instantly but sat silent for 12 minutes before playing.

**Root causes (both reproduced outside Discord):**
- YouTube's search endpoint returns a clean `entries: []` for explicit/edgy
  terms ("big dick randy" → 0 results deterministically; the typo "big disck
  randy" → 5). Server-side filtering, not rate limiting — cookies don't help.
- Pre-restart process (no YouTube cookies) hit rate-limit storms during
  stream resolution: one `/play` walked ~190 videos against the limiter for
  12 minutes before SoundCloud bridged the track.

**Fix:** `shouldFallbackToSoundcloud()` (`bot/utils/searchFallback.js`) —
text-query `NoResultError`s get one retry via `SOUNDCLOUD_SEARCH` (embed
notes the source swap); 60s `withTimeout` guard on single-video resolves in
`YoutubeDlpExtractor` so a wedged yt-dlp fails over in a minute, not 12.

**Symptom 2 — `/lyrics` showed "BIG DICK RANDY 2" for "Big Dick Randy":**
`searchLyrics` took lrclib's first result with plain lyrics; lrclib ranks by
popularity, and the sequel outranks the original.

**Fix:** `findLyrics()` — exact `/api/get?artist_name&track_name` first
(strips YouTube title noise and author trailing dashes), then `/api/search`
ranked by normalized-title similarity (`pickBestMatch`, unit-tested against
the real fixture order).

**Ops notes:** the TikTok `--cookie-file` errors in the same log window
(02:54–16:19 EDT) were the already-fixed flag bug — last occurrence predates
the 16:55 restart. YouTube cookie jar has login-class cookies yet explicit
searches are still filtered — check Restricted Mode on the exporting account
if YouTube-side results are wanted for such queries.
