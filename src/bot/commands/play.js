import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import { getMemberVoiceChannel } from '../utils/permissions.js';
import { formatDuration } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Search for a song or provide a link from YouTube, SoundCloud, Spotify, or TikTok')
  .addStringOption(opt =>
    opt.setName('query')
      .setDescription('Search for a song or provide a URL from YouTube, SoundCloud, Spotify, or TikTok')
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
      // Pin to a plain search so discord-player never resolves a query into a
      // YouTube Mix/auto-playlist (which would dump 20+ related tracks into queue).
      // URLs are still resolved correctly because the extractor checks for a URL
      // first before falling back to the search engine.
      searchEngine: QueryType.YOUTUBE_SEARCH,
    });

    const track = result.track;
    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('🎵 Added to Queue')
      .setDescription(`[${track.title}](${track.url})`)
      .addFields(
        { name: 'Duration', value: track.duration || 'Live', inline: true },
        { name: 'Requested by', value: interaction.user.tag, inline: true },
        { name: 'Source', value: track.source || 'Unknown', inline: true },
      )
      .setThumbnail(track.thumbnail || null)
      .setTimestamp();

    if (result.searchResult?.playlist) {
      embed.addFields({
        name: 'Playlist',
        value: `${result.searchResult.playlist.title} (${result.searchResult.tracks.length} tracks)`,
      });
    }

    await interaction.followUp({ embeds: [embed] });
  } catch (error) {
    console.error('[Play]', error);
    await interaction.followUp({ content: `❌ Could not play: ${error.message}` });
  }
}
