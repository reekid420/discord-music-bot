import { SlashCommandBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a track from the queue')
  .addIntegerOption(opt =>
    opt.setName('position')
      .setDescription('Position in queue (1 = next up)')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', ephemeral: true });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue || queue.tracks.size === 0) {
    return interaction.reply({ content: '❌ The queue is empty.', ephemeral: true });
  }

  const position = interaction.options.getInteger('position', true);
  const tracks = queue.tracks.toArray();

  if (position < 1 || position > tracks.length) {
    return interaction.reply({ content: `❌ Invalid position. Queue has ${tracks.length} tracks.`, ephemeral: true });
  }

  const track = tracks[position - 1];

  // Allow removal of own tracks, or DJ can remove any
  const isOwner = track.requestedBy?.id === interaction.user.id;
  if (!isOwner && !isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ You can only remove your own tracks, or be a DJ.', ephemeral: true });
  }

  queue.removeTrack(position - 1);
  await interaction.reply(`🗑️ Removed **${track.title}** from position ${position}.`);
}
