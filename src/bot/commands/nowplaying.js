import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { progressBar, formatDuration } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the currently playing track');

export async function execute(interaction) {
  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.currentTrack) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }

  const track = queue.currentTrack;
  const progress = queue.node.getTimestamp();

  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle('🎶 Now Playing')
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: 'Artist', value: track.author || 'Unknown', inline: true },
      { name: 'Duration', value: track.duration || 'Live', inline: true },
      { name: 'Source', value: track.source || 'Unknown', inline: true },
      { name: 'Requested by', value: track.requestedBy?.tag || 'Unknown', inline: true },
      {
        name: 'Progress',
        value: `${progress?.current?.label || '0:00'} ${progressBar(progress?.current?.value || 0, progress?.total?.value || 0)} ${progress?.total?.label || '0:00'}`,
      },
    )
    .setThumbnail(track.thumbnail || null)
    .setFooter({
      text: `Volume: ${queue.node.volume}% | Loop: ${queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? 'Track' : 'Queue'}`,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
