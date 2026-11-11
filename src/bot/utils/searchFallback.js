/**
 * YouTube's search endpoint silently returns zero results for some queries
 * (explicit/edgy terms are filtered, and rate-limited sessions come back
 * empty). When that happens, a text query still deserves a chance on
 * SoundCloud before the bot reports failure.
 */

/** NoResultError is what discord-player throws when every extractor came back empty. */
export function isNoResultsError(error) {
  return (
    error?.name === 'NoResultError' || /^no results found/i.test(error?.message ?? '')
  );
}

/**
 * Whether a failed /play attempt should be retried as a SoundCloud search:
 * only for plain-text queries (a pasted URL means the user wants that exact
 * source, not "whatever SoundCloud has"), and only for empty-search errors.
 *
 * @param {string} query - the original /play query
 * @param {Error|null} error - the error the first attempt failed with
 * @returns {boolean}
 */
export function shouldFallbackToSoundcloud(query, error) {
  if (!error || !isNoResultsError(error)) return false;
  if (/^https?:\/\//i.test(query ?? '')) return false;
  return true;
}
