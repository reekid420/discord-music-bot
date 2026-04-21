import { Router } from 'express';
import { QueryType } from 'discord-player';
import {
  getAllPlaylists, getPlaylistById, getPlaylistTracks,
  createPlaylist, updatePlaylist, deletePlaylist,
  addPlaylistTrack, removePlaylistTrack,
} from '../../db/database.js';

/**
 * Playlist CRUD routes.
 * @param {import('discord.js').Client} client
 */
export function playlistRoutes(client) {
  const router = Router();

  // GET /api/playlists — list all
  router.get('/', (req, res) => {
    const playlists = getAllPlaylists();
    // Attach track count to each
    const result = playlists.map(p => ({
      ...p,
      trackCount: getPlaylistTracks(p.id).length,
    }));
    res.json(result);
  });

  // GET /api/playlists/:id — get playlist + tracks
  router.get('/:id', (req, res) => {
    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const tracks = getPlaylistTracks(playlist.id);
    res.json({ ...playlist, tracks });
  });

  // POST /api/playlists — create { name, ownerId, guildId?, is_public? }
  router.post('/', (req, res) => {
    const { name, ownerId, guildId, is_public } = req.body;
    if (!name || !ownerId) return res.status(400).json({ error: 'name and ownerId required' });

    try {
      let playlist = createPlaylist(ownerId, name, guildId || null);
      // Apply is_public if explicitly passed (default in DB is 0/false)
      if (is_public !== undefined) {
        playlist = updatePlaylist(playlist.id, { is_public: !!is_public });
      }
      res.json(playlist);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Playlist with that name already exists for this user' });
      }
      throw err;
    }
  });

  // PUT /api/playlists/:id — update { name?, is_public? }
  router.put('/:id', (req, res) => {
    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const updated = updatePlaylist(playlist.id, req.body);
    res.json(updated);
  });

  // DELETE /api/playlists/:id
  router.delete('/:id', (req, res) => {
    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    deletePlaylist(playlist.id);
    res.json({ success: true });
  });

  // POST /api/playlists/:id/tracks — add { title, url, duration_ms?, thumbnail? }
  router.post('/:id/tracks', (req, res) => {
    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const { title, url, duration_ms, thumbnail } = req.body;
    if (!title || !url) return res.status(400).json({ error: 'title and url required' });

    addPlaylistTrack(playlist.id, { title, url, duration_ms, thumbnail });
    const tracks = getPlaylistTracks(playlist.id);
    res.json({ success: true, trackCount: tracks.length });
  });

  // DELETE /api/playlists/:id/tracks/:trackId
  router.delete('/:id/tracks/:trackId', (req, res) => {
    removePlaylistTrack(parseInt(req.params.trackId));
    res.json({ success: true });
  });

  // POST /api/playlists/:id/play — enqueue all tracks { guild }
  router.post('/:id/play', async (req, res) => {
    const { guild: guildId } = req.body;
    if (!guildId) return res.status(400).json({ error: 'guild required' });

    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const tracks = getPlaylistTracks(playlist.id);
    if (tracks.length === 0) return res.status(400).json({ error: 'Playlist is empty' });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    // Only fetch the bot member if it's not already cached — avoids a full guild member fetch
    const botMember = guild.members.cache.get(client.user.id)
      || await guild.members.fetch(client.user.id).catch(() => null);

    const vc = botMember?.voice?.channel
      || guild.channels.cache.find(c => c.isVoiceBased() && c.members.filter(m => !m.user.bot).size > 0);

    if (!vc) return res.status(400).json({ error: 'No voice channel to join' });

    let added = 0;
    for (const t of tracks) {
      try {
        await client.player.play(vc, t.url, {
          nodeOptions: { metadata: { guild }, volume: 80 },
          // Treat stored URLs as direct links; avoids keyword-search Mix resolution
          searchEngine: QueryType.AUTO,
        });
        added++;
      } catch (err) {
        console.warn(`[Web Playlist] Failed to enqueue ${t.title}: ${err.message}`);
      }
    }

    res.json({ success: true, added, total: tracks.length });
  });

  // POST /api/playlists/:id/import — bulk-import tracks from a YouTube playlist URL
  // Body: { url: string }
  router.post('/:id/import', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const playlist = getPlaylistById(parseInt(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    try {
      const result = await client.player.search(url, { searchEngine: QueryType.AUTO });
      if (!result || !result.tracks.length) {
        return res.status(400).json({ error: 'No tracks found at that URL' });
      }

      let added = 0;
      for (const track of result.tracks) {
        try {
          addPlaylistTrack(playlist.id, {
            title: track.title,
            url: track.url,
            duration_ms: track.durationMS,
            thumbnail: track.thumbnail,
          });
          added++;
        } catch { /* skip duplicates / constraint errors */ }
      }

      res.json({
        success: true,
        added,
        total: result.tracks.length,
        playlistTitle: result.playlist?.title || null,
      });
    } catch (err) {
      console.error('[Playlist Import]', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
