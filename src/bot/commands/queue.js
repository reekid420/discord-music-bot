import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { truncate, formatDuration } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('View the current music queue')
  .addIntegerOption(opt =>
    opt.setName('page')
      .setDescription('Page number')
      .setMinValue(1)
  );

export async function execute(interaction) {
  const queue = useQueue(interaction.guildId);
  if (!queue || (!queue.currentTrack && queue.tracks.size === 0)) {
    return interaction.reply({ content: '📭 The queue is empty.', ephemeral: true });
  }

  const tracks = queue.tracks.toArray();
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const page = Math.min(interaction.options.getInteger('page') || 1, totalPages);
  const start = (page - 1) * pageSize;
  const pageTracks = tracks.slice(start, start + pageSize);

  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle('📋 Music Queue')
    .setTimestamp();

  if (queue.currentTrack) {
    embed.addFields({
      name: '🎶 Now Playing',
      value: `[${truncate(queue.currentTrack.title, 60)}](${queue.currentTrack.url}) — ${queue.currentTrack.duration}`,
    });
  }

  if (pageTracks.length > 0) {
    const list = pageTracks
      .map((track, i) => `**${start + i + 1}.** [${truncate(track.title, 45)}](${track.url}) — ${track.duration}`)
      .join('\n');

    embed.addFields({ name: `Up Next (${tracks.length} total)`, value: list });
  } else if (tracks.length === 0) {
    embed.addFields({ name: 'Up Next', value: 'No tracks in queue.' });
  }

  embed.setFooter({ text: `Page ${page}/${totalPages} • Loop: ${queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? 'Track' : 'Queue'}` });

  await interaction.reply({ embeds: [embed] });
}
