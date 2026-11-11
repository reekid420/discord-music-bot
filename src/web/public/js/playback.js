import { state, $ } from './state.js';

/**
 * Play a search query / URL through the bot.
 * @param {string} query
 * @returns {{ success: boolean, title?, isPlaylist?, trackCount?, error? }}
 */
export async function playQuery(query) {
  if (!query || !query.trim()) return { success: false, error: 'Empty query' };
  if (!state.currentGuildId) {
    alert('Select a server first using the dropdown at the top.');
    return { success: false, error: 'No server selected' };
  }

  try {
    const res = await fetch('/api/player/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: state.currentGuildId, query: query.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');
    return {
      success: true,
      title: data.track,
      isPlaylist: data.isPlaylist,
      trackCount: data.trackCount,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Wire a search input + button pair to playQuery(). */
export function setupSearchBar(inputId, btnId) {
  const input = $(`#${inputId}`);
  const btn = $(`#${btnId}`);
  if (!input || !btn) return;

  const originalText = btn.textContent;

  async function submit() {
    const query = input.value.trim();
    if (!query) return;

    btn.disabled = true;
    btn.textContent = '⏳';

    const result = await playQuery(query);

    if (result?.success) {
      btn.textContent =
        result.isPlaylist && result.trackCount ? `✅ ${result.trackCount} tracks` : '✅';
      input.value = '';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2500);
    } else {
      btn.textContent = '❌';
      btn.title = result?.error || 'Failed';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        btn.title = '';
      }, 3000);
    }
  }

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}
