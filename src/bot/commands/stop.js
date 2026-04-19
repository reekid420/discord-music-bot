import { SlashCommandBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';
import { clearVotes } from '../utils/voteSkip.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback, clear the queue, and leave the voice channel');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', ephemeral: true });
  }

  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs and admins can stop the bot.', ephemeral: true });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }

  clearVotes(interaction.guildId);
  queue.delete();
  await interaction.reply('⏹️ Stopped playback and cleared the queue.');
}
