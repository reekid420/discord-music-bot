import { getGuildSettings } from '../db/database.js';

/**
 * Shared web-layer helpers: track serialization, queue lookup,
 * voice channel resolution and player-state emission.
 */

/**
 * Serialize a discord-player track for JSON transport.
 * @param {import('discord-player').Track} t
 */
export function serializeTrack(t) {
  return {
    title: t.title,
    artist: t.author,
    duration: t.duration,
    durationMs: t.durationMS,
    thumbnail: t.thumbnail,
    url: t.url,
    requestedBy: t.requestedBy?.tag || 'Unknown',
  };
}

/**
 * Serialize a player queue's upcoming tracks for JSON transport.
 * @param {import('discord-player').GuildQueue} queue
 */
export function serializeQueue(queue) {
  if (!queue) return [];
  return queue.tracks.toArray().map((t, i) => ({
    position: i + 1,
    ...serializeTrack(t),
  }));
}

/**
 * Get the active queue for a guild, or null.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 */
export function getGuildQueue(client, guildId) {
  return client.player?.queues?.get(guildId) || null;
}

/**
 * Resolve the voice channel playback should target:
 * prefer the bot's current channel, else the first with human listeners.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 */
export async function resolveVoiceChannel(client, guild) {
  const botMember =
    guild.members.cache.get(client.user.id) ||
    (await guild.members.fetch(client.user.id).catch(() => null));

  return (
    botMember?.voice?.channel ||
    guild.channels.cache.find(
      (c) => c.isVoiceBased() && c.members.filter((m) => !m.user.bot).size > 0
    ) ||
    null
  );
}

/**
 * Default node options for new queues, honoring the guild's default_volume setting.
 * @param {string} guildId
 */
export function queueNodeDefaults(guildId) {
  let volume = 80;
  try {
    volume = Math.max(1, Math.min(100, getGuildSettings(guildId)?.default_volume ?? 80));
  } catch {
    // DB unavailable — fall back to hardcoded default
  }
  return {
    metadata: {},
    volume,
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 300_000,
    leaveOnEnd: false,
  };
}

/**
 * Emit full player state for a guild room.
 * @param {import('discord.js').Client} client
 * @param {import('socket.io').Server} io
 * @param {string} guildId
 */
export function emitPlayerState(client, io, guildId) {
  const queue = getGuildQueue(client, guildId);

  if (!queue) {
    io.to(`guild:${guildId}`).emit('playerState', { guildId, active: false });
    return;
  }

  io.to(`guild:${guildId}`).emit('playerState', {
    guildId,
    active: true,
    currentTrack: queue.currentTrack ? serializeTrack(queue.currentTrack) : null,
    queue: serializeQueue(queue),
    volume: queue.node.volume,
    paused: queue.node.isPaused(),
    repeatMode: queue.repeatMode,
  });
}
