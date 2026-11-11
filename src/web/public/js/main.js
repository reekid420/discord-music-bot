import { state, $, $$ } from './state.js';
import { initSocket } from './socket.js';
import { fetchPlayerState, renderNowPlaying } from './nowPlaying.js';
import { renderQueueFromState } from './queueView.js';
import { setupSearchBar } from './playback.js';
import { loadPlaylists } from './playlistView.js';
import { loadUploadedFiles } from './uploadView.js';
import { loadSettings } from './settingsView.js';

/* ═══════════════════════════════════════════════
   DJ Miyabi Dashboard — entry point
   ═══════════════════════════════════════════════ */

setupSearchBar('search-input', 'search-btn');

// ─── Auth ───
function showLogin() {
  $('#login-screen').hidden = false;
  $('#dashboard').hidden = true;
}

function showDashboardUI() {
  $('#login-screen').hidden = true;
  $('#dashboard').hidden = false;
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
      enterDashboard();
    } else {
      errEl.textContent = 'Invalid password';
      errEl.hidden = false;
    }
  } catch {
    errEl.textContent = 'Connection error';
    errEl.hidden = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  showLogin();
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
});

// ─── Guilds ───
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

    guilds.forEach((g) => {
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
  state.currentGuildId = guildId;
  $('#guild-selector').value = guildId;
  if (state.socket) state.socket.emit('selectGuild', guildId);
  fetchPlayerState();
  // Reload views that are guild-specific
  loadSettings();
}

// ─── Navigation ───
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const viewId = btn.dataset.view;
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${viewId}`).classList.add('active');

    // Load view-specific data
    if (viewId === 'playlists') loadPlaylists();
    if (viewId === 'upload') loadUploadedFiles();
    if (viewId === 'settings') loadSettings();
  });
});

// ─── Boot ───
async function checkAuth() {
  try {
    const res = await fetch('/api/guilds');
    if (res.ok) {
      enterDashboard();
      return;
    }
  } catch {
    // fetch failed (offline or logged out) — fall through to login screen
  }
  showLogin();
}

function enterDashboard() {
  showDashboardUI();
  initSocket({
    onPlayerState(data) {
      if (data.guildId !== state.currentGuildId) return;
      state.playerState = data;
      renderNowPlaying();
      renderQueueFromState(data.queue);
    },
    onTrackStart(data) {
      if (data.guildId !== state.currentGuildId) return;
      state.playerState.active = true;
      state.playerState.currentTrack = data.track;
      state.playerState.paused = false;
      renderNowPlaying();
      renderQueueFromState(data.queue);
      // Refresh player state for progress tracking
      fetchPlayerState();
    },
    onQueueUpdate(data) {
      if (data.guildId === state.currentGuildId) {
        renderQueueFromState(data.queue);
      }
    },
    onPlayerDisconnect(data) {
      if (data.guildId !== state.currentGuildId) return;
      state.playerState = { active: false };
      renderNowPlaying();
      renderQueueFromState([]);
    },
  });
  loadGuilds();
}

checkAuth();

// Refresh player state periodically
setInterval(() => {
  if (state.currentGuildId && state.playerState.active) {
    fetchPlayerState();
  }
}, 10000);
