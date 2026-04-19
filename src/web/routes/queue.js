import { Router } from 'express';
import { serializeQueue } from '../server.js';

/**
 * Queue management routes.
 * @param {import('discord.js').Client} client
 * @param {import('socket.io').Server} io
 */
export function queueRoutes(client, io) {
  const router = Router();

  // GET /api/queue?guild=<id> — full queue
  router.get('/', (req, res) => {
    const guildId = req.query.guild;
    if (!guildId) return res.status(400).json({ error: 'guild query param required' });

    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.json({ tracks: [] });

    res.json({ tracks: serializeQueue(queue) });
  });

  // DELETE /api/queue/:position?guild=<id> — remove track at position
  router.delete('/:position', (req, res) => {
    const guildId = req.query.guild;
    const position = parseInt(req.params.position) - 1;

    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });

    const tracks = queue.tracks.toArray();
    if (position < 0 || position >= tracks.length) {
      return res.status(400).json({ error: 'Invalid position' });
    }

    queue.removeTrack(position);
    io.to(`guild:${guildId}`).emit('queueUpdate', { guildId, queue: serializeQueue(queue) });
    res.json({ success: true });
  });

  // POST /api/queue/shuffle?guild=<id>
  router.post('/shuffle', (req, res) => {
    const guildId = req.body.guild || req.query.guild;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });

    queue.tracks.shuffle();
    io.to(`guild:${guildId}`).emit('queueUpdate', { guildId, queue: serializeQueue(queue) });
    res.json({ success: true });
  });

  // POST /api/queue/move — reorder { guild, from, to }
  router.post('/move', (req, res) => {
    const { guild: guildId, from, to } = req.body;
    const queue = client.player?.queues?.get(guildId);
    if (!queue) return res.status(404).json({ error: 'No active queue' });

    const tracks = queue.tracks.toArray();
    const fromIdx = from - 1;
    const toIdx = to - 1;

    if (fromIdx < 0 || fromIdx >= tracks.length || toIdx < 0 || toIdx >= tracks.length) {
      return res.status(400).json({ error: 'Invalid positions' });
    }

    // discord-player doesn't have a native move, so we swap manually
    queue.swapTracks(fromIdx, toIdx);
    io.to(`guild:${guildId}`).emit('queueUpdate', { guildId, queue: serializeQueue(queue) });
    res.json({ success: true });
  });

  return router;
}
