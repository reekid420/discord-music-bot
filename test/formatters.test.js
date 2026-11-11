import { describe, it, expect } from 'vitest';
import { formatDuration, progressBar, truncate } from '../src/bot/utils/formatters.js';

describe('formatDuration', () => {
  it('formats minutes/seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats hours', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('handles falsy input', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('progressBar', () => {
  it('places the knob proportionally', () => {
    const bar = progressBar(50, 100, 10);
    expect(bar).toContain('🔘');
    expect(Array.from(bar).length).toBe(10); // code points (knob emoji is astral)
  });

  it('returns an empty bar when total is zero', () => {
    expect(progressBar(10, 0, 5)).toBe('▬▬▬▬▬');
  });
});

describe('truncate', () => {
  it('shortens long text with ellipsis', () => {
    expect(truncate('abcdefghij', 7)).toBe('abcd...');
  });

  it('leaves short text alone', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('handles empty input', () => {
    expect(truncate('')).toBe('');
  });
});
