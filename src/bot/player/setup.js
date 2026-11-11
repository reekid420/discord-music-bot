import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { TikTokExtractor } from './TikTokExtractor.js';
import { writeVerboseLog } from '../utils/logger.js';
import { YoutubeDlpExtractor } from './YoutubeDlpExtractor.js';
import { captureQueueSnapshot, clearQueueSnapshot } from '../utils/queuePersist.js';

/**
 * Set up the discord-player instance with all extractors.
 * @param {import('discord.js').Client} client
 * @returns {Player}
 */
export async function setupPlayer(client) {
  const player = new Player(client, {
    skipFFmpeg: false,
  });

  // Register default extractors (SoundCloud, Spotify bridge, Attachment/File, etc.)
  await player.extractors.loadMulti(DefaultExtractors);

  // Register custom TikTok extractor
  await player.extractors.register(TikTokExtractor, {});

  // YouTube via yt-dlp (youtube-dl-exec). Replaces discord-player-youtubei:
  // youtubei.js stream URLs fail to play (silent fall-through, no audio), while
  // yt-dlp's URLs verified working from this host (curl 200 on googlevideo).
  await player.extractors.register(YoutubeDlpExtractor, {});

  console.log('[Player] All extractors registered');

  // ─── Player Events ───
  player.on('debug', (message) => {
    writeVerboseLog('Player:Debug', message);
  });

  player.events.on('playerStart', (queue, track) => {
    const meta = {
      title: track.title,
      artist: track.author,
      duration: track.duration,
      thumbnail: track.thumbnail,
      url: track.url,
      requestedBy: track.requestedBy?.tag || 'Unknown',
    };
    console.log(`[Player] Now playing: ${track.title} in ${queue.guild.name}`);
    captureQueueSnapshot(queue.guild.id);
    client.emit('playerTrackStart', queue.guild.id, meta, queue);
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    console.log(`[Player] Track added: ${track.title}`);
    captureQueueSnapshot(queue.guild.id);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  player.events.on('audioTracksAdd', (queue, tracks) => {
    console.log(`[Player] ${tracks.length} tracks added to queue`);
    captureQueueSnapshot(queue.guild.id);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  player.events.on('playerSkip', (queue, track) => {
    // This fires when a track is skipped — INCLUDING when it errors out silently.
    // If you see this for a track you didn't skip, the stream failed.
    console.warn(`[Player] Track skipped (stream error?): ${track.title}`);
    captureQueueSnapshot(queue.guild.id);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  player.events.on('disconnect', (queue) => {
    console.log(`[Player] Disconnected from ${queue.guild.name}`);
    client.emit('playerDisconnect', queue.guild.id);
  });

  player.events.on('emptyChannel', (queue) => {
    console.log(`[Player] Empty channel, leaving ${queue.guild.name}`);
    client.emit('playerDisconnect', queue.guild.id);
  });

  player.events.on('emptyQueue', (queue) => {
    console.log(`[Player] Queue empty in ${queue.guild.name}`);
    // Queue finished naturally — drop the snapshot so /replay doesn't
    // resurrect a finished queue. (Manual /stop keeps it for recovery.)
    clearQueueSnapshot(queue.guild.id);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  // Stream-level errors — these are the key errors that cause "instant queue empty"
  player.events.on('playerError', (queue, error) => {
    writeVerboseLog('PlayerEvent:playerError', `Stream error: ${error.stack || error}`);
    console.error(`[Player] Stream error in ${queue.guild.name}: ${error.message}`);
  });

  player.events.on('error', (queue, error) => {
    writeVerboseLog('PlayerEvent:error', `General error: ${error.stack || error}`);
    console.error(`[Player] General error in ${queue.guild?.name ?? 'unknown'}:`, error.message);
  });

  return player;
}
