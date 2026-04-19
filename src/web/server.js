import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware, loginRoute, logoutRoute } from './middleware/auth.js';
import { playerRoutes } from './routes/player.js';
import { queueRoutes } from './routes/queue.js';
import { playlistRoutes } from './routes/playlists.js';
import { uploadRoutes } from './routes/upload.js';
import { settingsRoutes } from './routes/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start the Express web server and Socket.io in the same process as the bot.
 * @param {import('discord.js').Client} client
 */
export function startWebServer(client) {
  const app = express();
  const server = createServer(app);
  const io = new SocketIO(server, {
    cors: { origin: '*' },
  });

  const port = parseInt(process.env.DASHBOARD_PORT) || 3000;

  // ─── Middleware ───
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(join(__dirname, 'public')));

  // Auth routes (no auth required)
  app.post('/api/login', (req, res) => loginRoute(req, res));
  app.post('/api/logout', (req, res) => logoutRoute(req, res));

  // Protected API routes
  app.use('/api', authMiddleware);
  app.use('/api/player', playerRoutes(client, io));
  app.use('/api/queue', queueRoutes(client, io));
  app.use('/api/playlists', playlistRoutes(client));
  app.use('/api/upload', uploadRoutes(client));
  app.use('/api/settings', settingsRoutes(client));

  // Guilds endpoint — list guilds the bot is in
  app.get('/api/guilds', (req, res) => {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 64 }),
      memberCount: g.memberCount,
    }));
    res.json(guilds);
  });

  // SPA fallback
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  // ─── Socket.io ───
  io.on('connection', (socket) => {
    console.log('[WS] Dashboard client connected');

    socket.on('selectGuild', (guildId) => {
      socket.join(`guild:${guildId}`);
      // Send current state immediately
      emitPlayerState(client, io, guildId);
    });

    socket.on('disconnect', () => {
      console.log('[WS] Dashboard client disconnected');
    });
  });

  // ─── Bot → Dashboard event bridge ───
  client.on('playerTrackStart', (guildId, meta, queue) => {
    io.to(`guild:${guildId}`).emit('trackStart', { guildId, track: meta, queue: serializeQueue(queue) });
  });

  client.on('playerQueueUpdate', (guildId, queue) => {
    io.to(`guild:${guildId}`).emit('queueUpdate', { guildId, queue: serializeQueue(queue) });
  });

  client.on('playerDisconnect', (guildId) => {
    io.to(`guild:${guildId}`).emit('playerDisconnect', { guildId });
  });

  // Store io on client for route access
  client.io = io;

  server.listen(port, () => {
    console.log(`[Web] Dashboard running at http://localhost:${port}`);
  });
}

/**
 * Emit player state to a guild room.
 */
function emitPlayerState(client, io, guildId) {
  const player = client.player;
  const queue = player?.queues?.get(guildId);

  if (!queue) {
    io.to(`guild:${guildId}`).emit('playerState', { guildId, active: false });
    return;
  }

  io.to(`guild:${guildId}`).emit('playerState', {
    guildId,
    active: true,
    currentTrack: queue.currentTrack ? {
      title: queue.currentTrack.title,
      artist: queue.currentTrack.author,
      duration: queue.currentTrack.duration,
      durationMs: queue.currentTrack.durationMS,
      thumbnail: queue.currentTrack.thumbnail,
      url: queue.currentTrack.url,
      requestedBy: queue.currentTrack.requestedBy?.tag || 'Unknown',
    } : null,
    queue: serializeQueue(queue),
    volume: queue.node.volume,
    paused: queue.node.isPaused(),
    repeatMode: queue.repeatMode,
  });
}

/**
 * Serialize a queue for JSON transport.
 */
function serializeQueue(queue) {
  if (!queue) return [];
  return queue.tracks.toArray().map((t, i) => ({
    position: i + 1,
    title: t.title,
    artist: t.author,
    duration: t.duration,
    durationMs: t.durationMS,
    thumbnail: t.thumbnail,
    url: t.url,
    requestedBy: t.requestedBy?.tag || 'Unknown',
  }));
}

export { emitPlayerState, serializeQueue };
