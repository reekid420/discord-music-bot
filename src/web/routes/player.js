import { Router } from 'express';
import { useQueue, QueryType } from 'discord-player';
import { emitPlayerState } from '../server.js';

// Detect YouTube playlist URLs to choose AUTO vs YOUTUBE_SEARCH
function pickSearchEngine(query) {
  try {
    const u = new URL(query);
    const isYtPlaylist =
      (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') &&
      u.searchParams.has('list');
    if (isYtPlaylist) return QueryType.AUTO;
  } catch { /* not a URL */ }
  if (/^https?:\/\//i.test(query)) return QueryType.AUTO;
  return QueryType.YOUTUBE_SEARCH;
}

/**
 * Player control routes.
 * @param {import('discord.js').Client} client
 * @param {import('socket.io').Server} io
 */
export function playerRoutes(client, io) {
  const router = Router();

  // GET /api/player/search?query=<text> — resolve a query to track metadata (for playlist add)
  router.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query param required' });

    try {
      const result = await client.player.search(query, {
        searchEngine: QueryType.YOUTUBE_SEARCH,
      });
      const tracks = (result.tracks || []).slice(0, 5).map(t => ({
        title: t.title,
        url: t.url,
        durationMs: t.durationMS,
        duration: t.duration,
        thumbnail: t.thumbnail,
        artist: t.author,
      }));
      res.json({ tracks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/player?guild=<id> — current player state
  router.get('/', (req, res) => {
    const guildId = req.query.guild;
    if (!guildId) return res.status(400).json({ error: 'guild query param required' });

    const queue = client.player?.queues?.get(guildId);
    if (!queue || !queue.currentTrack) {
      return res.json({ active: false });
    }

    const progress = queue.node.getTimestamp();

    res.json({
      active: true,
      currentTrack: {
        title: queue.currentTrack.title,
        artist: queue.currentTrack.author,
        duration: queue.currentTrack.duration,
        durationMs: queue.currentTrack.durationMS,
        thumbnail: queue.currentTrack.thumbnail,
        url: queue.currentTrack.url,
        requestedBy: queue.currentTrack.requestedBy?.tag || 'Unknown',
      },
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

    // Only fetch the bot member if it's not already cached — avoids a full guild member fetch
    const botMember = guild.members.cache.get(client.user.id)
      || await guild.members.fetch(client.user.id).catch(() => null);

    // Prefer channel bot is already in, else find first channel with real (non-bot) members
    const vc = botMember?.voice?.channel
      || guild.channels.cache.find(
          c => c.isVoiceBased() && c.members.filter(m => !m.user.bot).size > 0
        );

    if (!vc) {
      return res.status(400).json({
        error: 'No active voice channel found. Join a voice channel in Discord first.',
      });
    }

    try {
      const result = await client.player.play(vc, query, {
        nodeOptions: {
          metadata: { guild },
          volume: 80,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300_000,
          leaveOnEnd: false,
        },
        searchEngine: pickSearchEngine(query),
      });

      const isPlaylist = !!(result.searchResult?.playlist);
      if (isPlaylist) {
        const pl = result.searchResult.playlist;
        const count = result.searchResult.tracks.length;
        res.json({ success: true, track: pl.title, isPlaylist: true, trackCount: count });
      } else {
        res.json({ success: true, track: result.track.title, isPlaylist: false });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/player/seek — { guild, position: ms }
  router.post('/seek', async (req, res) => {
    const { guild: guildId, position } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue || !queue.currentTrack) return res.status(404).json({ error: 'No active track' });

    const ms = Math.max(0, parseInt(position) || 0);
    try {
      await queue.node.seek(ms);
      res.json({ success: true, position: ms });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/player/skip
  router.post('/skip', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.skip();
    res.json({ success: true });
  });

  // POST /api/player/pause
  router.post('/pause', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.setPaused(true);
    emitPlayerState(client, io, guildId);
    res.json({ success: true });
  });

  // POST /api/player/resume
  router.post('/resume', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.node.setPaused(false);
    emitPlayerState(client, io, guildId);
    res.json({ success: true });
  });

  // POST /api/player/loop — { guild, mode: 0|1|2 }
  router.post('/loop', (req, res) => {
    const { guild: guildId, mode } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });

    // RepeatMode: 0 = Off, 1 = Track, 2 = Queue
    const parsed = parseInt(mode);
    if (isNaN(parsed) || parsed < 0 || parsed > 2) {
      return res.status(400).json({ error: 'mode must be 0, 1, or 2' });
    }
    queue.setRepeatMode(parsed);
    emitPlayerState(client, io, guildId);
    res.json({ success: true, mode: parsed });
  });

  // POST /api/player/stop
  router.post('/stop', (req, res) => {
    const { guild: guildId } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    queue.delete();
    res.json({ success: true });
  });

  // POST /api/player/volume
  router.post('/volume', (req, res) => {
    const { guild: guildId, volume } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });
    const vol = Math.max(1, Math.min(100, parseInt(volume) || 80));
    queue.node.setVolume(vol);
    emitPlayerState(client, io, guildId);
    res.json({ success: true, volume: vol });
  });

  return router;
}
