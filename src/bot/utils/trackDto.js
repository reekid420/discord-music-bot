/**
 * Canonical plain-object shape for a track, shared by the web layer
 * and queue persistence.
 * @param {import('discord-player').Track} t
 */
export function serializeTrack(t) {
  return {
    title: t.title,
    artist: t.author,
    duration: t.duration,
    durationMs: t.durationMS,
    thumbnail: t.thumbnail,
    url: t.url,
    requestedBy: t.requestedBy?.tag || 'Unknown',
  };
}
