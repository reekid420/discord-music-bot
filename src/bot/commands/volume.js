import { SlashCommandBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set the playback volume')
  .addIntegerOption(opt =>
    opt.setName('level')
      .setDescription('Volume level (1-100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  );

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', ephemeral: true });
  }

  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs can change the volume.', ephemeral: true });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }

  const level = interaction.options.getInteger('level', true);
  queue.node.setVolume(level);
  await interaction.reply(`🔊 Volume set to **${level}%**`);
}
