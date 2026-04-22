import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import youtubeDl from 'youtube-dl-exec';
import { createWriteStream, unlink, stat } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const unlinkAsync = promisify(unlink);
const statAsync = promisify(stat);

// Discord's default upload limit is 25 MB (non-boosted servers).
// Warn the user rather than failing silently.
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

export const data = new SlashCommandBuilder()
  .setName('extract')
  .setDescription('Download a track and send it to your DMs')
  .addStringOption(opt =>
    opt.setName('url')
      .setDescription('Link to extract (YouTube, TikTok, Spotify, SoundCloud…); leave blank to extract what\'s playing')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('format')
      .setDescription('Output format (default: mp4)')
      .setRequired(false)
      .addChoices(...FORMAT_CHOICES)
  );

export async function execute(interaction) {
  // Defer ephemerally — yt-dlp can take a while
  await interaction.deferReply({ ephemeral: true });

  const url    = interaction.options.getString('url') || null;
  const format = interaction.options.getString('format') || 'mp4';

  // ─── Resolve URL ──────────────────────────────────────────────
  let trackUrl    = url;
  let trackTitle  = null;

  if (!trackUrl) {
    const queue = useQueue(interaction.guildId);
    if (!queue?.currentTrack) {
      return interaction.editReply({
        content: '❌ Nothing is playing right now and no URL was provided.',
      });
    }
    trackUrl   = queue.currentTrack.url;
    trackTitle = queue.currentTrack.title;
  }

  // ─── Build yt-dlp options ─────────────────────────────────────
  const isAudio = ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(format);
  const uid      = randomUUID();
  // Use a temp path without extension — yt-dlp will add it
  const tmpBase  = join(tmpdir(), `groove-extract-${uid}`);
  const outTemplate = `${tmpBase}.%(ext)s`;

  const ytdlpOpts = {
    output: outTemplate,
    noPlaylist: true,
    noWarnings: true,
  };

  if (isAudio) {
    ytdlpOpts.extractAudio = true;
    ytdlpOpts.audioFormat  = format === 'ogg' ? 'vorbis' : format;
    ytdlpOpts.audioQuality = 0; // best
  } else {
    // Video: merge into the chosen container using ffmpeg (ffmpeg-static is installed)
    ytdlpOpts.format              = 'bestvideo+bestaudio/best';
    ytdlpOpts.mergeOutputFormat   = format; // mp4 / webm / mkv
  }

  // ─── Download ─────────────────────────────────────────────────
  let filePath;
  try {
    await youtubeDl(trackUrl, ytdlpOpts);

    // yt-dlp replaces %(ext)s with the real extension; find the file it wrote
    filePath = await resolveOutputFile(tmpBase, format, isAudio);

    if (!filePath) {
      throw new Error('yt-dlp finished but output file could not be found.');
    }
  } catch (err) {
    console.error('[Extract] yt-dlp error:', err.message);
    const errMsg = sanitizeYtdlpError(err.message);
    return interaction.editReply({
      content: `❌ Download failed: ${errMsg}`,
    });
  }

  // ─── Size check ───────────────────────────────────────────────
  try {
    const { size } = await statAsync(filePath);
    if (size > DISCORD_MAX_BYTES) {
      await unlinkAsync(filePath).catch(() => {});
      return interaction.editReply({
        content:
          `❌ The file is **${(size / 1024 / 1024).toFixed(1)} MB** — Discord's upload limit is 25 MB.\n` +
          `Try again with an audio format (e.g. \`mp3\` or \`aac\`) to get a much smaller file.`,
      });
    }
  } catch {
    // If stat fails the send will fail too — let the catch below handle it
  }

  // ─── Open DM & send ───────────────────────────────────────────
  // Build a clean filename for the attachment
  const safeName = (trackTitle || extractTitleFromUrl(trackUrl))
    .replace(/[^\w\s\-().]/g, '')
    .trim()
    .slice(0, 80) || 'track';

  const attachmentName = `${safeName}.${format === 'ogg' ? 'ogg' : format}`;

  try {
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send({
      content: `🎵 Here's your extracted track from Groove!`,
      files: [{ attachment: filePath, name: attachmentName }],
    });
  } catch (err) {
    await unlinkAsync(filePath).catch(() => {});

    // Discord error 50007 = Cannot send messages to this user (DMs disabled)
    if (err.code === 50007) {
      return interaction.editReply({
        content: '❌ I couldn\'t send you a DM. Please enable **"Allow direct messages from server members"** in your Privacy Settings and try again.',
      });
    }

    console.error('[Extract] DM send error:', err.message);
    return interaction.editReply({
      content: `❌ Failed to send the file: ${err.message}`,
    });
  } finally {
    // Always clean up the temp file
    await unlinkAsync(filePath).catch(() => {});
  }

  // ─── Success ──────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle('✅ Sent to your DMs!')
    .setDescription(trackTitle ? `**${trackTitle}**` : `\`${trackUrl}\``)
    .addFields(
      { name: 'Format', value: format.toUpperCase(), inline: true },
      { name: 'Type',   value: isAudio ? 'Audio' : 'Video', inline: true },
    )
    .setFooter({ text: 'Check your DMs — the file is on its way!' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * After yt-dlp runs, locate the output file.
 * yt-dlp replaces %(ext)s with the real extension (e.g. mp4, webm, m4a…).
 * For audio extractions the extension may differ from the requested format
 * (e.g. ogg → .ogg / vorbis, or the intermediary before conversion).
 * We try the expected extension first, then fall back to a glob-style scan of
 * the tmp directory for files starting with our UUID prefix.
 *
 * @param {string} tmpBase - Path without extension
 * @param {string} format  - Requested format string
 * @param {boolean} isAudio
 * @returns {Promise<string|null>}
 */
async function resolveOutputFile(tmpBase, format, isAudio) {
  const { readdir } = await import('fs/promises');
  const dir   = tmpdir();
  const base  = tmpBase.replace(dir + '\\', '').replace(dir + '/', '');

  // Look for any file in tmpdir that starts with our unique base name
  try {
    const files = await readdir(dir);
    const match = files.find(f => f.startsWith(base.split('/').pop().split('\\').pop()));
    if (match) return join(dir, match);
  } catch {
    // ignore
  }
  return null;
}

/**
 * Trim yt-dlp's verbose error output down to something readable.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeYtdlpError(msg) {
  if (!msg) return 'Unknown error';
  // Strip ANSI codes
  const clean = msg.replace(/\x1B\[[0-9;]*m/g, '');
  // Take only the first line that contains something useful
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const errorLine = lines.find(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('unable')) || lines[0] || 'Unknown error';
  return errorLine.slice(0, 200);
}

/**
 * Extract a readable title from a URL for use as a filename fallback.
 * @param {string} url
 * @returns {string}
 */
function extractTitleFromUrl(url) {
  try {
    const u = new URL(url);
    // Use the last non-empty path segment
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || u.hostname;
  } catch {
    return 'track';
  }
}
