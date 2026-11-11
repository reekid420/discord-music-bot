import { describe, it, expect } from 'vitest';
import { shouldFallbackToSoundcloud } from '../src/bot/utils/searchFallback.js';

const noResults = (msg = 'No results found for "big dick randy" (Extractor: com.djmiyabi.ytdlp)') =>
  Object.assign(new Error(msg), { name: 'NoResultError' });

describe('shouldFallbackToSoundcloud', () => {
  it('retries plain-text searches that came back empty', () => {
    expect(shouldFallbackToSoundcloud('big dick randy', noResults())).toBe(true);
  });

  it('matches NoResultError regardless of message wording', () => {
    expect(shouldFallbackToSoundcloud('goodkid', noResults('No results'))).toBe(true);
  });

  it('never retries URL queries (wrong source for a specific link)', () => {
    expect(shouldFallbackToSoundcloud('https://youtu.be/i05IlyyS7l4', noResults())).toBe(false);
    expect(shouldFallbackToSoundcloud('https://www.tiktok.com/@u/video/123', noResults())).toBe(false);
  });

  it('ignores non-empty-search failures (rate limits, cancels, etc.)', () => {
    expect(shouldFallbackToSoundcloud('goodkid', new Error('Cancelled'))).toBe(false);
    expect(shouldFallbackToSoundcloud('goodkid', new Error('Sign in to confirm your age'))).toBe(false);
    expect(shouldFallbackToSoundcloud('goodkid', null)).toBe(false);
  });
});
