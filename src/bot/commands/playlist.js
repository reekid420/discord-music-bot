import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getMemberVoiceChannel, isDJ } from '../utils/permissions.js';
import { QueryType, useQueue } from 'discord-player';
import { isYouTubePlaylistUrl } from '../utils/urlHelpers.js';
import {
  createPlaylist, getUserPlaylists, getAllPlaylists,
  getPlaylistByName, getPlaylistByNameGlobal, getPlaylistById,
  getPlaylistTracks, addPlaylistTrack, deletePlaylist, updatePlaylist,
} from '../../db/database.js';
import { truncate } from '../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('playlist')
  .setDescription('Manage your playlists')
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('Create a new playlist')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Add the current track or a query to a playlist')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
      .addStringOption(opt => opt.setName('query').setDescription('Optional: URL or search query to add instead of current track'))
  )
  .addSubcommand(sub =>
    sub.setName('play')
      .setDescription('Enqueue all tracks from a playlist')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('List your playlists')
  )
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('View tracks in a playlist')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('Delete a playlist you own')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('share')
      .setDescription('Toggle a playlist as public/private')
      .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'create': return handleCreate(interaction);
    case 'add': return handleAdd(interaction);
    case 'play': return handlePlay(interaction);
    case 'list': return handleList(interaction);
    case 'view': return handleView(interaction);
    case 'delete': return handleDelete(interaction);
    case 'share': return handleShare(interaction);
  }
}

async function handleCreate(interaction) {
  const name = interaction.options.getString('name', true).trim();
  if (name.length > 50) {
    return interaction.reply({ content: '❌ Playlist name must be 50 characters or less.', ephemeral: true });
  }

  const existing = getPlaylistByName(interaction.user.id, name);
  if (existing) {
    return interaction.reply({ content: `❌ You already have a playlist called **${name}**.`, ephemeral: true });
  }

  const playlist = createPlaylist(interaction.user.id, name, interaction.guildId);
  await interaction.reply(`✅ Created playlist **${name}** (ID: ${playlist.id})`);
}

async function handleAdd(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const query = interaction.options.getString('query');

  let playlist = getPlaylistByName(interaction.user.id, name);

  // Admins/DJs can add to any playlist (including web-created ones)
  if (!playlist && isDJ(interaction.member)) {
    playlist = getPlaylistByNameGlobal(name);
  }

  if (!playlist) {
    return interaction.reply({ content: `❌ You don't have a playlist called **${name}**.`, ephemeral: true });
  }

  if (query) {
    await interaction.deferReply();
    try {
      const player = interaction.client.player;

      // ── YouTube playlist URL → bulk import all tracks ──
      if (isYouTubePlaylistUrl(query)) {
        const result = await player.search(query, { searchEngine: QueryType.AUTO });
        if (!result || !result.tracks.length) {
          return interaction.followUp({ content: '❌ No tracks found in that YouTube playlist.' });
        }
        let added = 0;
        for (const track of result.tracks) {
          try {
            addPlaylistTrack(playlist.id, {
              title: track.title,
              url: track.url,
              duration_ms: track.durationMS,
              thumbnail: track.thumbnail,
            });
            added++;
          } catch { /* skip duplicates */ }
        }
        const plName = result.playlist?.title || 'YouTube Playlist';
        return interaction.followUp(
          `✅ Imported **${added}** tracks from **${plName}** into playlist **${name}**.`
        );
      }

      // ── Single track search ──
      const result = await player.search(query, {
        requestedBy: interaction.user,
        searchEngine: QueryType.YOUTUBE_SEARCH,
      });
      if (!result || !result.tracks.length) {
        return interaction.followUp({ content: '❌ No results found for that query.' });
      }
      const track = result.tracks[0];
      addPlaylistTrack(playlist.id, {
        title: track.title,
        url: track.url,
        duration_ms: track.durationMS,
        thumbnail: track.thumbnail,
      });
      return interaction.followUp(`✅ Added **${track.title}** to playlist **${name}**.`);
    } catch (err) {
      return interaction.followUp({ content: `❌ Failed: ${err.message}` });
    }
  }

  // No query → add currently playing track
  const queue = useQueue(interaction.guildId);
  if (!queue || !queue.currentTrack) {
    return interaction.reply({ content: '❌ Nothing is playing. Provide a query or play a track first.', ephemeral: true });
  }

  const track = queue.currentTrack;
  addPlaylistTrack(playlist.id, {
    title: track.title,
    url: track.url,
    duration_ms: track.durationMS,
    thumbnail: track.thumbnail,
  });
  await interaction.reply(`✅ Added **${track.title}** to playlist **${name}**.`);
}

async function handlePlay(interaction) {
  const vc = getMemberVoiceChannel(interaction.member);
  if (!vc) {
    return interaction.reply({ content: '❌ You need to be in a voice channel.', ephemeral: true });
  }

  const name = interaction.options.getString('name', true).trim();
  let playlist = getPlaylistByName(interaction.user.id, name);

  // Fallback 1: public playlists (any owner)
  if (!playlist) {
    const { getDb } = await import('../../db/database.js');
    playlist = getDb().prepare(
      'SELECT * FROM playlists WHERE name = ? AND is_public = 1'
    ).get(name);
  }

  // Fallback 2: admins/DJs can play ANY playlist (including web-created ones)
  if (!playlist && isDJ(interaction.member)) {
    playlist = getPlaylistByNameGlobal(name);
  }

  if (!playlist) {
    return interaction.reply({ content: `❌ Playlist **${name}** not found.`, ephemeral: true });
  }

  const tracks = getPlaylistTracks(playlist.id);
  if (tracks.length === 0) {
    return interaction.reply({ content: `❌ Playlist **${name}** is empty.`, ephemeral: true });
  }

  await interaction.deferReply();

  const player = interaction.client.player;
  let added = 0;

  for (const t of tracks) {
    try {
      await player.play(vc, t.url, {
        nodeOptions: {
          metadata: { channel: interaction.channel, guild: interaction.guild },
          volume: 80,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300_000,
          leaveOnEnd: false,
        },
        requestedBy: interaction.user,
        // Treat stored entries as direct URLs/auto-detect so they never
        // trigger a keyword search that could pull in a YouTube Mix.
        searchEngine: QueryType.AUTO,
      });
      added++;
    } catch (err) {
      console.warn(`[Playlist] Failed to enqueue ${t.title}: ${err.message}`);
    }
  }

  await interaction.followUp(`📋 Enqueued **${added}/${tracks.length}** tracks from playlist **${name}**.`);
}

async function handleList(interaction) {
  const isAdmin = isDJ(interaction.member);

  // Admins/DJs see all playlists across all owners (including web-created ones)
  const playlists = isAdmin
    ? getAllPlaylists()
    : getUserPlaylists(interaction.user.id);

  if (playlists.length === 0) {
    return interaction.reply({ content: 'No playlists yet. Create one with `/playlist create`.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle(isAdmin ? '📋 All Playlists' : '📋 Your Playlists')
    .setDescription(
      playlists.map((p, i) => {
        const tracks = getPlaylistTracks(p.id);
        const pub = p.is_public ? '🌐' : '🔒';
        const owner = p.owner_id === interaction.user.id ? '' : ` *(by ${p.owner_id === 'dashboard' ? 'web dashboard' : `<@${p.owner_id}>`})*`;
        return `**${i + 1}.** ${pub} ${p.name}${owner} — ${tracks.length} tracks`;
      }).join('\n')
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleView(interaction) {
  const name = interaction.options.getString('name', true).trim();
  let playlist = getPlaylistByName(interaction.user.id, name);

  if (!playlist) {
    const { getDb } = await import('../../db/database.js');
    playlist = getDb().prepare(
      'SELECT * FROM playlists WHERE name = ? AND is_public = 1'
    ).get(name);
  }

  // Admins/DJs can view any playlist
  if (!playlist && isDJ(interaction.member)) {
    playlist = getPlaylistByNameGlobal(name);
  }

  if (!playlist) {
    return interaction.reply({ content: `❌ Playlist **${name}** not found.`, ephemeral: true });
  }

  const tracks = getPlaylistTracks(playlist.id);

  const embed = new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle(`📋 ${playlist.name}`)
    .setDescription(
      tracks.length === 0
        ? 'This playlist is empty.'
        : tracks.map((t, i) => `**${i + 1}.** ${truncate(t.title, 50)}`).join('\n')
    )
    .setFooter({ text: `${tracks.length} tracks | ${playlist.is_public ? 'Public' : 'Private'}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleDelete(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const playlist = getPlaylistByName(interaction.user.id, name);

  if (!playlist) {
    return interaction.reply({ content: `❌ You don't have a playlist called **${name}**.`, ephemeral: true });
  }

  deletePlaylist(playlist.id);
  await interaction.reply(`🗑️ Deleted playlist **${name}**.`);
}

async function handleShare(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const playlist = getPlaylistByName(interaction.user.id, name);

  if (!playlist) {
    return interaction.reply({ content: `❌ You don't have a playlist called **${name}**.`, ephemeral: true });
  }

  const newPublic = !playlist.is_public;
  updatePlaylist(playlist.id, { is_public: newPublic });
  await interaction.reply(`${newPublic ? '🌐' : '🔒'} Playlist **${name}** is now **${newPublic ? 'public' : 'private'}**.`);
}
