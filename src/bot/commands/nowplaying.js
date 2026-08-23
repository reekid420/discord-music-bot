import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { progressBar, safeEmbedUrl } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the currently playing track');

export async function execute(interaction) {
  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.currentTrack) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', flags: MessageFlags.Ephemeral });
  }

  const track = queue.currentTrack;
  const progress = queue.node.getTimestamp();
  const upcoming = queue.tracks.size;
  const loopLabels = { 0: 'Off', 1: 'Track', 2: 'Queue' };

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('🎶 Now Playing')
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: 'Artist', value: track.author || 'Unknown', inline: true },
      { name: 'Duration', value: track.duration || 'Live', inline: true },
      { name: 'Source', value: track.source || 'Unknown', inline: true },
      { name: 'Requested by', value: track.requestedBy?.tag || 'Unknown', inline: true },
      {
        name: 'Up next',
        value: upcoming > 0 ? `${upcoming} track${upcoming === 1 ? '' : 's'}` : '—',
        inline: true,
      },
      {
        name: 'Progress',
        value: `${progress?.current?.label || '0:00'} ${progressBar(progress?.current?.value || 0, progress?.total?.value || 0)} ${progress?.total?.label || '0:00'}`,
      }
    )
    .setThumbnail(safeEmbedUrl(track.thumbnail))
    .setFooter({
      text: `Volume: ${queue.node.volume}% | Loop: ${loopLabels[queue.repeatMode] ?? 'Off'} | Try /lyrics`,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
