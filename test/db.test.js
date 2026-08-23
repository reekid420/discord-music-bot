import { describe, it, expect, beforeAll } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  initDatabase,
  getGuildSettings,
  updateGuildSettings,
  createPlaylist,
  getUserPlaylists,
  getPlaylistByName,
  getPlaylistByNameGlobal,
  getPlaylistById,
  deletePlaylist,
  updatePlaylist,
  addPlaylistTrack,
  getPlaylistTracks,
  removePlaylistTrack,
  addLocalFile,
  getAllLocalFiles,
  getLocalFileById,
  deleteLocalFile,
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions,
} from '../src/db/database.js';

beforeAll(() => {
  initDatabase(join(tmpdir(), `miyabi-test-${process.pid}-${Date.now()}.db`));
});

describe('guild settings', () => {
  it('creates defaults on first access', () => {
    const s = getGuildSettings('111');
    expect(s.guild_id).toBe('111');
    expect(s.dj_role_id).toBeNull();
    expect(s.default_volume).toBe(80);
  });

  it('merges partial updates', () => {
    updateGuildSettings('111', { vote_threshold: 0.6 });
    const s = getGuildSettings('111');
    expect(s.vote_threshold).toBeCloseTo(0.6);
    expect(s.default_volume).toBe(80);
    expect(s.dj_role_id).toBeNull();
  });
});

describe('playlists', () => {
  it('creates, lists, renames and deletes', () => {
    const pl = createPlaylist('user-1', 'Chill', '222');
    expect(pl.name).toBe('Chill');
    expect(pl.owner_id).toBe('user-1');

    expect(getUserPlaylists('user-1')).toHaveLength(1);
    expect(getPlaylistByName('user-1', 'chill')?.id ?? getPlaylistByName('user-1', 'Chill')?.id).toBe(pl.id);

    updatePlaylist(pl.id, { name: 'Chill Mix' });
    expect(getPlaylistById(pl.id).name).toBe('Chill Mix');

    updatePlaylist(pl.id, { is_public: true });
    expect(getPlaylistById(pl.id).is_public).toBe(1);

    deletePlaylist(pl.id);
    expect(getPlaylistById(pl.id)).toBeUndefined();
  });

  it('finds playlists globally by name', () => {
    createPlaylist('a', 'Shared Name', null);
    createPlaylist('b', 'Shared Name', null);
    const found = getPlaylistByNameGlobal('Shared Name');
    expect(found).toBeTruthy();
    expect(found.name).toBe('Shared Name');
  });

  it('orders playlist tracks sequentially', () => {
    const pl = createPlaylist('u2', 'Ordered', null);
    addPlaylistTrack(pl.id, { title: 'A', url: 'https://x/a' });
    addPlaylistTrack(pl.id, { title: 'B', url: 'https://x/b', duration_ms: 1000 });
    addPlaylistTrack(pl.id, { title: 'C', url: 'https://x/c' });

    const tracks = getPlaylistTracks(pl.id);
    expect(tracks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    expect(tracks[1].duration_ms).toBe(1000);
    expect(tracks[0].duration_ms).toBeNull();

    removePlaylistTrack(tracks[0].id);
    expect(getPlaylistTracks(pl.id)).toHaveLength(2);
  });
});

describe('local files', () => {
  it('stores and deletes upload metadata', () => {
    const f = addLocalFile({ filename: 'abc.mp3', filepath: '/uploads/abc.mp3', title: 'Song' });
    expect(f.title).toBe('Song');
    expect(getAllLocalFiles()).toHaveLength(1);

    deleteLocalFile(f.id);
    expect(getLocalFileById(f.id)).toBeUndefined();
  });

  it('falls back to filename as title', () => {
    const f = addLocalFile({ filename: 'track.flac', filepath: '/uploads/track.flac' });
    expect(f.title).toBe('track.flac');
  });
});

describe('sessions', () => {
  it('round-trips a live session and rejects expired ones', () => {
    const token = 'tok-live';
    createSession(token, Math.floor(Date.now() / 1000) + 60);
    expect(getSession(token)?.token).toBe(token);

    createSession('tok-dead', Math.floor(Date.now() / 1000) - 60);
    expect(getSession('tok-dead')).toBeUndefined();

    deleteSession(token);
    expect(getSession(token)).toBeUndefined();
  });

  it('cleans expired sessions', () => {
    createSession('tok-old', Math.floor(Date.now() / 1000) - 10);
    cleanExpiredSessions();
    expect(getSession('tok-old')).toBeUndefined();
  });
});
