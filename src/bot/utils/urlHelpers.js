/**
 * Returns true if the query is a YouTube playlist or mix URL
 * (i.e. has a `list` query param on a youtube.com domain).
 * This is used to select the right discord-player QueryType so we pass
 * YouTube playlist URLs through as AUTO (full playlist load) while
 * plain text searches stay as YOUTUBE_SEARCH (single-track, no Mix dump).
 *
 * @param {string} query
 * @returns {boolean}
 */
export function isYouTubePlaylistUrl(query) {
  try {
    const u = new URL(query);
    return (
      (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') &&
      u.searchParams.has('list')
    );
  } catch {
    return false;
  }
}

/**
 * Returns true if the query looks like any HTTP/S URL.
 * @param {string} query
 * @returns {boolean}
 */
export function isUrl(query) {
  return /^https?:\/\//i.test(query);
}

/**
 * Pick the right discord-player QueryType for a query string:
 * - YouTube playlist URL → AUTO  (loads full playlist)
 * - Any other URL        → AUTO  (direct link, extractor auto-detects)
 * - Plain text search    → YOUTUBE_SEARCH  (single result, no Mix)
 *
 * @param {string} query
 * @param {import('discord-player').QueryType} QueryType
 * @returns {string}
 */
export function pickSearchEngine(query, QueryType) {
  if (isYouTubePlaylistUrl(query) || isUrl(query)) return QueryType.AUTO;
  return QueryType.YOUTUBE_SEARCH;
}
