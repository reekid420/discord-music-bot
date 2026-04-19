import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause the current track (DJ only)');

export async function execute(interaction) {
  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs can pause playback.', flags: MessageFlags.Ephemeral });
  }

  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', flags: MessageFlags.Ephemeral });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', flags: MessageFlags.Ephemeral });
  }

  queue.node.setPaused(true);
  await interaction.reply('⏸️ Paused.');
}
