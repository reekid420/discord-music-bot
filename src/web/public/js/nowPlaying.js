import { state, $, formatMs } from './state.js';

/**
 * Now-playing view: scrubber, progress ticker and transport controls.
 */

export async function fetchPlayerState() {
  if (!state.currentGuildId) return;
  try {
    const res = await fetch(`/api/player?guild=${state.currentGuildId}`);
    state.playerState = await res.json();
    renderNowPlaying();
  } catch (err) {
    console.error('Failed to fetch player state:', err);
  }
}

export function renderNowPlaying() {
  const { active, currentTrack, progress, volume, paused, repeatMode } = state.playerState;

  if (!active || !currentTrack) {
    $('#np-title').textContent = 'Nothing Playing';
    $('#np-artist').textContent = '—';
    $('#np-requested').textContent = '';
    $('#np-thumbnail').classList.remove('visible');
    $('#np-placeholder').classList.remove('hidden');
    setScrubberPct(0);
    $('#np-current-time').textContent = '0:00';
    $('#np-total-time').textContent = '0:00';
    $('#ctrl-playpause').textContent = '▶';
    stopProgressTracking();
    return;
  }

  $('#np-title').textContent = currentTrack.title || 'Unknown';
  $('#np-artist').textContent = currentTrack.artist || 'Unknown';
  $('#np-requested').textContent = currentTrack.requestedBy
    ? `Requested by ${currentTrack.requestedBy}`
    : '';

  if (currentTrack.thumbnail) {
    $('#np-thumbnail').src = currentTrack.thumbnail;
    $('#np-thumbnail').classList.add('visible');
    $('#np-placeholder').classList.add('hidden');
  } else {
    $('#np-thumbnail').classList.remove('visible');
    $('#np-placeholder').classList.remove('hidden');
  }

  if (progress) {
    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    setScrubberPct(pct);
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

/** Set both the fill bar and the floating thumb to `pct` (0-100). */
function setScrubberPct(pct) {
  const clamp = Math.max(0, Math.min(100, pct));
  $('#np-progress-bar').style.width = `${clamp}%`;
  $('#np-scrubber-thumb').style.left = `${clamp}%`;
  const scrubber = $('#np-scrubber');
  if (scrubber) scrubber.setAttribute('aria-valuenow', Math.round(clamp));
}

/** Fire a seek request and immediately sync local progress state. */
async function seekTo(ms) {
  if (!state.currentGuildId || !state.playerState.active) return;
  const total = state.playerState.progress?.total || 0;
  if (!total) return;
  const clamped = Math.max(0, Math.min(ms, total));
  try {
    await fetch('/api/player/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: state.currentGuildId, position: clamped }),
    });
    if (state.playerState.progress) state.playerState.progress.current = clamped;
    startProgressTracking(clamped, total, state.playerState.paused);
    setScrubberPct(total > 0 ? (clamped / total) * 100 : 0);
    $('#np-current-time').textContent = formatMs(clamped);
  } catch (err) {
    console.error('[Seek]', err);
  }
}

function startProgressTracking(currentMs, totalMs, paused) {
  stopProgressTracking();
  if (paused || !totalMs) return;

  let elapsed = currentMs;
  state.progressInterval = setInterval(() => {
    if (state.scrubberDragging) return; // don't fight the user while dragging
    elapsed += 1000;
    if (elapsed > totalMs) elapsed = totalMs;
    setScrubberPct((elapsed / totalMs) * 100);
    $('#np-current-time').textContent = formatMs(elapsed);
    if (state.playerState.progress) state.playerState.progress.current = elapsed;
  }, 1000);
}

function stopProgressTracking() {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

// ─── Scrubber click / drag ───
(function initScrubber() {
  const scrubber = $('#np-scrubber');
  if (!scrubber) return;

  function pctFromEvent(e) {
    const rect = scrubber.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function onDragStart(e) {
    if (!state.playerState.active) return;
    e.preventDefault();
    state.scrubberDragging = true;
    scrubber.classList.add('dragging');
    stopProgressTracking(); // pause local ticker while dragging
    onDragMove(e);
  }

  function onDragMove(e) {
    if (!state.scrubberDragging) return;
    e.preventDefault();
    const pct = pctFromEvent(e) * 100;
    setScrubberPct(pct);
    const total = state.playerState.progress?.total || 0;
    if (total) $('#np-current-time').textContent = formatMs((pct / 100) * total);
  }

  function onDragEnd(e) {
    if (!state.scrubberDragging) return;
    state.scrubberDragging = false;
    scrubber.classList.remove('dragging');
    const total = state.playerState.progress?.total || 0;
    seekTo(Math.round(pctFromEvent(e) * total));
  }

  scrubber.addEventListener('mousedown', onDragStart);
  scrubber.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('touchend', onDragEnd);

  // Keyboard left/right (5 s) while the scrubber is focused
  scrubber.addEventListener('keydown', (e) => {
    const step = 5000;
    const total = state.playerState.progress?.total || 0;
    const cur = state.playerState.progress?.current || 0;
    if (e.key === 'ArrowRight') seekTo(cur + step);
    else if (e.key === 'ArrowLeft') seekTo(Math.max(0, cur - step));
    else if (e.key === 'Home') seekTo(0);
    else if (e.key === 'End') seekTo(total);
    else return;
    e.preventDefault();
  });
})();

// ─── Transport controls ───
$('#ctrl-playpause').addEventListener('click', async () => {
  const action = state.playerState.paused ? 'resume' : 'pause';
  await fetch(`/api/player/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: state.currentGuildId }),
  });
  state.playerState.paused = !state.playerState.paused;
  $('#ctrl-playpause').textContent = state.playerState.paused ? '▶' : '⏸';
  if (state.playerState.paused) stopProgressTracking();
  else fetchPlayerState();
});

$('#ctrl-skip').addEventListener('click', () => {
  fetch('/api/player/skip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: state.currentGuildId }),
  });
});

$('#ctrl-stop').addEventListener('click', () => {
  fetch('/api/player/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: state.currentGuildId }),
  });
  state.playerState = { active: false };
  renderNowPlaying();
});

const SEEK_STEP_MS = 10_000;
$('#ctrl-rewind').addEventListener('click', () => {
  seekTo(Math.max(0, (state.playerState.progress?.current || 0) - SEEK_STEP_MS));
});
$('#ctrl-forward').addEventListener('click', () => {
  const cur = state.playerState.progress?.current || 0;
  const total = state.playerState.progress?.total || 0;
  seekTo(Math.min(cur + SEEK_STEP_MS, total));
});

$('#ctrl-loop').addEventListener('click', async () => {
  if (!state.currentGuildId) return;
  const btn = $('#ctrl-loop');
  const next = (parseInt(btn.dataset.mode || '0') + 1) % 3; // 0 off, 1 track, 2 queue
  try {
    await fetch('/api/player/loop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: state.currentGuildId, mode: next }),
    });
    const loopLabels = { 0: '➡️', 1: '🔂', 2: '🔁' };
    btn.textContent = loopLabels[next];
    btn.dataset.mode = next;
    state.playerState.repeatMode = next;
  } catch (err) {
    console.error('Loop toggle failed:', err);
  }
});

$('#ctrl-volume').addEventListener('input', (e) => {
  $('#volume-label').textContent = `${e.target.value}%`;
});
$('#ctrl-volume').addEventListener('change', async (e) => {
  await fetch('/api/player/volume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild: state.currentGuildId, volume: parseInt(e.target.value) }),
  });
});
