import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume the paused track (anyone in voice channel)');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({
      content: '❌ You need to be in the same voice channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({
      content: '❌ Nothing is playing right now.',
      flags: MessageFlags.Ephemeral,
    });
  }

  queue.node.setPaused(false);
  await interaction.reply('▶️ Resumed.');
}
