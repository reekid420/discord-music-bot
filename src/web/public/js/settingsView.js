import { state, $ } from './state.js';

export async function loadSettings() {
  if (!state.currentGuildId) return;
  try {
    const res = await fetch(`/api/settings?guild=${state.currentGuildId}`);
    const { settings, roles } = await res.json();

    // DJ Role dropdown
    const djSelect = $('#setting-dj-role');
    djSelect.innerHTML = '<option value="">None</option>';
    roles.forEach((r) => {
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
        guild: state.currentGuildId,
        dj_role_id: $('#setting-dj-role').value || null,
        vote_threshold: parseInt($('#setting-vote-threshold').value) / 100,
        auto_leave_s: parseInt($('#setting-auto-leave').value),
        default_volume: parseInt($('#setting-default-volume').value),
      }),
    });
    status.textContent = '✅ Settings saved!';
    status.style.color = 'var(--success)';
    status.hidden = false;
    setTimeout(() => {
      status.hidden = true;
    }, 3000);
  } catch (err) {
    status.textContent = '❌ Failed to save settings';
    status.style.color = 'var(--danger)';
    status.hidden = false;
  }
});
