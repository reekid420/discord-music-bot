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

/** Normalize for fuzzy comparison: lowercase, strip punctuation/extra spaces. */
function norm(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Pick the lrclib result that actually matches the requested song.
 * lrclib's search endpoint ranks by popularity, so sequels and variants
 * ("X 2", "X: HOMECOMING") routinely outrank the original — score by title
 * similarity instead, preferring entries that carry lyrics.
 *
 * @param {Array<{trackName: string, artistName: string, plainLyrics: ?string, syncedLyrics: ?string}>} results
 * @param {string} wantedTitle
 * @param {string} [wantedArtist]
 * @returns {object|null}
 */
export function pickBestMatch(results, wantedTitle, wantedArtist = '') {
  if (!Array.isArray(results) || results.length === 0) return null;
  const want = norm(wantedTitle);
  const wantArtist = norm(wantedArtist);
  if (!want) return results.find((r) => r.plainLyrics) ?? results[0];

  const score = (r) => {
    const t = norm(r.trackName);
    let s;
    if (t === want) s = 4;
    else if (t.startsWith(want) || want.startsWith(t)) s = 3;
    else if (t.includes(want) || want.includes(t)) s = 2;
    else s = 1;
    if (wantArtist && norm(r.artistName) === wantArtist) s += 0.5;
    if (r.plainLyrics || r.syncedLyrics) s += 0.25;
    return s;
  };

  return results.reduce((best, r) => (score(r) > score(best) ? r : best), results[0]);
}

async function lrclibGet(params) {
  const res = await fetch(`${LRCLIB_BASE}/get?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) return null; // 404 = no exact catalog record
  return res.json();
}

/**
 * Look up lyrics for a track, exact-catalog-first:
 *  1. lrclib /get with artist + title (immune to popularity ranking)
 *  2. lrclib /search ranked by title similarity via pickBestMatch
 *
 * @param {{ artist?: string, title: string }} track
 * @returns {object|null} lrclib record with plainLyrics/syncedLyrics, or null
 */
export async function findLyrics({ artist = '', title = '' }) {
  // YouTube authors often carry trailing separators ("DigBar-")
  const cleanArtist = artist.replace(/[\s\-_–—]+$/, '').trim();
  const clean = cleanTitle(title);
  if (!clean) return null;

  if (cleanArtist) {
    const exact = await lrclibGet({ artist_name: cleanArtist, track_name: clean }).catch(
      () => null
    );
    if (exact?.plainLyrics || exact?.syncedLyrics) return exact;
  }

  const q = cleanArtist ? `${cleanArtist} ${clean}` : clean;
  const res = await fetch(`${LRCLIB_BASE}/search?q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`lrclib returned HTTP ${res.status}`);
  const results = await res.json();
  return pickBestMatch(results, clean, cleanArtist);
}
