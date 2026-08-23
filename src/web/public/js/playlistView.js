import { state, $, escapeHtml, isYouTubePlaylistUrl } from './state.js';

export async function loadPlaylists() {
  try {
    const res = await fetch('/api/playlists');
    renderPlaylists(await res.json());
  } catch (err) {
    console.error('Failed to load playlists:', err);
  }
}

function renderPlaylists(playlists) {
  const grid = $('#playlists-grid');
  if (!playlists || playlists.length === 0) {
    grid.innerHTML = '<p class="empty-state">No playlists yet</p>';
    return;
  }

  grid.innerHTML = playlists
    .map(
      (p) => `
    <div class="playlist-card" data-id="${p.id}">
      <div class="playlist-card-name">${p.is_public ? '🌐' : '🔒'} ${escapeHtml(p.name)}</div>
      <div class="playlist-card-meta">${p.trackCount} tracks</div>
    </div>
  `
    )
    .join('');

  grid.querySelectorAll('.playlist-card').forEach((card) => {
    card.addEventListener('click', () => openPlaylistDetail(parseInt(card.dataset.id)));
  });
}

async function openPlaylistDetail(id) {
  state.currentPlaylistId = id;
  try {
    const res = await fetch(`/api/playlists/${id}`);
    const data = await res.json();

    $('#playlist-detail-name').textContent = data.name;
    $('#playlists-grid').hidden = true;
    $('#playlist-create-btn').hidden = true;
    $('#playlist-detail').hidden = false;

    renderPlaylistTracks(data.tracks || []);
  } catch (err) {
    console.error('Failed to load playlist:', err);
  }
}

function renderPlaylistTracks(tracks) {
  const list = $('#playlist-tracks-list');
  if (!tracks.length) {
    list.innerHTML = '<p class="empty-state">No tracks in this playlist</p>';
    return;
  }

  list.innerHTML = tracks
    .map(
      (t, i) => `
    <div class="playlist-track-item">
      <span class="playlist-track-pos">${i + 1}</span>
      <span class="playlist-track-title">${escapeHtml(t.title)}</span>
      <button class="playlist-track-remove" data-id="${t.id}" title="Remove">✕</button>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('.playlist-track-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/playlists/${state.currentPlaylistId}/tracks/${btn.dataset.id}`, {
        method: 'DELETE',
      });
      openPlaylistDetail(state.currentPlaylistId);
    });
  });
}

$('#playlist-back-btn').addEventListener('click', () => {
  $('#playlist-detail').hidden = true;
  $('#playlists-grid').hidden = false;
  $('#playlist-create-btn').hidden = false;
  loadPlaylists();
});

$('#playlist-enqueue-btn').addEventListener('click', async () => {
  if (!state.currentPlaylistId || !state.currentGuildId) return;
  const btn = $('#playlist-enqueue-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Loading...';
  try {
    await fetch(`/api/playlists/${state.currentPlaylistId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: state.currentGuildId }),
    });
    btn.textContent = '✅ Enqueued!';
    setTimeout(() => {
      btn.textContent = '▶ Play All';
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    btn.textContent = '❌ Failed';
    setTimeout(() => {
      btn.textContent = '▶ Play All';
      btn.disabled = false;
    }, 2000);
  }
});

$('#playlist-delete-btn').addEventListener('click', async () => {
  if (!state.currentPlaylistId) return;
  if (!confirm('Delete this playlist?')) return;
  await fetch(`/api/playlists/${state.currentPlaylistId}`, { method: 'DELETE' });
  $('#playlist-back-btn').click();
});

// ─── Add song / bulk import ───
(function setupPlaylistAddSong() {
  const input = $('#playlist-add-input');
  const btn = $('#playlist-add-btn');
  if (!input || !btn) return;

  async function submit() {
    const query = input.value.trim();
    if (!query || !state.currentPlaylistId) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
      // YouTube playlist URL → bulk import
      if (isYouTubePlaylistUrl(query)) {
        const importRes = await fetch(`/api/playlists/${state.currentPlaylistId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: query }),
        });
        const data = await importRes.json();
        if (!importRes.ok) throw new Error(data.error || 'Import failed');

        const label = data.playlistTitle ? `"${data.playlistTitle}"` : 'playlist';
        btn.textContent = `✅ ${data.added} tracks`;
        btn.title = `Imported ${data.added} of ${data.total} tracks from ${label}`;
        input.value = '';
        openPlaylistDetail(state.currentPlaylistId);
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
          btn.title = '';
        }, 3000);
        return;
      }

      // Single track search
      const searchRes = await fetch(`/api/player/search?query=${encodeURIComponent(query)}`);
      if (!searchRes.ok) throw new Error('Search failed');
      const { tracks } = await searchRes.json();
      if (!tracks || !tracks.length) throw new Error('No results found');

      const track = tracks[0];
      const addRes = await fetch(`/api/playlists/${state.currentPlaylistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          url: track.url,
          duration_ms: track.durationMs,
          thumbnail: track.thumbnail,
        }),
      });
      if (!addRes.ok) throw new Error('Failed to add track');

      btn.textContent = '✅';
      input.value = '';
      openPlaylistDetail(state.currentPlaylistId);
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    } catch (err) {
      btn.textContent = '❌';
      btn.title = err.message;
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
})();

// ─── Create playlist ───
$('#playlist-create-btn').addEventListener('click', () => {
  $('#playlist-create-form').hidden = false;
  $('#playlist-name-input').focus();
});

$('#playlist-cancel-btn').addEventListener('click', () => {
  $('#playlist-create-form').hidden = true;
  $('#playlist-name-input').value = '';
});

$('#playlist-save-btn').addEventListener('click', async () => {
  const name = $('#playlist-name-input').value.trim();
  if (!name) return;

  try {
    await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // is_public=true so Discord slash commands can discover web-created playlists
      body: JSON.stringify({
        name,
        ownerId: 'dashboard',
        guildId: state.currentGuildId,
        is_public: true,
      }),
    });
    $('#playlist-create-form').hidden = true;
    $('#playlist-name-input').value = '';
    loadPlaylists();
  } catch (err) {
    console.error('Failed to create playlist:', err);
  }
});
