import { BaseExtractor, Track } from 'discord-player';
import youtubeDl from 'youtube-dl-exec';
import { writeVerboseLog } from '../utils/logger.js';

export class TikTokExtractor extends BaseExtractor {
  static identifier = 'TikTokExtractor';

  // Validate if the query is a TikTok URL
  async validate(query, type) {
    if (typeof query !== 'string') return false;
    // Regex matches common TikTok URL formats
    return /https?:\/\/(?:www\.)?tiktok\.com\/@.*\/video\/\d+/.test(query) || 
           /https?:\/\/vt\.tiktok\.com\/\w+/.test(query) ||
           /https?:\/\/vm\.tiktok\.com\/\w+/.test(query) ||
           /https?:\/\/(?:www\.)?tiktok\.com\/t\/\w+/.test(query);
  }

  async getRelatedTracks(track, history) {
    return this.createResponse();
  }

  async handle(query, context) {
    try {
      // Dump video information via yt-dlp
      const data = await youtubeDl(query, {
        dumpJson: true,
        noWarnings: true,
        noPlaylist: true
      });

      if (!data) {
        writeVerboseLog('TikTokExtractor', `Failed to dump info: no data for ${query}`);
        return this.createResponse();
      }

      writeVerboseLog('TikTokExtractor', `Successfully fetched data for ${query}. Track: ${data.title}`);

      const track = new Track(this.context.player, {
        title: data.title || 'TikTok Video',
        description: data.description || '',
        author: data.uploader || data.creator || 'TikToker',
        url: data.webpage_url || query,
        thumbnail: data.thumbnail || '',
        duration: (data.duration ? Math.floor(data.duration) : 0).toString(),
        views: data.view_count || 0,
        requestedBy: context.requestedBy,
        source: 'arbitrary' // using arbitrary prevents picking up default youtube logic
      });

      track.extractor = this;
      return this.createResponse(null, [track]);
    } catch (error) {
      writeVerboseLog('TikTokExtractor', `Validation/Extraction Error: ${error.stack || error}`);
      console.error(`[TikTokExtractor] Failed to search: ${error.message?.split('\n')[0]}`);
      return this.createResponse();
    }
  }

  async emptyResponse() {
    return this.createResponse();
  }

  async stream(info) {
    writeVerboseLog('TikTokExtractor', `Requested stream extraction for: ${info.url}`);
    // Info contains the Track object. We run yt-dlp to stream it out natively
    try {
      // Use the raw stream from yt-dlp outputting via stdout
      const stream = youtubeDl.exec(info.url, {
        output: '-',
        // Let it log warnings to stderr instead of quiet
        format: 'bestaudio/best'
      });

      // Capture stderr (which yt-dlp uses for logs/warnings/progress/errors)
      stream.stderr.on('data', (data) => {
        writeVerboseLog('TikTokExtractor:ytdlp', data.toString().trim());
      });

      stream.on('error', (err) => {
        writeVerboseLog('TikTokExtractor:Process', `Process error: ${err.stack || err}`);
      });

      // Stream stdout to discord-player
      return stream.stdout;
    } catch (error) {
      writeVerboseLog('TikTokExtractor:Stream', `Failed to stream: ${error.stack || error}`);
      console.error(`[TikTokExtractor] Failed to stream: ${error.message}`);
      throw error;
    }
  }
}
