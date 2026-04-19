import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import { getMemberVoiceChannel } from '../utils/permissions.js';
import { isYouTubePlaylistUrl, pickSearchEngine } from '../utils/urlHelpers.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Search for a song or provide a link from YouTube, SoundCloud, Spotify, or TikTok')
  .addStringOption(opt =>
    opt.setName('query')
      .setDescription('Search for a song, or paste a URL — YouTube playlists are also supported')
      .setRequired(true)
  );

export async function execute(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc) {
    return interaction.reply({ content: '❌ You need to be in a voice channel.', ephemeral: true });
  }

  await interaction.deferReply();

  const query = interaction.options.getString('query', true);
  const player = interaction.client.player;

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
        volume: 80,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300_000,
        leaveOnEnd: false,
        leaveOnEndCooldown: 300_000,
      },
      requestedBy: interaction.user,
      searchEngine,
    });

    const isPlaylistResult = !!(result.searchResult?.playlist);
    const embed = new EmbedBuilder().setColor(0x7C3AED).setTimestamp();

    if (isPlaylistResult) {
      const pl = result.searchResult.playlist;
      const trackCount = result.searchResult.tracks.length;
      embed
        .setTitle('📋 Playlist Added to Queue')
        .setDescription(`[${pl.title}](${pl.url || query})`)
        .addFields(
          { name: 'Tracks', value: `${trackCount}`, inline: true },
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          { name: 'Source', value: pl.source || 'YouTube', inline: true },
        )
        .setThumbnail(pl.thumbnail || result.track?.thumbnail || null);
    } else {
      const track = result.track;
      embed
        .setTitle('🎵 Added to Queue')
        .setDescription(`[${track.title}](${track.url})`)
        .addFields(
          { name: 'Duration', value: track.duration || 'Live', inline: true },
          { name: 'Requested by', value: interaction.user.tag, inline: true },
          { name: 'Source', value: track.source || 'Unknown', inline: true },
        )
        .setThumbnail(track.thumbnail || null);
    }

    await interaction.followUp({ embeds: [embed] });
  } catch (error) {
    console.error('[Play]', error);
    await interaction.followUp({ content: `❌ Could not play: ${error.message}` });
  }
}
