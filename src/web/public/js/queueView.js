import { state, $, escapeHtml } from './state.js';

export function renderQueueFromState(tracks) {
  const list = $('#queue-list');
  if (!tracks || tracks.length === 0) {
    list.innerHTML = '<p class="empty-state">Queue is empty</p>';
    return;
  }

  list.innerHTML = tracks
    .map(
      (t) => `
    <div class="queue-item" data-pos="${t.position}">
      <span class="queue-pos">${t.position}</span>
      ${t.thumbnail ? `<img class="queue-thumb" src="${t.thumbnail}" alt="">` : '<div class="queue-thumb"></div>'}
      <div class="queue-info">
        <div class="queue-title">${escapeHtml(t.title)}</div>
        <div class="queue-artist">${escapeHtml(t.artist || 'Unknown')} • ${t.duration || '?:??'}</div>
      </div>
      <span class="queue-duration">${t.requestedBy || ''}</span>
      <button class="queue-remove" data-pos="${t.position}" title="Remove">✕</button>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('.queue-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/queue/${btn.dataset.pos}?guild=${state.currentGuildId}`, {
        method: 'DELETE',
      });
    });
  });
}

$('#queue-shuffle').addEventListener('click', async () => {
  await fetch('/api/queue/shuffle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: state.currentGuildId }),
  });
});
