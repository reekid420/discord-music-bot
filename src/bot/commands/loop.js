import { SlashCommandBuilder } from 'discord.js';
import { getMemberVoiceChannel, isInSameVC, isDJ } from '../utils/permissions.js';
import { useQueue, QueueRepeatMode } from 'discord-player';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Set loop mode')
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Loop mode')
      .setRequired(true)
      .addChoices(
        { name: 'Off', value: 'off' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' },
      )
  );

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({ content: '❌ You need to be in the same voice channel.', ephemeral: true });
  }

  if (!isDJ(interaction.member)) {
    return interaction.reply({ content: '❌ Only DJs can change the loop mode.', ephemeral: true });
  }

  const queue = useQueue(interaction.guildId);
  if (!queue) {
    return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
  }

  const mode = interaction.options.getString('mode', true);
  const modes = {
    off: QueueRepeatMode.OFF,
    track: QueueRepeatMode.TRACK,
    queue: QueueRepeatMode.QUEUE,
  };

  queue.setRepeatMode(modes[mode]);

  const labels = { off: '➡️ Loop off', track: '🔂 Looping current track', queue: '🔁 Looping entire queue' };
  await interaction.reply(labels[mode]);
}
