import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  authMiddleware,
  loginRoute,
  logoutRoute,
  COOKIE_NAME,
  isValidSession,
} from './middleware/auth.js';
import { emitPlayerState, serializeQueue } from './helpers.js';
import { playerRoutes } from './routes/player.js';
import { queueRoutes } from './routes/queue.js';
import { playlistRoutes } from './routes/playlists.js';
import { uploadRoutes } from './routes/upload.js';
import { settingsRoutes } from './routes/settings.js';
import { guildRoutes } from './routes/guilds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal cookie parser for the Socket.io handshake.
 */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Start the Express web server and Socket.io in the same process as the bot.
 * @param {import('discord.js').Client} client
 */
export function startWebServer(client) {
  const app = express();
  const server = createServer(app);
  const io = new SocketIO(server);

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
  app.use('/api/player', playerRoutes(client));
  app.use('/api/queue', queueRoutes(client));
  app.use('/api/playlists', playlistRoutes(client));
  app.use('/api/upload', uploadRoutes(client));
  app.use('/api/settings', settingsRoutes(client));
  app.use('/api/guilds', guildRoutes(client));

  // SPA fallback
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  // ─── Central error handler (never leaks internals) ───
  app.use((err, req, res, _next) => {
    console.error('[Web] Unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  // ─── Socket.io (authenticated) ───
  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[COOKIE_NAME];
    if (isValidSession(token)) return next();
    next(new Error('unauthorized'));
  });

  io.on('connection', (socket) => {
    console.log('[WS] Dashboard client connected');

    socket.on('selectGuild', (guildId) => {
      if (typeof guildId !== 'string' || !/^\d+$/.test(guildId)) return;
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
    io.to(`guild:${guildId}`).emit('trackStart', {
      guildId,
      track: meta,
      queue: serializeQueue(queue),
    });
  });

  client.on('playerQueueUpdate', (guildId, queue) => {
    io.to(`guild:${guildId}`).emit('queueUpdate', { guildId, queue: serializeQueue(queue) });
  });

  client.on('playerDisconnect', (guildId) => {
    io.to(`guild:${guildId}`).emit('playerDisconnect', { guildId });
  });

  // Store io on client for route access
  client.io = io;
  // Convenience for route handlers: refresh dashboards watching a guild
  io.emitState = (guildId) => emitPlayerState(client, io, guildId);

  server.listen(port, () => {
    console.log(`[Web] Dashboard running at http://localhost:${port}`);
  });
}
