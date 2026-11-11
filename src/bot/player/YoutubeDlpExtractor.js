// src/bot/player/YoutubeDlpExtractor.js
// YouTube search/streaming via yt-dlp (youtube-dl-exec) instead of youtubei.js.
// Replaces discord-player-youtubei, whose stream URLs currently fail to play.

import { BaseExtractor, Playlist, QueryType, Track } from 'discord-player';
import youtubedl from 'youtube-dl-exec';

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.|music\.|m\.)?(youtube\.com\/(watch|shorts|playlist)|youtu\.be\/)/i;

const MAX_PLAYLIST_TRACKS = 100;

// jsRuntimes: 'node' silences the "No supported JavaScript runtime" EJS warning
// and gives yt-dlp full format access (Node 24 is installed on the host).
// cookies: optional Netscape-format cookie file — without it YouTube
// rate-limits the anonymous session ("This content isn't available, try
// again later" for up to an hour).
const COOKIES_FILE = process.env.YOUTUBE_COOKIES_FILE || '';

const COMMON_FLAGS = {
  noWarnings: true,
  jsRuntimes: 'node',
};
if (COOKIES_FILE) COMMON_FLAGS.cookies = COOKIES_FILE;

// Search/playlist dumps hit YouTube many times in a row — pace the requests
// so the session doesn't trip the rate limiter.
const BULK_FLAGS = { ...COMMON_FLAGS, sleepRequests: 1 };

// Single-video resolves normally take seconds; a rate-limited session can
// wedge yt-dlp for many minutes (observed: 12min before SoundCloud saved the
// play). Fail fast so discord-player's fallback extractors can take over.
const RESOLVE_TIMEOUT_MS = 60_000;

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${RESOLVE_TIMEOUT_MS / 1000}s`)),
        RESOLVE_TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function toTimecode(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function pickThumb(entry) {
  if (typeof entry?.thumbnail === 'string') return entry.thumbnail;
  const list = entry?.thumbnails;
  if (Array.isArray(list) && list.length) {
    const last = list[list.length - 1];
    if (last?.url) return last.url;
  }
  return entry?.id ? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` : null;
}

export class YoutubeDlpExtractor extends BaseExtractor {
  static identifier = 'com.djmiyabi.ytdlp';

  async validate(query, type) {
    if (typeof query !== 'string' || !query.length) return false;
    if (YOUTUBE_URL_RE.test(query)) return true;
    return (
      type === QueryType.YOUTUBE ||
      type === QueryType.YOUTUBE_SEARCH ||
      type === QueryType.YOUTUBE_PLAYLIST
    );
  }

  async handle(query, context) {
    try {
      if (/[?&]list=/.test(query)) return await this.handlePlaylist(query, context);
      if (YOUTUBE_URL_RE.test(query)) return await this.handleVideo(query, context);
      return await this.handleSearch(query, context);
    } catch (err) {
      console.error(
        '[YoutubeDlpExtractor] handle failed:',
        err?.shortMessage ?? err?.message ?? err
      );
      return { playlist: null, tracks: [] };
    }
  }

  async handleSearch(query, context) {
    const data = await youtubedl(`ytsearch5:${query}`, {
      ...BULK_FLAGS,
      dumpSingleJson: true,
      flatPlaylist: true,
    });
    const entries = Array.isArray(data?.entries) ? data.entries.filter(Boolean) : [];
    const tracks = entries.map((e) => this.makeTrack(e, context)).filter(Boolean);
    return { playlist: null, tracks };
  }

  async handleVideo(url, context) {
    const data = await withTimeout(
      youtubedl(url, {
        ...COMMON_FLAGS,
        dumpJson: true,
        noPlaylist: true,
      }),
      'YouTube metadata resolve'
    );
    const track = this.makeTrack(data, context);
    return { playlist: null, tracks: track ? [track] : [] };
  }

  async handlePlaylist(url, context) {
    const data = await youtubedl(url, {
      ...BULK_FLAGS,
      dumpSingleJson: true,
      flatPlaylist: true,
      yesPlaylist: true,
    });
    const entries = (Array.isArray(data?.entries) ? data.entries.filter(Boolean) : []).slice(
      0,
      MAX_PLAYLIST_TRACKS
    );
    const tracks = entries.map((e) => this.makeTrack(e, context)).filter(Boolean);
    if (!tracks.length) return { playlist: null, tracks: [] };

    const playlist = new Playlist(this.context.player, {
      id: data.id ?? 'youtube-playlist',
      title: data.title ?? 'YouTube Playlist',
      description: data.description ?? '',
      thumbnail: pickThumb(data) ?? tracks[0]?.thumbnail ?? null,
      type: 'playlist',
      source: 'youtube',
      author: {
        name: data.uploader ?? data.channel ?? 'YouTube',
        url: data.uploader_url ?? data.channel_url ?? null,
      },
      tracks,
      url: data.webpage_url ?? url,
      raw: data,
    });

    return { playlist, tracks };
  }

  makeTrack(entry, context) {
    if (!entry) return null;
    let url = entry.webpage_url ?? entry.url ?? null;
    // flat-playlist entries sometimes carry a bare video id in `url`
    if (url && !/^https?:\/\//.test(url)) url = null;
    if (!url && entry.id) url = `https://www.youtube.com/watch?v=${entry.id}`;
    if (!url) return null;

    return new Track(this.context.player, {
      title: entry.title ?? 'Unknown title',
      description: entry.description ?? '',
      author: entry.uploader ?? entry.channel ?? 'Unknown',
      url,
      thumbnail: pickThumb(entry),
      duration: toTimecode(entry.duration),
      views: entry.view_count ?? 0,
      source: 'youtube',
      requestedBy: context?.requestedBy ?? null,
      queryType: context?.type ?? null,
      raw: entry,
    });
  }

  // Returning a URL string (not a pipe) lets discord-player drive ffmpeg itself,
  // which keeps the dashboard seek endpoint working.
  async stream(track) {
    const res = await withTimeout(
      youtubedl(track.url, {
        ...COMMON_FLAGS,
        getUrl: true,
        format: 'bestaudio/best',
        noPlaylist: true,
      }),
      'YouTube stream resolve'
    );
    const url = (typeof res === 'string' ? res : (res?.stdout ?? '')).trim().split('\n')[0];
    if (!url) throw new Error('yt-dlp returned no stream URL');
    return url;
  }

  async getRelatedTracks() {
    return { tracks: [] };
  }
}
