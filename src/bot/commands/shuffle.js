import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Shuffle the current queue');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({
      content: '❌ You need to be in the same voice channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs can shuffle the queue.', flags: MessageFlags.Ephemeral });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue || queue.tracks.size === 0) {
    return interaction.reply({ content: '❌ The queue is empty.', flags: MessageFlags.Ephemeral });
  }

  queue.tracks.shuffle();
  await interaction.reply(`🔀 Shuffled **${queue.tracks.size}** tracks.`);
}
