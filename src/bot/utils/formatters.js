/**
 * Format milliseconds into MM:SS or HH:MM:SS string.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Create a text-based progress bar.
 * @param {number} current - Current position in ms
 * @param {number} total - Total duration in ms
 * @param {number} length - Bar character length
 * @returns {string}
 */
export function progressBar(current, total, length = 20) {
  if (!total || total <= 0) return '▬'.repeat(length);
  const progress = Math.round((current / total) * length);
  const bar = '▬'.repeat(Math.max(0, progress)) + '🔘' + '▬'.repeat(Math.max(0, length - progress - 1));
  return bar;
}

/**
 * Truncate text to a max length with ellipsis.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max = 50) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}
