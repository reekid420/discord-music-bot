import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { QueryType } from 'discord-player';
import { getMemberVoiceChannel, isInSameVC } from '../utils/permissions.js';
import { useQueue } from 'discord-player';
import { getQueueSnapshot } from '../../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('replay')
  .setDescription('Restore your last queue (survives restarts and /stop)');

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc || !isInSameVC(interaction.member, interaction.client)) {
    return interaction.reply({
      content: '❌ You need to be in a voice channel first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const snapshot = getQueueSnapshot(interaction.guildId);
  if (!snapshot) {
    return interaction.reply({
      content: '❌ No saved queue for this server. Play something first!',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  const player = interaction.client.player;
  const urls = [];
  if (snapshot.current?.url) urls.push(snapshot.current.url);
  for (const t of snapshot.tracks || []) {
    if (t.url) urls.push(t.url);
  }

  if (urls.length === 0) {
    return interaction.followUp({ content: '❌ Saved queue is empty.' });
  }

  let restored = 0;
  let firstTrack = null;
  for (const url of urls) {
    try {
      const result = await player.play(vc, url, {
        nodeOptions: {
          metadata: { channel: interaction.channel, guild: interaction.guild },
          volume: Math.max(1, Math.min(100, snapshot.volume || 80)),
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300_000,
          leaveOnEnd: false,
        },
        searchEngine: QueryType.AUTO,
      });
      restored++;
      if (!firstTrack && result.track) firstTrack = result.track;
    } catch (err) {
      console.warn(`[Replay] Skipping ${url}: ${err.message?.split('\n')[0]}`);
    }
  }

  if (restored === 0) {
    return interaction.followUp({
      content: '❌ Could not restore any tracks (sources may have expired).',
    });
  }

  // Resume the interrupted track near where it left off
  if (snapshot.position > 5000) {
    const queue = useQueue(interaction.guildId);
    if (queue?.currentTrack && snapshot.current?.url === queue.currentTrack.url) {
      try {
        await queue.node.seek(Math.floor(snapshot.position));
      } catch {
        /* seeking not supported for this source */
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('🔁 Queue Restored')
    .setDescription(
      `Restored **${restored}/${urls.length}** tracks.` +
        (firstTrack ? `\n\n▶️ Resuming: [${firstTrack.title}](${firstTrack.url})` : '')
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}
