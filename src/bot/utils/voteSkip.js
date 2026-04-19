/**
 * Vote-skip system with full edge case handling.
 *
 * - Only VC members can vote
 * - Votes are removed when users leave VC
 * - Threshold is recalculated live on each vote
 * - Solo listener skips immediately
 * - Votes expire after 60 seconds
 * - Votes reset when the song changes
 */

/** @type {Map<string, { votes: Set<string>, songId: string, timeout: NodeJS.Timeout }>} */
const skipVotes = new Map();

const VOTE_TIMEOUT_MS = 60_000;

/**
 * Get current vote state for a guild.
 * @param {string} guildId
 */
export function getVoteState(guildId) {
  return skipVotes.get(guildId) || null;
}

/**
 * Calculate required votes from current VC members.
 * @param {import('discord.js').VoiceBasedChannel} voiceChannel
 * @param {number} threshold - 0.0 to 1.0, default 0.51
 * @returns {{ eligible: number, required: number }}
 */
export function calculateThreshold(voiceChannel, threshold = 0.51) {
  const eligible = voiceChannel.members.filter(m => !m.user.bot).size;
  const required = Math.max(1, Math.ceil(eligible * threshold));
  return { eligible, required };
}

/**
 * Cast a skip vote. Returns the result.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} songId - Current track identifier for staleness check
 * @param {import('discord.js').VoiceBasedChannel} voiceChannel
 * @param {number} threshold
 * @param {() => void} onSkip - Callback to execute the actual skip
 * @returns {{ status: 'voted'|'already_voted'|'skipped'|'solo_skip', current: number, required: number, eligible: number }}
 */
export function castVote(guildId, userId, songId, voiceChannel, threshold, onSkip) {
  const { eligible, required } = calculateThreshold(voiceChannel, threshold);

  // Solo listener → instant skip
  if (eligible <= 1) {
    clearVotes(guildId);
    onSkip();
    return { status: 'solo_skip', current: 1, required: 1, eligible };
  }

  let state = skipVotes.get(guildId);

  // If no active vote or the song changed, start fresh
  if (!state || state.songId !== songId) {
    clearVotes(guildId);
    state = {
      votes: new Set(),
      songId,
      timeout: setTimeout(() => {
        clearVotes(guildId);
      }, VOTE_TIMEOUT_MS),
    };
    skipVotes.set(guildId, state);
  }

  // Already voted?
  if (state.votes.has(userId)) {
    return { status: 'already_voted', current: state.votes.size, required, eligible };
  }

  // Add vote
  state.votes.add(userId);

  // Check if threshold met
  if (state.votes.size >= required) {
    clearVotes(guildId);
    onSkip();
    return { status: 'skipped', current: state.votes.size, required, eligible };
  }

  return { status: 'voted', current: state.votes.size, required, eligible };
}

/**
 * Remove a user's vote (called when they leave VC).
 * Returns true if the removal caused a skip (threshold now met with fewer people).
 * @param {string} guildId
 * @param {string} userId
 * @param {import('discord.js').VoiceBasedChannel | null} voiceChannel
 * @param {number} threshold
 * @param {() => void} onSkip
 * @returns {boolean} Whether a skip was triggered
 */
export function removeVoter(guildId, userId, voiceChannel, threshold, onSkip) {
  const state = skipVotes.get(guildId);
  if (!state) return false;

  state.votes.delete(userId);

  // If nobody or no VC, clear
  if (!voiceChannel || state.votes.size === 0) {
    clearVotes(guildId);
    return false;
  }

  // Recalculate threshold with new VC member count
  const { required } = calculateThreshold(voiceChannel, threshold);

  if (state.votes.size >= required) {
    clearVotes(guildId);
    onSkip();
    return true;
  }

  return false;
}

/**
 * Clear all votes for a guild. Called on song change, stop, disconnect.
 * @param {string} guildId
 */
export function clearVotes(guildId) {
  const state = skipVotes.get(guildId);
  if (state?.timeout) {
    clearTimeout(state.timeout);
  }
  skipVotes.delete(guildId);
}
