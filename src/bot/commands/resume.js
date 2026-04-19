import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume the paused track (DJ only)');

export async function execute(interaction) {
  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs can resume playback.', flags: MessageFlags.Ephemeral });
  }

  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', flags: MessageFlags.Ephemeral });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', flags: MessageFlags.Ephemeral });
  }

  queue.node.setPaused(false);
  await interaction.reply('▶️ Resumed.');
}
