/* ═══════════════════════════════════════════════
   Groove Dashboard — Client-Side Application
   ═══════════════════════════════════════════════ */

// ─── State ───
let socket = null;
let currentGuildId = null;
let playerState = { active: false };
let progressInterval = null;

// ─── DOM Elements ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Auth ───
async function checkAuth() {
  try {
    const res = await fetch('/api/guilds');
    if (res.ok) {
      showDashboard();
      return true;
    }
  } catch (e) {}
  showLogin();
  return false;
}

function showLogin() {
  $('#login-screen').hidden = false;
  $('#dashboard').hidden = true;
}

function showDashboard() {
  $('#login-screen').hidden = true;
  $('#dashboard').hidden = false;
  initSocket();
  loadGuilds();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#login-password').value;
  const errEl = $('#login-error');
  errEl.hidden = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      showDashboard();
    } else {
      errEl.textContent = 'Invalid password';
      errEl.hidden = false;
    }
  } catch (err) {
    errEl.textContent = 'Connection error';
    errEl.hidden = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  showLogin();
  if (socket) socket.disconnect();
});

// ─── Socket.io ───
function initSocket() {
  if (socket) return;
  socket = io();

  socket.on('connect', () => console.log('[WS] Connected'));

  socket.on('playerState', (data) => {
    if (data.guildId === currentGuildId) {
      playerState = data;
      renderNowPlaying();
      renderQueueFromState(data.queue);
    }
  });

  socket.on('trackStart', (data) => {
    if (data.guildId === currentGuildId) {
      playerState.active = true;
      playerState.currentTrack = data.track;
      playerState.paused = false;
      renderNowPlaying();
      renderQueueFromState(data.queue);
      // Refresh player state for progress tracking
      fetchPlayerState();
    }
  });

  socket.on('queueUpdate', (data) => {
    if (data.guildId === currentGuildId) {
      renderQueueFromState(data.queue);
    }
  });

  socket.on('playerDisconnect', (data) => {
    if (data.guildId === currentGuildId) {
      playerState = { active: false };
      renderNowPlaying();
      renderQueueFromState([]);
    }
  });
}

// ─── Search / Play Query ───
async function playQuery(query) {
  if (!query || !query.trim()) return;
  if (!currentGuildId) {
    alert('Select a server first using the dropdown at the top.');
    return;
  }

  try {
    const res = await fetch('/api/player/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: currentGuildId, query: query.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');
    return { success: true, title: data.track };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function setupSearchBar(inputId, btnId) {
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
      btn.textContent = '✅';
      input.value = '';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    } else {
      btn.textContent = '❌';
      btn.title = result?.error || 'Failed';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.title = ''; }, 3000);
    }
  }

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// Wire up both search bars on load
setupSearchBar('search-input', 'search-btn');
setupSearchBar('search-input-queue', 'search-btn-queue');

// ─── Guild Selector ───
async function loadGuilds() {
  try {
    const res = await fetch('/api/guilds');
    const guilds = await res.json();
    const select = $('#guild-selector');
    select.innerHTML = '';

    if (guilds.length === 0) {
      select.innerHTML = '<option value="">No guilds</option>';
      return;
    }

    guilds.forEach((g, i) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });

    // Select first guild
    selectGuild(guilds[0].id);
  } catch (err) {
    console.error('Failed to load guilds:', err);
  }
}

$('#guild-selector').addEventListener('change', (e) => {
  selectGuild(e.target.value);
});

function selectGuild(guildId) {
  currentGuildId = guildId;
  $('#guild-selector').value = guildId;
  if (socket) socket.emit('selectGuild', guildId);
  fetchPlayerState();
  // Reload views that are guild-specific
  loadSettings();
}

// ─── Navigation ───
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const viewId = btn.dataset.view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${viewId}`).classList.add('active');

    // Load view-specific data
    if (viewId === 'playlists') loadPlaylists();
    if (viewId === 'upload') loadUploadedFiles();
    if (viewId === 'settings') loadSettings();
  });
});

// ─── Now Playing ───
async function fetchPlayerState() {
  if (!currentGuildId) return;
  try {
    const res = await fetch(`/api/player?guild=${currentGuildId}`);
    const data = await res.json();
    playerState = data;
    renderNowPlaying();
  } catch (err) {
    console.error('Failed to fetch player state:', err);
  }
}

function renderNowPlaying() {
  const { active, currentTrack, progress, volume, paused, repeatMode } = playerState;

  if (!active || !currentTrack) {
    $('#np-title').textContent = 'Nothing Playing';
    $('#np-artist').textContent = '—';
    $('#np-requested').textContent = '';
    $('#np-thumbnail').classList.remove('visible');
    $('#np-placeholder').classList.remove('hidden');
    $('#np-progress-bar').style.width = '0%';
    $('#np-current-time').textContent = '0:00';
    $('#np-total-time').textContent = '0:00';
    $('#ctrl-playpause').textContent = '▶';
    stopProgressTracking();
    return;
  }

  $('#np-title').textContent = currentTrack.title || 'Unknown';
  $('#np-artist').textContent = currentTrack.artist || 'Unknown';
  $('#np-requested').textContent = currentTrack.requestedBy ? `Requested by ${currentTrack.requestedBy}` : '';

  if (currentTrack.thumbnail) {
    $('#np-thumbnail').src = currentTrack.thumbnail;
    $('#np-thumbnail').classList.add('visible');
    $('#np-placeholder').classList.add('hidden');
  } else {
    $('#np-thumbnail').classList.remove('visible');
    $('#np-placeholder').classList.remove('hidden');
  }

  if (progress) {
    const pct = progress.total > 0 ? (progress.current / progress.total * 100) : 0;
    $('#np-progress-bar').style.width = `${pct}%`;
    $('#np-current-time').textContent = progress.currentLabel || '0:00';
    $('#np-total-time').textContent = progress.totalLabel || '0:00';
    startProgressTracking(progress.current, progress.total, paused);
  }

  $('#ctrl-playpause').textContent = paused ? '▶' : '⏸';
  if (volume !== undefined) {
    $('#ctrl-volume').value = volume;
    $('#volume-label').textContent = `${volume}%`;
  }

  const loopLabels = { 0: '➡️', 1: '🔂', 2: '🔁' };
  $('#ctrl-loop').textContent = loopLabels[repeatMode] || '➡️';
  $('#ctrl-loop').dataset.mode = repeatMode || 0;
}

function startProgressTracking(currentMs, totalMs, paused) {
  stopProgressTracking();
  if (paused || !totalMs) return;

  let elapsed = currentMs;
  progressInterval = setInterval(() => {
    elapsed += 1000;
    if (elapsed > totalMs) elapsed = totalMs;
    const pct = (elapsed / totalMs * 100);
    $('#np-progress-bar').style.width = `${pct}%`;
    $('#np-current-time').textContent = formatMs(elapsed);
  }, 1000);
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Player Controls ───
$('#ctrl-playpause').addEventListener('click', async () => {
  const action = playerState.paused ? 'resume' : 'pause';
  await fetch(`/api/player/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: currentGuildId }),
  });
  playerState.paused = !playerState.paused;
  $('#ctrl-playpause').textContent = playerState.paused ? '▶' : '⏸';
  if (playerState.paused) stopProgressTracking();
  else fetchPlayerState();
});

$('#ctrl-skip').addEventListener('click', async () => {
  await fetch('/api/player/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: currentGuildId }),
  });
});

$('#ctrl-stop').addEventListener('click', async () => {
  await fetch('/api/player/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: currentGuildId }),
  });
  playerState = { active: false };
  renderNowPlaying();
  renderQueueFromState([]);
});

$('#ctrl-volume').addEventListener('input', (e) => {
  $('#volume-label').textContent = `${e.target.value}%`;
});
$('#ctrl-volume').addEventListener('change', async (e) => {
  await fetch('/api/player/volume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: currentGuildId, volume: parseInt(e.target.value) }),
  });
});

// ─── Queue ───
function renderQueueFromState(tracks) {
  const list = $('#queue-list');
  if (!tracks || tracks.length === 0) {
    list.innerHTML = '<p class="empty-state">Queue is empty</p>';
    return;
  }

  list.innerHTML = tracks.map(t => `
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
  `).join('');

  // Attach remove handlers
  list.querySelectorAll('.queue-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pos = btn.dataset.pos;
      await fetch(`/api/queue/${pos}?guild=${currentGuildId}`, { method: 'DELETE' });
    });
  });
}

$('#queue-shuffle').addEventListener('click', async () => {
  await fetch('/api/queue/shuffle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: currentGuildId }),
  });
});

// ─── Playlists ───
let currentPlaylistId = null;

async function loadPlaylists() {
  try {
    const res = await fetch('/api/playlists');
    const playlists = await res.json();
    renderPlaylists(playlists);
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

  grid.innerHTML = playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <div class="playlist-card-name">${p.is_public ? '🌐' : '🔒'} ${escapeHtml(p.name)}</div>
      <div class="playlist-card-meta">${p.trackCount} tracks</div>
    </div>
  `).join('');

  grid.querySelectorAll('.playlist-card').forEach(card => {
    card.addEventListener('click', () => openPlaylistDetail(parseInt(card.dataset.id)));
  });
}

async function openPlaylistDetail(id) {
  currentPlaylistId = id;
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

  list.innerHTML = tracks.map((t, i) => `
    <div class="playlist-track-item">
      <span class="playlist-track-pos">${i + 1}</span>
      <span class="playlist-track-title">${escapeHtml(t.title)}</span>
      <button class="playlist-track-remove" data-id="${t.id}" title="Remove">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.playlist-track-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const trackId = btn.dataset.id;
      await fetch(`/api/playlists/${currentPlaylistId}/tracks/${trackId}`, { method: 'DELETE' });
      openPlaylistDetail(currentPlaylistId);
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
  if (!currentPlaylistId || !currentGuildId) return;
  const btn = $('#playlist-enqueue-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Loading...';
  try {
    await fetch(`/api/playlists/${currentPlaylistId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: currentGuildId }),
    });
    btn.textContent = '✅ Enqueued!';
    setTimeout(() => { btn.textContent = '▶ Play All'; btn.disabled = false; }, 2000);
  } catch (err) {
    btn.textContent = '❌ Failed';
    setTimeout(() => { btn.textContent = '▶ Play All'; btn.disabled = false; }, 2000);
  }
});

$('#playlist-delete-btn').addEventListener('click', async () => {
  if (!currentPlaylistId) return;
  if (!confirm('Delete this playlist?')) return;
  await fetch(`/api/playlists/${currentPlaylistId}`, { method: 'DELETE' });
  $('#playlist-back-btn').click();
});

// Create playlist
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
      body: JSON.stringify({ name, ownerId: 'dashboard', guildId: currentGuildId }),
    });
    $('#playlist-create-form').hidden = true;
    $('#playlist-name-input').value = '';
    loadPlaylists();
  } catch (err) {
    console.error('Failed to create playlist:', err);
  }
});

// ─── Upload ───
const dropzone = $('#upload-dropzone');
const fileInput = $('#upload-input');

$('#upload-browse-btn').addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', (e) => {
  if (e.target !== dropzone && !dropzone.contains(e.target)) return;
  if (e.target.tagName === 'BUTTON') return;
  fileInput.click();
});

dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFile(fileInput.files[0]);
});

async function uploadFile(file) {
  const progressEl = $('#upload-progress');
  const progressBar = $('#upload-progress-bar');
  const progressText = $('#upload-progress-text');

  progressEl.hidden = false;
  progressBar.style.width = '0%';
  progressText.textContent = `Uploading ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Uploading ${file.name}... ${Math.round(pct)}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        progressText.textContent = '✅ Upload complete!';
        setTimeout(() => { progressEl.hidden = true; }, 2000);
        loadUploadedFiles();
      } else {
        const err = JSON.parse(xhr.responseText);
        progressText.textContent = `❌ ${err.error || 'Upload failed'}`;
      }
    };

    xhr.onerror = () => {
      progressText.textContent = '❌ Upload failed';
    };

    xhr.send(formData);
  } catch (err) {
    progressText.textContent = '❌ Upload failed';
  }
}

async function loadUploadedFiles() {
  try {
    const res = await fetch('/api/upload');
    const files = await res.json();
    renderUploadedFiles(files);
  } catch (err) {
    console.error('Failed to load files:', err);
  }
}

function renderUploadedFiles(files) {
  const list = $('#uploaded-files-list');
  if (!files || files.length === 0) {
    list.innerHTML = '<p class="empty-state">No files uploaded yet</p>';
    return;
  }

  list.innerHTML = files.map(f => `
    <div class="uploaded-file-item">
      <span class="uploaded-file-name">🎵 ${escapeHtml(f.title || f.filename)}</span>
      <div class="uploaded-file-actions">
        <button class="btn btn-primary btn-sm" onclick="playUploadedFile(${f.id})">▶ Play</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUploadedFile(${f.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

window.playUploadedFile = async (id) => {
  if (!currentGuildId) return alert('Select a guild first');
  try {
    await fetch(`/api/upload/${id}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: currentGuildId }),
    });
  } catch (err) {
    console.error('Failed to play file:', err);
  }
};

window.deleteUploadedFile = async (id) => {
  if (!confirm('Delete this file?')) return;
  await fetch(`/api/upload/${id}`, { method: 'DELETE' });
  loadUploadedFiles();
};

// ─── Settings ───
async function loadSettings() {
  if (!currentGuildId) return;
  try {
    const res = await fetch(`/api/settings?guild=${currentGuildId}`);
    const { settings, roles } = await res.json();

    // DJ Role dropdown
    const djSelect = $('#setting-dj-role');
    djSelect.innerHTML = '<option value="">None</option>';
    roles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      if (r.id === settings.dj_role_id) opt.selected = true;
      djSelect.appendChild(opt);
    });

    // Vote threshold
    const vt = Math.round((settings.vote_threshold || 0.51) * 100);
    $('#setting-vote-threshold').value = vt;
    $('#vote-threshold-label').textContent = `${vt}%`;

    // Auto-leave
    $('#setting-auto-leave').value = settings.auto_leave_s || 300;

    // Default volume
    $('#setting-default-volume').value = settings.default_volume || 80;
    $('#default-volume-label').textContent = `${settings.default_volume || 80}%`;

  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

$('#setting-vote-threshold').addEventListener('input', (e) => {
  $('#vote-threshold-label').textContent = `${e.target.value}%`;
});

$('#setting-default-volume').addEventListener('input', (e) => {
  $('#default-volume-label').textContent = `${e.target.value}%`;
});

$('#settings-save-btn').addEventListener('click', async () => {
  const status = $('#settings-status');
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guild: currentGuildId,
        dj_role_id: $('#setting-dj-role').value || null,
        vote_threshold: parseInt($('#setting-vote-threshold').value) / 100,
        auto_leave_s: parseInt($('#setting-auto-leave').value),
        default_volume: parseInt($('#setting-default-volume').value),
      }),
    });
    status.textContent = '✅ Settings saved!';
    status.style.color = 'var(--success)';
    status.hidden = false;
    setTimeout(() => { status.hidden = true; }, 3000);
  } catch (err) {
    status.textContent = '❌ Failed to save settings';
    status.style.color = 'var(--danger)';
    status.hidden = false;
  }
});

// ─── Utility ───
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ───
checkAuth();

// Refresh player state periodically
setInterval(() => {
  if (currentGuildId && playerState.active) {
    fetchPlayerState();
  }
}, 10000);
