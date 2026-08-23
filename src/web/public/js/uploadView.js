import { state, $, escapeHtml } from './state.js';

export async function loadUploadedFiles() {
  try {
    const res = await fetch('/api/upload');
    renderUploadedFiles(await res.json());
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

  list.innerHTML = files
    .map(
      (f) => `
    <div class="uploaded-file-item">
      <span class="uploaded-file-name">🎵 ${escapeHtml(f.title || f.filename)}</span>
      <div class="uploaded-file-actions">
        <button class="btn btn-primary btn-sm" data-play="${f.id}">▶ Play</button>
        <button class="btn btn-danger btn-sm" data-delete="${f.id}">🗑</button>
      </div>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', () => playUploadedFile(parseInt(btn.dataset.play)));
  });
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUploadedFile(parseInt(btn.dataset.delete)));
  });
}

async function playUploadedFile(id) {
  if (!state.currentGuildId) return alert('Select a guild first');
  try {
    await fetch(`/api/upload/${id}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild: state.currentGuildId }),
    });
  } catch (err) {
    console.error('Failed to play file:', err);
  }
}

async function deleteUploadedFile(id) {
  if (!confirm('Delete this file?')) return;
  await fetch(`/api/upload/${id}`, { method: 'DELETE' });
  loadUploadedFiles();
}

const dropzone = $('#upload-dropzone');
const fileInput = $('#upload-input');

$('#upload-browse-btn').addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', (e) => {
  if (e.target !== dropzone && !dropzone.contains(e.target)) return;
  if (e.target.tagName === 'BUTTON') return;
  fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
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

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = (e.loaded / e.total) * 100;
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `Uploading ${file.name}... ${Math.round(pct)}%`;
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      progressText.textContent = '✅ Upload complete!';
      setTimeout(() => {
        progressEl.hidden = true;
      }, 2000);
      loadUploadedFiles();
    } else {
      let message = 'Upload failed';
      try {
        message = JSON.parse(xhr.responseText).error || message;
      } catch {
        // non-JSON error body
      }
      progressText.textContent = `❌ ${message}`;
    }
  };

  xhr.onerror = () => {
    progressText.textContent = '❌ Upload failed';
  };

  xhr.send(formData);
}
