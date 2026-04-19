import { PermissionFlagsBits } from 'discord.js';
import { getGuildSettings } from '../../db/database.js';

/**
 * Check if a member has DJ-level permissions.
 * DJ means: has the configured DJ role, or has Manage Channels, or is Admin.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
export function isDJ(member) {
  if (!member.guild) return false;

  // Server admin always has DJ
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;

  // Check configured DJ role
  const settings = getGuildSettings(member.guild.id);
  if (settings?.dj_role_id && member.roles.cache.has(settings.dj_role_id)) return true;

  return false;
}

/**
 * Check if a member is in a voice channel.
 * @param {import('discord.js').GuildMember} member
 * @returns {import('discord.js').VoiceBasedChannel | null}
 */
export function getMemberVoiceChannel(member) {
  return member.voice?.channel || null;
}

/**
 * Check if the bot is in the same voice channel as the member.
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Client} client
 * @returns {boolean}
 */
export function isInSameVC(member, client) {
  const memberVC = getMemberVoiceChannel(member);
  if (!memberVC) return false;

  const botMember = member.guild.members.cache.get(client.user.id);
  const botVC = botMember?.voice?.channel;
  if (!botVC) return true; // Bot not in VC, allow (they'll join)

  return memberVC.id === botVC.id;
}
