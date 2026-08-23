import { BaseExtractor, Track } from 'discord-player';
import youtubeDl from 'youtube-dl-exec';
import { writeVerboseLog } from '../utils/logger.js';

// Optional cookies for age-gated / login-walled TikTok posts.
// Set TIKTOK_COOKIES_FILE in .env to a Netscape-format cookies file.
const COOKIES_FILE = process.env.TIKTOK_COOKIES_FILE || '';

function ytdlpOptions(extra = {}) {
  const opts = { noWarnings: true, ...extra };
  if (COOKIES_FILE) opts.cookieFile = COOKIES_FILE;
  return opts;
}

// Matches all TikTok URL shapes we support:
//  - https://www.tiktok.com/@user/video/123456
//  - https://vt.tiktok.com/XXXX/ , https://vm.tiktok.com/XXXX/
//  - https://www.tiktok.com/t/XXXX/
//  - https://www.tiktok.com/music/<slug>-<id>/  (sound share pages)
//  - https://www.tiktok.com/audio/<slug>-<id>/  (alternate sound path)
const TIKTOK_URL_RE =
  /https?:\/\/(?:www\.)?tiktok\.com\/(?:@[\w.\-]+\/video\/\d+|t\/\w+|music\/[\w%\-.]*\d{10,}|audio\/[\w%\-.]*\d{10,})/i;
const SHORT_URL_RE = /https?:\/\/v[mt]\.tiktok\.com\/\w+/i;
const MUSIC_URL_RE = /tiktok\.com\/(?:music|audio)\//i;

/**
 * Resolve a music/sound share page into concrete video URLs using TikTok's
 * public embed endpoint, which is server-rendered and needs no cookies:
 *   https://www.tiktok.com/embed/music/<slug-id>  -> HTML containing
 *   https://www.tiktok.com/@user/video/<id> links for videos using that sound.
 */
async function resolveMusicPage(url, limit = 5) {
  // normalize: keep only slug-<id>, strip query
  const m = url.match(/(?:music|audio)\/([\w%.\-]*\d{10,})/i);
  if (!m) return [];
  const embedUrl = `https://www.tiktok.com/embed/music/${m[1]}`;
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      writeVerboseLog('TikTokExtractor', `Embed page ${embedUrl} returned HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    const seen = new Set();
    const out = [];
    for (const match of html.matchAll(/https:\/\/www\.tiktok\.com\/@([\w.\-]+)\/video\/(\d+)/g)) {
      const link = `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
      if (!seen.has(link)) {
        seen.add(link);
        out.push({ url: link, author: match[1] });
        if (out.length >= limit) break;
      }
    }
    writeVerboseLog('TikTokExtractor', `Resolved ${out.length} videos from sound page ${url}`);
    return out;
  } catch (err) {
    writeVerboseLog('TikTokExtractor', `Embed resolution failed for ${url}: ${err.message}`);
    return [];
  }
}

export class TikTokExtractor extends BaseExtractor {
  static identifier = 'TikTokExtractor';

  async validate(query, type) {
    if (typeof query !== 'string') return false;
    return TIKTOK_URL_RE.test(query) || SHORT_URL_RE.test(query);
  }

  async getRelatedTracks(track, history) {
    return this.createResponse();
  }

  async handle(query, context) {
    try {
      // Sound share pages: resolve to concrete videos first
      if (MUSIC_URL_RE.test(query)) {
        const videos = await resolveMusicPage(query);
        if (!videos.length) {
          console.error(`[TikTokExtractor] Could not resolve any videos for sound page`);
          return this.createResponse(null, []);
        }
        const tracks = [];
        for (const v of videos) {
          try {
            const data = await youtubeDl(v.url, ytdlpOptions({ dumpJson: true, noPlaylist: true }));
            if (!data) continue;
            tracks.push(this.#makeTrack(data, context));
            if (tracks.length >= 3) break; // top 3 uses of the sound is plenty
          } catch (err) {
            writeVerboseLog('TikTokExtractor', `Skipping ${v.url}: ${err.message?.split('\n')[0]}`);
          }
        }
        if (!tracks.length) return this.createResponse(null, []);
        return this.createResponse(null, tracks);
      }

      // Regular video or short link: direct metadata dump
      const data = await youtubeDl(query, ytdlpOptions({ dumpJson: true, noPlaylist: true }));
      if (!data) {
        writeVerboseLog('TikTokExtractor', `Failed to dump info: no data for ${query}`);
        return this.createResponse();
      }

      writeVerboseLog('TikTokExtractor', `Successfully fetched data for ${query}. Track: ${data.title}`);
      return this.createResponse(null, [this.#makeTrack(data, context)]);
    } catch (error) {
      writeVerboseLog('TikTokExtractor', `Validation/Extraction Error: ${error.stack || error}`);
      console.error(`[TikTokExtractor] Failed to search: ${error.message?.split('\n')[0]}`);
      return this.createResponse();
    }
  }

  #makeTrack(data, context) {
    const track = new Track(this.context.player, {
      title: data.title || 'TikTok Video',
      description: data.description || '',
      author: data.uploader || data.creator || 'TikToker',
      url: data.webpage_url || query,
      thumbnail: data.thumbnail || '',
      duration: (data.duration ? Math.floor(data.duration) : 0).toString(),
      views: data.view_count || 0,
      requestedBy: context.requestedBy,
      source: 'arbitrary', // prevents default YouTube logic from hijacking streams
    });
    track.extractor = this;
    return track;
  }

  async emptyResponse() {
    return this.createResponse();
  }

  async stream(info) {
    writeVerboseLog('TikTokExtractor', `Requested stream extraction for: ${info.url}`);
    try {
      const stream = youtubeDl.exec(info.url, ytdlpOptions({
        output: '-',
        format: 'bestaudio/best',
      }));

      stream.stderr.on('data', (data) => {
        writeVerboseLog('TikTokExtractor:ytdlp', data.toString().trim());
      });

      stream.on('error', (err) => {
        writeVerboseLog('TikTokExtractor:Process', `Process error: ${err.stack || err}`);
      });

      return stream.stdout;
    } catch (error) {
      writeVerboseLog('TikTokExtractor:Stream', `Failed to stream: ${error.stack || error}`);
      console.error(`[TikTokExtractor] Failed to stream: ${error.message}`);
      throw error;
    }
  }
}
