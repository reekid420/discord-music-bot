const LRCLIB_BASE = 'https://lrclib.net/api';
const UA = 'DJMiyabi/1.0 (Discord music bot)';

/**
 * Lyrics lookup via lrclib.net — free, no API key.
 */

/** Strip noise YouTube titles carry so searches match the real song. */
export function cleanTitle(title = '') {
  return title
    .replace(/\((?:official\s*)?(?:music\s*)?(?:video|audio|lyric[s]?|visualizer)[^)]*\)/gi, '')
    .replace(
      /\[(?:official\s*)?(?:music\s*)?(?:video|audio|lyric[s]?|visualizer|hd|4k)[^\]]*\]/gi,
      ''
    )
    .replace(/\s*(?:feat\.?|ft\.?)\s+.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Search lrclib for a track's lyrics.
 * @param {string} query - free-text search
 * @returns {{ trackName: string, artistName: string, plainLyrics: string|null, syncedLyrics: string|null } | null}
 */
export async function searchLyrics(query) {
  const res = await fetch(`${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`lrclib returned HTTP ${res.status}`);

  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  // Prefer entries that actually have plain lyrics
  return results.find((r) => r.plainLyrics) || results[0];
}
