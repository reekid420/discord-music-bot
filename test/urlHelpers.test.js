import { describe, it, expect } from 'vitest';
import { isYouTubePlaylistUrl, isUrl, pickSearchEngine } from '../src/bot/utils/urlHelpers.js';

const QT = { AUTO: 'auto', YOUTUBE_SEARCH: 'yt_search' };

describe('isYouTubePlaylistUrl', () => {
  it('detects youtube.com playlist links', () => {
    expect(isYouTubePlaylistUrl('https://www.youtube.com/playlist?list=PL123')).toBe(true);
    expect(isYouTubePlaylistUrl('https://youtube.com/watch?v=abc&list=PL123')).toBe(true);
  });

  it('rejects non-playlist and non-youtube URLs', () => {
    expect(isYouTubePlaylistUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isYouTubePlaylistUrl('https://youtu.be/abc?list=PL1')).toBe(false); // youtu.be not matched
    expect(isYouTubePlaylistUrl('not a url')).toBe(false);
  });
});

describe('isUrl', () => {
  it('matches http(s) URLs only', () => {
    expect(isUrl('http://x.com')).toBe(true);
    expect(isUrl('HTTPS://x.com')).toBe(true);
    expect(isUrl('ftp://x.com')).toBe(false);
    expect(isUrl('hello world')).toBe(false);
  });
});

describe('pickSearchEngine', () => {
  it('uses AUTO for any URL (playlists included)', () => {
    expect(pickSearchEngine('https://www.youtube.com/playlist?list=P', QT)).toBe(QT.AUTO);
    expect(pickSearchEngine('https://www.tiktok.com/@u/video/123', QT)).toBe(QT.AUTO);
  });

  it('uses YOUTUBE_SEARCH for plain text', () => {
    expect(pickSearchEngine('daft punk one more time', QT)).toBe(QT.YOUTUBE_SEARCH);
  });
});
