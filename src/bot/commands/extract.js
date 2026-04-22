import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import youtubeDl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { unlink, stat } from 'fs';
import { readdir } from 'fs/promises';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { writeVerboseLog } from '../utils/logger.js';

const unlinkAsync = promisify(unlink);
const statAsync   = promisify(stat);

// Discord's default upload limit for non-boosted servers.
const DISCORD_MAX_BYTES = 25 * 1024 * 1024;

const FORMAT_CHOICES = [
  { name: 'mp4 — video (default)', value: 'mp4' },
  { name: 'mp3 — audio',           value: 'mp3' },
  { name: 'wav — audio',           value: 'wav' },
  { name: 'flac — audio',          value: 'flac' },
  { name: 'aac — audio',           value: 'aac' },
  { name: 'ogg — audio',           value: 'ogg' },
  { name: 'webm — video',          value: 'webm' },
  { name: 'mkv — video',           value: 'mkv' },
];

const AUDIO_FORMATS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg']);

export const data = new SlashCommandBuilder()
  .setName('extract')
  .setDescription('Download a track and send it to your DMs')
  .addStringOption(opt =>
    opt.setName('url')
      .setDescription("Link to extract (YouTube, TikTok, Spotify, SoundCloud…); leave blank to extract what's playing")
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('format')
      .setDescription('Output format (default: mp4)')
      .setRequired(false)
      .addChoices(...FORMAT_CHOICES)
  );

export async function execute(interaction) {
  const url    = interaction.options.getString('url') || null;
  const format = interaction.options.getString('format') || 'mp4';
  const isAudio = AUDIO_FORMATS.has(format);

  const log = (msg) => {
    console.log(`[Extract] ${msg}`);
    writeVerboseLog('Extract', msg);
  };

  log(`Request from ${interaction.user.tag} — url=${url ?? '(current track)'} format=${format}`);

  // Defer ephemerally — yt-dlp can take 10–30 s
  await interaction.deferReply({ ephemeral: true });

  // ─── Resolve URL & title ──────────────────────────────────────
  let trackUrl   = url;
  let trackTitle = null;

  if (!trackUrl) {
    // No URL provided → pull from the currently-playing track
    const queue = useQueue(interaction.guildId);
    if (!queue?.currentTrack) {
      return interaction.editReply({
        content: '❌ Nothing is playing right now and no URL was provided.',
      });
    }
    trackUrl   = queue.currentTrack.url;
    trackTitle = queue.currentTrack.title;
    log(`Using current track: "${trackTitle}" — ${trackUrl}`);
  }

  // ─── Fetch metadata (title) if we don't have it yet ───────────
  if (!trackTitle) {
    try {
      log(`Fetching metadata for ${trackUrl}`);
      const meta = await youtubeDl(trackUrl, {
        dumpJson: true,
        noPlaylist: true,
        noWarnings: true,
        skipDownload: true,
      });
      trackTitle = meta?.title || meta?.fulltitle || null;
      log(`Resolved title: "${trackTitle}"`);
    } catch (err) {
      writeVerboseLog('Extract:meta', `Metadata fetch failed: ${err.message}`);
      log(`Metadata fetch failed (will use URL fallback): ${err.message}`);
      // Non-fatal — we'll fall back to the URL-based name
    }
  }

  // ─── Build yt-dlp download options ────────────────────────────
  const uid         = randomUUID();
  const tmpBase     = join(tmpdir(), `miyabi-extract-${uid}`);
  const outTemplate = `${tmpBase}.%(ext)s`;

  /** @type {Record<string, any>} */
  const ytdlpOpts = {
    output:         outTemplate,
    noPlaylist:     true,
    noWarnings:     true,
    ffmpegLocation: ffmpegPath, // use bundled ffmpeg so remux/conversion works
  };

  if (isAudio) {
    ytdlpOpts.extractAudio = true;
    ytdlpOpts.audioFormat  = format === 'ogg' ? 'vorbis' : format;
    ytdlpOpts.audioQuality = 0; // best
  } else {
    // For video: download best streams and remux into the target container.
    // Without ffmpegLocation yt-dlp may skip the merge and leave webm as-is.
    ytdlpOpts.format            = 'bestvideo+bestaudio/best';
    ytdlpOpts.mergeOutputFormat = format; // mp4 / webm / mkv
  }

  // ─── Download ─────────────────────────────────────────────────
  log(`Starting yt-dlp download — ${trackUrl} → ${format}`);
  writeVerboseLog('Extract:ytdlp', `opts: ${JSON.stringify(ytdlpOpts)}`);

  let filePath;
  try {
    await youtubeDl(trackUrl, ytdlpOpts);
    filePath = await findOutputFile(tmpBase);

    if (!filePath) {
      throw new Error('yt-dlp finished but the output file could not be found in the temp directory.');
    }
    log(`Download complete: ${filePath}`);
  } catch (err) {
    const errMsg = sanitizeError(err.message);
    console.error('[Extract] yt-dlp error:', err.message);
    writeVerboseLog('Extract:ytdlp:error', err.stack || err.message);
    return interaction.editReply({
      content: `❌ Download failed: ${errMsg}`,
    });
  }

  // ─── Size check ───────────────────────────────────────────────
  try {
    const { size } = await statAsync(filePath);
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    log(`File size: ${sizeMB} MB`);
    if (size > DISCORD_MAX_BYTES) {
      await unlinkAsync(filePath).catch(() => {});
      return interaction.editReply({
        content:
          `❌ The file is **${(size / 1024 / 1024).toFixed(1)} MB** — Discord's upload limit is 25 MB.\n` +
          `Try again with an audio format such as \`mp3\` or \`aac\` to get a much smaller file.`,
      });
    }
  } catch (err) {
    writeVerboseLog('Extract:stat', `Could not stat file: ${err.message}`);
  }

  // ─── Build attachment filename ────────────────────────────────
  const displayTitle = trackTitle || fallbackTitleFromUrl(trackUrl);
  const safeName     = displayTitle
    .replace(/[^\w\s\-().&,!']/g, '') // keep common punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'track';

  const ext            = format === 'ogg' ? 'ogg' : format;
  const attachmentName = `${safeName}.${ext}`;

  // ─── Open DM & send ───────────────────────────────────────────
  log(`Sending DM to ${interaction.user.tag}: "${attachmentName}"`);
  try {
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send({
      content: `🎵 Here's your extracted track from DJ Miyabi!\n**${displayTitle}** — \`${format.toUpperCase()}\``,
      files: [{ attachment: filePath, name: attachmentName }],
    });
  } catch (err) {
    await unlinkAsync(filePath).catch(() => {});

    // Discord error 50007 = Cannot send messages to this user (DMs closed)
    if (err.code === 50007) {
      log('DM failed — user has DMs disabled.');
      return interaction.editReply({
        content:
          '❌ I couldn\'t send you a DM.\n' +
          'Please enable **"Allow direct messages from server members"** in your Privacy Settings and try again.',
      });
    }

    console.error('[Extract] DM send error:', err.message);
    writeVerboseLog('Extract:dm:error', err.stack || err.message);
    return interaction.editReply({
      content: `❌ Failed to send the file: ${err.message}`,
    });
  }

  // Clean up temp file
  await unlinkAsync(filePath).catch(() => {});
  log(`Done — temp file cleaned up.`);

  // ─── Success reply ────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle('✅ Sent to your DMs!')
    .setDescription(`**${displayTitle}**`)
    .addFields(
      { name: 'Format', value: format.toUpperCase(), inline: true },
      { name: 'Type',   value: isAudio ? 'Audio' : 'Video', inline: true },
    )
    .setFooter({ text: 'Check your DMs — the file is on its way!' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * After yt-dlp writes `<tmpBase>.<ext>`, find whatever file it created.
 * yt-dlp replaces %(ext)s at write time — the real extension may differ
 * from the requested format during intermediate steps.
 *
 * @param {string} tmpBase  Full path without extension
 * @returns {Promise<string|null>}
 */
async function findOutputFile(tmpBase) {
  const dir      = tmpdir();
  const baseName = tmpBase.slice(dir.length).replace(/^[\\/]/, '');

  try {
    const files = await readdir(dir);
    const match = files.find(f => f.startsWith(baseName) && !f.endsWith('.part'));
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}

/**
 * Trim yt-dlp's verbose stderr to something human-readable.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeError(msg) {
  if (!msg) return 'Unknown error';
  const clean = msg.replace(/\x1B\[[0-9;]*m/g, '');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const errLine = lines.find(l =>
    l.toLowerCase().includes('error') || l.toLowerCase().includes('unable')
  ) || lines[0] || 'Unknown error';
  return errLine.slice(0, 200);
}

/**
 * Extract a human-readable name from a URL (last resort fallback).
 * @param {string} url
 * @returns {string}
 */
function fallbackTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || u.hostname);
  } catch {
    return 'track';
  }
}
