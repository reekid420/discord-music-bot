import { clearVotes, removeVoter, getVoteState } from '../utils/voteSkip.js';
import { getGuildSettings } from '../../db/database.js';

export const name = 'voiceStateUpdate';
export const once = false;

/**
 * Handles voice state changes for:
 * 1. Vote-skip: remove votes when users leave VC
 * 2. Auto-leave: if bot is alone in VC
 */
export async function execute(oldState, newState) {
  const client = oldState.client || newState.client;
  const guild = oldState.guild || newState.guild;

  // User left a voice channel or moved to a different one
  const leftChannel = oldState.channel && (!newState.channel || oldState.channelId !== newState.channelId);

  if (leftChannel && oldState.channel) {
    const userId = oldState.member?.id;
    if (!userId || oldState.member?.user?.bot) return;

    const guildId = guild.id;
    const voteState = getVoteState(guildId);

    if (voteState) {
      const settings = getGuildSettings(guildId);
      const threshold = settings?.vote_threshold || 0.51;

      // Get the bot's current VC
      const botMember = guild.members.cache.get(client.user.id);
      const botVC = botMember?.voice?.channel;

      if (botVC) {
        const player = client.player;
        const queue = player?.queues?.get(guildId);

        removeVoter(guildId, userId, botVC, threshold, () => {
          // Skip triggered by someone leaving
          if (queue?.currentTrack) {
            queue.node.skip();
            const textChannel = queue.metadata?.channel;
            if (textChannel) {
              textChannel.send('⏭️ Vote-skip threshold met (voter left). Skipping...');
            }
          }
        });
      }
    }

    // Auto-leave if bot is alone in VC
    const botMember = guild.members.cache.get(client.user.id);
    const botVC = botMember?.voice?.channel;
    if (botVC && botVC.id === oldState.channelId) {
      const nonBotMembers = botVC.members.filter(m => !m.user.bot);
      if (nonBotMembers.size === 0) {
        const player = client.player;
        const queue = player?.queues?.get(guildId);
        if (queue) {
          queue.delete();
          clearVotes(guildId);
          console.log(`[Voice] Auto-left empty VC in ${guild.name}`);
        }
      }
    }
  }
}
