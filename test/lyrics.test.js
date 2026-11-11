import { describe, it, expect } from 'vitest';
import { pickBestMatch } from '../src/bot/utils/lyrics.js';

// Fixture mirrors a real lrclib.net search for "DigBar- Big Dick Randy"
// (Aug 2026): the sequel outranks the original in popularity order.
const RESULTS = [
  { trackName: 'BIG DICK RANDY 2', artistName: 'DigBar', plainLyrics: 'a', syncedLyrics: 'x' },
  { trackName: 'BIG DICK RANDY: HOMECOMING', artistName: 'DigBar', plainLyrics: 'b', syncedLyrics: null },
  { trackName: 'BIG DICK RANDY 2', artistName: 'DigBar', plainLyrics: 'c', syncedLyrics: 'y' },
  { trackName: 'BIG DICK RANDY CHRISTMAS', artistName: 'DigBar', plainLyrics: 'd', syncedLyrics: 'z' },
  { trackName: 'BIG DICK RANDY RETURNS', artistName: 'DigBar', plainLyrics: 'e', syncedLyrics: null },
  { trackName: 'BIG DICK RANDY', artistName: 'DigBar', plainLyrics: 'f', syncedLyrics: null },
  { trackName: 'BIG DICK RANDY', artistName: 'Some Cover Band', plainLyrics: 'g', syncedLyrics: null },
];

describe('pickBestMatch', () => {
  it('prefers the exact title over more popular sequels/variants', () => {
    const best = pickBestMatch(RESULTS, 'Big Dick Randy', 'DigBar');
    expect(best.trackName).toBe('BIG DICK RANDY');
    expect(best.artistName).toBe('DigBar');
  });

  it('falls back to first result when nothing resembles the title', () => {
    const results = [
      { trackName: 'Unrelated Song', artistName: 'A', plainLyrics: 'x' },
      { trackName: 'Another One', artistName: 'B', plainLyrics: 'y' },
    ];
    expect(pickBestMatch(results, 'Big Dick Randy', 'DigBar')).toBe(results[0]);
  });

  it('prefers entries that actually have lyrics', () => {
    const results = [
      { trackName: 'BIG DICK RANDY', artistName: 'DigBar', plainLyrics: null, syncedLyrics: null },
      { trackName: 'BIG DICK RANDY', artistName: 'DigBar', plainLyrics: 'real lyrics', syncedLyrics: null },
    ];
    expect(pickBestMatch(results, 'Big Dick Randy', 'DigBar').plainLyrics).toBe('real lyrics');
  });

  it('matches titles ignoring case and punctuation', () => {
    const results = [
      { trackName: 'PARTY ROCK ANTHEM!', artistName: 'LMFAO', plainLyrics: null, syncedLyrics: null },
      { trackName: 'Party Rock Anthem', artistName: 'LMFAO', plainLyrics: 'y', syncedLyrics: null },
    ];
    // both normalize to the same title; the one with lyrics wins the tie
    expect(pickBestMatch(results, 'party   rock anthem', 'lmfao')).toBe(results[1]);
  });

  it('returns null for empty/missing results', () => {
    expect(pickBestMatch([], 'anything')).toBeNull();
    expect(pickBestMatch(undefined, 'anything')).toBeNull();
  });
});
