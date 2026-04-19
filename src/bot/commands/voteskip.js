import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC } from '../utils/permissions.js';
import { useQueue } from 'discord-player';
import { castVote } from '../utils/voteSkip.js';
import { getGuildSettings } from '../../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('voteskip')
  .setDescription('Vote to skip the current track');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', ephemeral: true });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.currentTrack) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }

  const settings = getGuildSettings(interaction.guildId);
  const threshold = settings?.vote_threshold || 0.51;
  const songId = queue.currentTrack.url || queue.currentTrack.title;

  const result = castVote(
    interaction.guildId,
    interaction.user.id,
    songId,
    vc,
    threshold,
    () => queue.node.skip()
  );

  const embed = new EmbedBuilder().setColor(0x7C3AED);

  switch (result.status) {
    case 'solo_skip':
      embed.setDescription('⏭️ Skipped (you are the only listener).');
      break;
    case 'skipped':
      embed.setDescription('⏭️ Vote-skip threshold reached! Skipping...');
      break;
    case 'already_voted':
      embed.setDescription(`⚠️ You already voted. (${result.current}/${result.required} needed)`);
      break;
    case 'voted':
      embed.setDescription(`🗳️ Vote registered! (${result.current}/${result.required} needed)`);
      break;
  }

  await interaction.reply({ embeds: [embed] });
}
