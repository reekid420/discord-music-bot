import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import youtubeDl from 'youtube-dl-exec';
import { unlink, stat } from 'fs';
import { readdir } from 'fs/promises';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

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

  console.log(`[Extract] Request from ${interaction.user.tag} — url=${url ?? '(current track)'} format=${format}`);

  // Defer ephemerally — yt-dlp can take 10–30 s
  await interaction.deferReply({ ephemeral: true });

  // ─── Resolve URL ──────────────────────────────────────────────
  let trackUrl   = url;
  let trackTitle = null;

  if (!trackUrl) {
    const queue = useQueue(interaction.guildId);
    if (!queue?.currentTrack) {
      return interaction.editReply({
        content: '❌ Nothing is playing right now and no URL was provided.',
      });
    }
    trackUrl   = queue.currentTrack.url;
    trackTitle = queue.currentTrack.title;
    console.log(`[Extract] Using current track: ${trackTitle} — ${trackUrl}`);
  }

  // ─── Build yt-dlp options ─────────────────────────────────────
  const isAudio     = ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(format);
  const uid         = randomUUID();
  const tmpBase     = join(tmpdir(), `groove-extract-${uid}`);
  const outTemplate = `${tmpBase}.%(ext)s`;

  /** @type {Record<string, any>} */
  const ytdlpOpts = {
    output:     outTemplate,
    noPlaylist: true,
    noWarnings: true,
  };

  if (isAudio) {
    ytdlpOpts.extractAudio = true;
    ytdlpOpts.audioFormat  = format === 'ogg' ? 'vorbis' : format;
    ytdlpOpts.audioQuality = 0; // best
  } else {
    ytdlpOpts.format            = 'bestvideo+bestaudio/best';
    ytdlpOpts.mergeOutputFormat = format; // mp4 / webm / mkv
  }

  // ─── Download ─────────────────────────────────────────────────
  console.log(`[Extract] Starting yt-dlp download — ${trackUrl}`);
  let filePath;
  try {
    await youtubeDl(trackUrl, ytdlpOpts);
    filePath = await findOutputFile(tmpBase);

    if (!filePath) {
      throw new Error('yt-dlp finished but the output file could not be found in the temp directory.');
    }
    console.log(`[Extract] Download complete: ${filePath}`);
  } catch (err) {
    console.error('[Extract] yt-dlp error:', err.message);
    return interaction.editReply({
      content: `❌ Download failed: ${sanitizeError(err.message)}`,
    });
  }

  // ─── Size check ───────────────────────────────────────────────
  try {
    const { size } = await statAsync(filePath);
    console.log(`[Extract] File size: ${(size / 1024 / 1024).toFixed(2)} MB`);
    if (size > DISCORD_MAX_BYTES) {
      await unlinkAsync(filePath).catch(() => {});
      return interaction.editReply({
        content:
          `❌ The file is **${(size / 1024 / 1024).toFixed(1)} MB** — Discord's upload limit is 25 MB.\n` +
          `Try again with an audio format such as \`mp3\` or \`aac\` to get a much smaller file.`,
      });
    }
  } catch (err) {
    console.warn('[Extract] Could not stat file:', err.message);
  }

  // ─── Open DM & send ───────────────────────────────────────────
  // Build a clean filename for the attachment
  const safeName = (trackTitle || extractTitleFromUrl(trackUrl))
    .replace(/[^\w\s\-().]/g, '')
    .trim()
    .slice(0, 80) || 'track';

  // For ogg/vorbis yt-dlp writes .ogg, all others match the format string
  const ext            = format === 'ogg' ? 'ogg' : format;
  const attachmentName = `${safeName}.${ext}`;

  console.log(`[Extract] Sending DM to ${interaction.user.tag}: ${attachmentName}`);
  try {
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send({
      content: '🎵 Here\'s your extracted track from Groove!',
      files: [{ attachment: filePath, name: attachmentName }],
    });
  } catch (err) {
    await unlinkAsync(filePath).catch(() => {});

    // Discord error 50007 = Cannot send messages to this user (DMs closed)
    if (err.code === 50007) {
      return interaction.editReply({
        content:
          '❌ I couldn\'t send you a DM.\n' +
          'Please enable **"Allow direct messages from server members"** in your Privacy Settings and try again.',
      });
    }

    console.error('[Extract] DM send error:', err.message);
    return interaction.editReply({
      content: `❌ Failed to send the file: ${err.message}`,
    });
  }

  // Clean up
  await unlinkAsync(filePath).catch(() => {});
  console.log(`[Extract] Done — temp file cleaned up.`);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * After yt-dlp writes `<tmpBase>.<ext>`, find whatever file it created.
 * yt-dlp substitutes %(ext)s with the real extension, which may differ from
 * the requested format (e.g. ogg/vorbis → .ogg, or an m4a before remux).
 *
 * @param {string} tmpBase  Full path without extension (e.g. /tmp/groove-extract-<uuid>)
 * @returns {Promise<string|null>}
 */
async function findOutputFile(tmpBase) {
  const dir      = tmpdir();
  const baseName = tmpBase.slice(dir.length).replace(/^[\\/]/, ''); // just the filename without ext

  try {
    const files = await readdir(dir);
    // Match any file that starts with our unique base name
    const match = files.find(f => f.startsWith(baseName) && !f.endsWith('.part'));
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}

/**
 * Trim yt-dlp's verbose error output to something human-readable.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeError(msg) {
  if (!msg) return 'Unknown error';
  const clean = msg.replace(/\x1B\[[0-9;]*m/g, ''); // strip ANSI
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const errLine = lines.find(l =>
    l.toLowerCase().includes('error') || l.toLowerCase().includes('unable')
  ) || lines[0] || 'Unknown error';
  return errLine.slice(0, 200);
}

/**
 * Extract a readable title from a URL for use as a filename fallback.
 * @param {string} url
 * @returns {string}
 */
function extractTitleFromUrl(url) {
  try {
    const u        = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || u.hostname;
  } catch {
    return 'track';
  }
}
