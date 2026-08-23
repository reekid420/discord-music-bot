import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import { getMemberVoiceChannel } from '../utils/permissions.js';
import { pickSearchEngine } from '../utils/urlHelpers.js';
import { safeEmbedUrl } from '../utils/formatters.js';
import { getGuildSettings } from '../../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription(
    'Search for a song or provide a link from YouTube, SoundCloud, Spotify, or TikTok'
  )
  .addStringOption((opt) =>
    opt
      .setName('query')
      .setDescription('Search for a song, or paste a URL — YouTube playlists are also supported')
      .setRequired(true)
  );

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc) {
    return interaction.reply({ content: '❌ You need to be in a voice channel.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  const query = interaction.options.getString('query', true);
  const player = interaction.client.player;
  const defaultVolume = Math.max(
    1,
    Math.min(100, getGuildSettings(interaction.guildId)?.default_volume ?? 80)
  );

  // For YouTube playlist URLs use AUTO so the full playlist loads.
  // For plain text searches use YOUTUBE_SEARCH to prevent Mix auto-queue.
  const searchEngine = pickSearchEngine(query, QueryType);

  try {
    const result = await player.play(vc, query, {
      nodeOptions: {
        metadata: {
          channel: interaction.channel,
          guild: interaction.guild,
        },
        volume: defaultVolume,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300_000,
        leaveOnEnd: false,
        leaveOnEndCooldown: 300_000,
      },
      requestedBy: interaction.user,
      searchEngine,
    });

    const isPlaylistResult = !!result.searchResult?.playlist;
    const embed = new EmbedBuilder().setColor(0x7c3aed).setTimestamp();

    if (isPlaylistResult) {
      const pl = result.searchResult.playlist;
      const trackCount = result.searchResult.tracks.length;
      embed
        .setTitle('📋 Playlist Added to Queue')
        .setDescription(`[${pl.title}](${pl.url || query})`)
        .addFields(
          { name: 'Tracks', value: `${trackCount}`, inline: true },
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          { name: 'Source', value: pl.source || 'YouTube', inline: true }
        )
        .setThumbnail(safeEmbedUrl(pl.thumbnail || result.track?.thumbnail));
    } else {
      const track = result.track;
      embed
        .setTitle('🎵 Added to Queue')
        .setDescription(`[${track.title}](${track.url})`)
        .addFields(
          { name: 'Duration', value: track.duration || 'Live', inline: true },
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          { name: 'Source', value: track.source || 'Unknown', inline: true }
        )
        .setThumbnail(safeEmbedUrl(track.thumbnail));
    }

    await interaction.followUp({ embeds: [embed] });
  } catch (error) {
    // /stop (or a disconnect) cancels in-flight searches — not a real failure
    if (error?.message === 'Cancelled') {
      return interaction.followUp({ content: '⏹️ Playback request cancelled.' }).catch(() => {});
    }
    console.error('[Play]', error);
    await interaction
      .followUp({ content: `❌ Could not play: ${error.message}` })
      .catch(() => {});
  }
}
