import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { truncate } from '../utils/formatters.js';
import { findLyrics } from '../utils/lyrics.js';

export const data = new SlashCommandBuilder()
  .setName('lyrics')
  .setDescription('Show lyrics for the current track or a search')
  .addStringOption((opt) =>
    opt.setName('query').setDescription("Song to look up (defaults to what's playing)")
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString('query');
  let artist = '';
  let title = query ?? '';

  if (!query) {
    const queue = useQueue(interaction.guildId);
    const track = queue?.currentTrack;
    if (!track) {
      return interaction.followUp({
        content: '❌ Nothing is playing. Give me a song name or play something first.',
      });
    }
    artist = track.author ?? '';
    title = track.title;
  } else {
    // Free-text queries in the "Artist - Title" shape get an exact lookup too
    const parts = title.split(/\s+[-–—]\s+/);
    if (parts.length === 2) {
      artist = parts[0];
      title = parts[1];
    }
  }
  const contextTitle = query || title;

  let match;
  try {
    match = await findLyrics({ artist, title });
  } catch (err) {
    console.error('[Lyrics] lookup failed:', err.message);
    return interaction.followUp({ content: '❌ Lyrics service is unavailable right now.' });
  }

  if (!match || !match.plainLyrics) {
    return interaction.followUp({
      content: `❌ No lyrics found for **${truncate(contextTitle, 60)}**.`,
    });
  }

  // Discord embed descriptions cap at 4096 chars
  const lyrics =
    match.plainLyrics.length > 4000 ? match.plainLyrics.slice(0, 4000) + '\n…' : match.plainLyrics;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`${match.trackName} — ${match.artistName}`)
    .setDescription(lyrics)
    .setFooter({
      text: `Lyrics via lrclib.net${query ? '' : ` • requested for: ${truncate(contextTitle, 60)}`}`,
    })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}
