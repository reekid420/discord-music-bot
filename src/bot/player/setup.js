import { Player } from 'discord-player';
import { YoutubeiExtractor, Log } from 'discord-player-youtubei';
import { DefaultExtractors } from '@discord-player/extractor';
import { TikTokExtractor } from './TikTokExtractor.js';
import { writeVerboseLog } from '../utils/logger.js';

/**
 * Set up the discord-player instance with all extractors.
 * @param {import('discord.js').Client} client
 * @returns {Player}
 */
export async function setupPlayer(client) {
  // Silence all youtubei.js internal logs (Text/Parser/Player parser warnings)
  Log.setLevel(Log.Level.NONE);

  const player = new Player(client, {
    skipFFmpeg: false,
  });

  // Register default extractors (SoundCloud, Spotify bridge, Attachment/File, etc.)
  await player.extractors.loadMulti(DefaultExtractors);

  // Register custom TikTok extractor
  await player.extractors.register(TikTokExtractor, {});

  // Register YouTubei for YouTube support.
  // useYoutubeDL: true routes audio through yt-dlp (youtube-dl-exec, already installed)
  // which handles YouTube's signature cipher/throttling far more reliably than the
  // internal youtubei.js stream API. The IOS-client workaround still fails for many
  // tracks because youtube.js has its own issues independent of the client type.
  await player.extractors.register(YoutubeiExtractor, {
    useYoutubeDL: true,
    ignoreSignInErrors: true,
  });

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
    client.emit('playerTrackStart', queue.guild.id, meta, queue);
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    console.log(`[Player] Track added: ${track.title}`);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  player.events.on('audioTracksAdd', (queue, tracks) => {
    console.log(`[Player] ${tracks.length} tracks added to queue`);
    client.emit('playerQueueUpdate', queue.guild.id, queue);
  });

  player.events.on('playerSkip', (queue, track) => {
    // This fires when a track is skipped — INCLUDING when it errors out silently.
    // If you see this for a track you didn't skip, the stream failed.
    console.warn(`[Player] Track skipped (stream error?): ${track.title}`);
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
