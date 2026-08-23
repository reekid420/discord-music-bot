/**
 * Shared client-side state and tiny DOM helpers.
 */

export const state = {
  socket: null,
  currentGuildId: null,
  playerState: { active: false },
  progressInterval: null,
  scrubberDragging: false,
  currentPlaylistId: null,
};

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Detect a YouTube playlist/mix URL (has a `list` param on youtube.com)
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
