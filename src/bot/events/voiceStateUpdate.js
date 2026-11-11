import { clearVotes, removeVoter, getVoteState } from '../utils/voteSkip.js';
import { getGuildSettings } from '../../db/database.js';

export const name = 'voiceStateUpdate';
export const once = false;

/** @type {Map<string, NodeJS.Timeout>} guildId → pending auto-leave timer */
const autoLeaveTimers = new Map();

const DEFAULT_AUTO_LEAVE_S = 300;

/**
 * Handles voice state changes for:
 * 1. Vote-skip: remove votes when users leave VC
 * 2. Auto-leave: leave after the guild's auto_leave_s when the bot is alone
 */
export async function execute(oldState, newState) {
  const client = oldState.client || newState.client;
  const guild = oldState.guild || newState.guild;
  const guildId = guild.id;
  const botVC = guild.members.cache.get(client.user.id)?.voice?.channel || null;

  // Someone joined the bot's channel — cancel any pending auto-leave
  if (botVC && newState.channelId === botVC.id && oldState.channelId !== botVC.id) {
    cancelAutoLeave(guildId);
    return;
  }

  // Everything below only concerns users leaving a channel
  const leftChannel =
    oldState.channel && (!newState.channel || oldState.channelId !== newState.channelId);
  if (!leftChannel) return;

  const userId = oldState.member?.id;
  if (!userId || oldState.member?.user?.bot) return;

  // ─── Vote-skip: drop the leaver's vote ───
  if (getVoteState(guildId) && botVC) {
    const threshold = getGuildSettings(guildId)?.vote_threshold || 0.51;
    const queue = client.player?.queues?.get(guildId);

    removeVoter(guildId, userId, botVC, threshold, () => {
      if (!queue?.currentTrack) return;
      queue.node.skip();
      const textChannel = queue.metadata?.channel;
      if (textChannel) {
        textChannel.send('⏭️ Vote-skip threshold met (voter left). Skipping...');
      }
    });
  }

  // ─── Auto-leave: bot alone in its channel after the grace period ───
  if (botVC && botVC.id === oldState.channelId) {
    const humansLeft = botVC.members.filter((m) => !m.user.bot).size;
    if (humansLeft === 0) scheduleAutoLeave(client, guild, botVC);
  }
}

/**
 * Schedule disconnect for an empty VC, honoring the guild's auto_leave_s
 * setting (0 disables auto-leave).
 */
function scheduleAutoLeave(client, guild, botVC) {
  const delayS = getGuildSettings(guild.id)?.auto_leave_s ?? DEFAULT_AUTO_LEAVE_S;
  if (delayS <= 0) return; // auto-leave disabled

  cancelAutoLeave(guild.id);
  console.log(`[Voice] VC empty in ${guild.name} — leaving in ${delayS}s`);

  const timer = setTimeout(() => {
    autoLeaveTimers.delete(guild.id);

    // Re-check: someone may have rejoined during the wait
    const stillEmpty = botVC.members && botVC.members.filter((m) => !m.user.bot).size === 0;
    if (!stillEmpty) return;

    const queue = client.player?.queues?.get(guild.id);
    if (queue) {
      queue.delete();
      clearVotes(guild.id);
      console.log(`[Voice] Auto-left empty VC in ${guild.name} after ${delayS}s`);
    }
  }, delayS * 1000);
  timer.unref();
  autoLeaveTimers.set(guild.id, timer);
}

function cancelAutoLeave(guildId) {
  const timer = autoLeaveTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    autoLeaveTimers.delete(guildId);
  }
}
