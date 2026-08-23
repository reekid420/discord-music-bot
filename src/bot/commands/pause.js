import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause the current track (anyone in voice channel)');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({
      content: '❌ You need to be in the same voice channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({
      content: '❌ Nothing is playing right now.',
      flags: MessageFlags.Ephemeral,
    });
  }

  queue.node.setPaused(true);
  await interaction.reply('⏸️ Paused.');
}
