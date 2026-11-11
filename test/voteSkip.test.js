import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateThreshold,
  castVote,
  removeVoter,
  clearVotes,
  getVoteState,
} from '../src/bot/utils/voteSkip.js';

function fakeVc(humans, bots = 0) {
  const members = [...Array(humans).fill({ user: { bot: false } }), ...Array(bots).fill({ user: { bot: true } })];
  return { members: { filter: (fn) => ({ size: members.filter(fn).length }) } };
}

beforeEach(() => clearVotes('g1'));
afterEach(() => clearVotes('g1'));

describe('calculateThreshold', () => {
  it('counts only humans and never requires zero votes', () => {
    expect(calculateThreshold(fakeVc(4, 2))).toEqual({ eligible: 4, required: 3 });
    expect(calculateThreshold(fakeVc(0))).toEqual({ eligible: 0, required: 1 });
  });
});

describe('castVote', () => {
  it('skips instantly for a solo listener', () => {
    const onSkip = vi.fn();
    const res = castVote('g1', 'u1', 'song1', fakeVc(1), 0.51, onSkip);
    expect(res.status).toBe('solo_skip');
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('collects votes until the threshold is met', () => {
    const onSkip = vi.fn();
    const vc = fakeVc(3);
    expect(castVote('g1', 'u1', 'song1', vc, 0.51, onSkip)).toMatchObject({
      status: 'voted',
      current: 1,
      required: 2,
    });
    expect(castVote('g1', 'u2', 'song1', vc, 0.51, onSkip)).toMatchObject({ status: 'skipped' });
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('rejects duplicate votes', () => {
    const vc = fakeVc(3);
    castVote('g1', 'u1', 'song1', vc, 0.51, vi.fn());
    const res = castVote('g1', 'u1', 'song1', vc, 0.51, vi.fn());
    expect(res.status).toBe('already_voted');
    expect(res.current).toBe(1);
  });

  it('resets votes when the song changes', () => {
    const vc = fakeVc(3);
    castVote('g1', 'u1', 'song1', vc, 0.51, vi.fn());
    const res = castVote('g1', 'u2', 'song2', vc, 0.51, vi.fn());
    expect(res.current).toBe(1);
  });
});

describe('removeVoter', () => {
  it('triggers a skip when departures lower the bar', () => {
    const onSkip = vi.fn();
    castVote('g1', 'u1', 'song1', fakeVc(4), 0.51, vi.fn());
    castVote('g1', 'u2', 'song1', fakeVc(4), 0.51, vi.fn()); // 2 of required 3
    // u3 leaves → 3 listeners remain → required drops to 2 → skip fires
    expect(removeVoter('g1', 'u3', fakeVc(3), 0.51, onSkip)).toBe(true);
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('clears state when the last voter leaves', () => {
    const vc = fakeVc(3);
    castVote('g1', 'u1', 'song1', vc, 0.51, vi.fn());
    removeVoter('g1', 'u1', vc, 0.51, vi.fn());
    expect(getVoteState('g1')).toBeNull();
  });

  it('is a no-op with no active vote', () => {
    expect(removeVoter('g1', 'u9', fakeVc(2), 0.51, vi.fn())).toBe(false);
  });
});
