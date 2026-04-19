import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

/**
 * Initialize the database connection and run migrations.
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Database} The database instance
 */
export function initDatabase(dbPath) {
  // Ensure the directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run schema migrations
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  console.log('[DB] Database initialized at', dbPath);
  return db;
}

/**
 * Get the database instance (must call initDatabase first).
 * @returns {Database}
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ─── Guild Settings ───

export function getGuildSettings(guildId) {
  const row = getDb().prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (row) return row;
  // Create defaults if not found
  getDb().prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);
  return getDb().prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
}

export function updateGuildSettings(guildId, settings) {
  const current = getGuildSettings(guildId);
  const merged = { ...current, ...settings };
  getDb().prepare(`
    UPDATE guild_settings SET
      dj_role_id = ?,
      vote_threshold = ?,
      auto_leave_s = ?,
      default_volume = ?
    WHERE guild_id = ?
  `).run(merged.dj_role_id, merged.vote_threshold, merged.auto_leave_s, merged.default_volume, guildId);
  return getGuildSettings(guildId);
}

// ─── Playlists ───

export function createPlaylist(ownerId, name, guildId = null) {
  const result = getDb().prepare(
    'INSERT INTO playlists (owner_id, name, guild_id) VALUES (?, ?, ?)'
  ).run(ownerId, name, guildId);
  return getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid);
}

export function getUserPlaylists(ownerId) {
  return getDb().prepare('SELECT * FROM playlists WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId);
}

export function getPlaylistByName(ownerId, name) {
  return getDb().prepare('SELECT * FROM playlists WHERE owner_id = ? AND name = ?').get(ownerId, name);
}

/**
 * Find any playlist by name regardless of owner — used for admin/DJ access.
 * Returns the first match (prefers exact case).
 */
export function getPlaylistByNameGlobal(name) {
  return getDb().prepare('SELECT * FROM playlists WHERE name = ? ORDER BY created_at DESC').get(name);
}

export function getPlaylistById(id) {
  return getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(id);
}

export function getAllPlaylists() {
  return getDb().prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();
}

export function deletePlaylist(id) {
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

export function updatePlaylist(id, updates) {
  if (updates.name !== undefined) {
    getDb().prepare('UPDATE playlists SET name = ? WHERE id = ?').run(updates.name, id);
  }
  if (updates.is_public !== undefined) {
    getDb().prepare('UPDATE playlists SET is_public = ? WHERE id = ?').run(updates.is_public ? 1 : 0, id);
  }
  return getPlaylistById(id);
}

// ─── Playlist Tracks ───

export function getPlaylistTracks(playlistId) {
  return getDb().prepare(
    'SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY track_order ASC'
  ).all(playlistId);
}

export function addPlaylistTrack(playlistId, track) {
  // Get next order value
  const last = getDb().prepare(
    'SELECT MAX(track_order) as max_order FROM playlist_tracks WHERE playlist_id = ?'
  ).get(playlistId);
  const order = (last?.max_order ?? 0) + 1;

  return getDb().prepare(
    'INSERT INTO playlist_tracks (playlist_id, title, url, duration_ms, thumbnail, track_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(playlistId, track.title, track.url, track.duration_ms || null, track.thumbnail || null, order);
}

export function removePlaylistTrack(trackId) {
  getDb().prepare('DELETE FROM playlist_tracks WHERE id = ?').run(trackId);
}

// ─── Local Files ───

export function addLocalFile(file) {
  const result = getDb().prepare(
    'INSERT INTO local_files (filename, filepath, title, duration_ms) VALUES (?, ?, ?, ?)'
  ).run(file.filename, file.filepath, file.title || file.filename, file.duration_ms || null);
  return getDb().prepare('SELECT * FROM local_files WHERE id = ?').get(result.lastInsertRowid);
}

export function getAllLocalFiles() {
  return getDb().prepare('SELECT * FROM local_files ORDER BY uploaded_at DESC').all();
}

export function getLocalFileById(id) {
  return getDb().prepare('SELECT * FROM local_files WHERE id = ?').get(id);
}

export function deleteLocalFile(id) {
  getDb().prepare('DELETE FROM local_files WHERE id = ?').run(id);
}

// ─── Sessions ───

export function createSession(token, expiresAt) {
  getDb().prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
}

export function getSession(token) {
  const now = Math.floor(Date.now() / 1000);
  return getDb().prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now);
}

export function deleteSession(token) {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function cleanExpiredSessions() {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}
