import { Router } from 'express';
import { QueryType } from 'discord-player';
import { pickSearchEngine } from '../../bot/utils/urlHelpers.js';
import {
  serializeTrack,
  getGuildQueue,
  resolveVoiceChannel,
  queueNodeDefaults,
} from '../helpers.js';

/**
 * Player control routes.
 * @param {import('discord.js').Client} client
 */
export function playerRoutes(client) {
  const router = Router();

  // GET /api/player/search?query=<text> — resolve a query to track metadata (for playlist add)
  router.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query param required' });

    try {
      const result = await client.player.search(query, {
        searchEngine: QueryType.YOUTUBE_SEARCH,
      });
      const tracks = (result.tracks || []).slice(0, 5).map(serializeTrack);
      res.json({ tracks });
    } catch (err) {
      console.error('[Player]', err);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // GET /api/player?guild=<id> — current player state
  router.get('/', (req, res) => {
    const guildId = req.query.guild;
    if (!guildId) return res.status(400).json({ error: 'guild query param required' });

    const queue = getGuildQueue(client, guildId);
    if (!queue || !queue.currentTrack) {
      return res.json({ active: false });
    }

    const progress = queue.node.getTimestamp();

    res.json({
      active: true,
      currentTrack: serializeTrack(queue.currentTrack),
      progress: {
        current: progress?.current?.value || 0,
        currentLabel: progress?.current?.label || '0:00',
        total: progress?.total?.value || 0,
        totalLabel: progress?.total?.label || '0:00',
      },
      volume: queue.node.volume,
      paused: queue.node.isPaused(),
      repeatMode: queue.repeatMode,
    });
  });

  // POST /api/player/play — play by query
  router.post('/play', async (req, res) => {
    const { guild: guildId, query } = req.body;
    if (!guildId || !query) return res.status(400).json({ error: 'guild and query required' });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const vc = await resolveVoiceChannel(client, guild);
    if (!vc) {
      return res.status(400).json({
        error: 'No active voice channel found. Join a voice channel in Discord first.',
      });
    }

    try {
      const result = await client.player.play(vc, query, {
        nodeOptions: {
          metadata: { guild },
          ...queueNodeDefaults(guildId),
        },
        searchEngine: pickSearchEngine(query, QueryType),
      });

      const isPlaylist = !!result.searchResult?.playlist;
      if (isPlaylist) {
        const pl = result.searchResult.playlist;
        const count = result.searchResult.tracks.length;
        res.json({ success: true, track: pl.title, isPlaylist: true, trackCount: count });
      } else {
        res.json({ success: true, track: result.track.title, isPlaylist: false });
      }
    } catch (err) {
      console.error('[Player]', err);
      res.status(500).json({ error: 'Playback failed' });
    }
  });

  // POST /api/player/seek — { guild, position: ms }
  router.post('/seek', async (req, res) => {
    const { guild: guildId, position } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue || !queue.currentTrack) return res.status(404).json({ error: 'No active track' });

    const ms = Math.max(0, parseInt(position) || 0);
    try {
      await queue.node.seek(ms);
      res.json({ success: true, position: ms });
    } catch (err) {
      console.error('[Player]', err);
      res.status(500).json({ error: 'Seek failed' });
    }
  });

  // POST /api/player/skip
  router.post('/skip', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.skip();
    res.json({ success: true });
  });

  // POST /api/player/pause
  router.post('/pause', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.setPaused(true);
    client.io.emitState(guildId);
    res.json({ success: true });
  });

  // POST /api/player/resume
  router.post('/resume', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.setPaused(false);
    client.io.emitState(guildId);
    res.json({ success: true });
  });

  // POST /api/player/loop — { guild, mode: 0|1|2 }
  router.post('/loop', (req, res) => {
    const { guild: guildId, mode } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });

    // RepeatMode: 0 = Off, 1 = Track, 2 = Queue
    const parsed = parseInt(mode);
    if (isNaN(parsed) || parsed < 0 || parsed > 2) {
      return res.status(400).json({ error: 'mode must be 0, 1, or 2' });
    }
    queue.setRepeatMode(parsed);
    client.io.emitState(guildId);
    res.json({ success: true, mode: parsed });
  });

  // POST /api/player/stop
  router.post('/stop', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.delete();
    res.json({ success: true });
  });

  // POST /api/player/volume
  router.post('/volume', (req, res) => {
    const { guild: guildId, volume } = req.body;
    const queue = getGuildQueue(client, guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    const vol = Math.max(1, Math.min(100, parseInt(volume) || 80));
    queue.node.setVolume(vol);
    client.io.emitState(guildId);
    res.json({ success: true, volume: vol });
  });

  return router;
}
