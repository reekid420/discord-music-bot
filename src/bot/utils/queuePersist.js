import { useQueue } from 'discord-player';
import { saveQueueSnapshot, deleteQueueSnapshot } from '../../db/database.js';

/**
 * Queue persistence: capture a guild's queue into SQLite so it survives
 * restarts and can be restored with /replay.
 */

/**
 * Snapshot the current queue state for a guild. No-op if nothing is queued.
 * @param {string} guildId
 */
export function captureQueueSnapshot(guildId) {
  const queue = useQueue(guildId);
  if (!queue) return;

  const progress = queue.node.getTimestamp();
  const payload = {
    current: queue.currentTrack
      ? { url: queue.currentTrack.url, title: queue.currentTrack.title }
      : null,
    position: progress?.current?.value || 0,
    tracks: queue.tracks.toArray().map((t) => ({ url: t.url, title: t.title })),
    volume: queue.node.volume,
  };

  // Nothing worth restoring: no current track and nothing upcoming
  if (!payload.current && payload.tracks.length === 0) {
    deleteQueueSnapshot(guildId);
    return;
  }

  try {
    saveQueueSnapshot(guildId, payload);
  } catch (err) {
    console.error('[QueuePersist] Failed to save snapshot:', err.message);
  }
}

/**
 * Remove a guild's snapshot — used when a queue finishes naturally.
 * @param {string} guildId
 */
export function clearQueueSnapshot(guildId) {
  try {
    deleteQueueSnapshot(guildId);
  } catch {
    /* best effort */
  }
}
