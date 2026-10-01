import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayStart, monthKey, weekKey, weekStartDay } from '../src/time';

describe('learning day boundary: 03:00 Europe/Berlin (spec §8.1)', () => {
  it('late evening and night belong to the same day', () => {
    // 2026-09-26 23:30 CEST = 21:30Z; 02:59 CEST next morning = 00:59Z.
    expect(dayKey(new Date('2026-09-26T21:30:00Z'))).toBe('2026-09-26');
    expect(dayKey(new Date('2026-09-27T00:59:00Z'))).toBe('2026-09-26');
    expect(dayKey(new Date('2026-09-27T01:00:00Z'))).toBe('2026-09-27');
  });

  it('day start in summer and winter time', () => {
    expect(dayStart('2026-09-27').toISOString()).toBe('2026-09-27T01:00:00.000Z');
    expect(dayStart('2026-12-01').toISOString()).toBe('2026-12-01T02:00:00.000Z');
  });

  it('handles the spring DST switch (last Sunday of March)', () => {
    // 2026-03-29: 02:00 CET jumps to 03:00 CEST at 01:00Z.
    expect(dayStart('2026-03-28').toISOString()).toBe('2026-03-28T02:00:00.000Z');
    expect(dayStart('2026-03-29').toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(dayKey(new Date('2026-03-29T00:59:00Z'))).toBe('2026-03-28');
    expect(dayKey(new Date('2026-03-29T01:00:00Z'))).toBe('2026-03-29');
  });

  it('handles the autumn DST switch (last Sunday of October)', () => {
    // 2026-10-25: 03:00 CEST falls back to 02:00 CET at 01:00Z; 03:00 CET is 02:00Z.
    expect(dayStart('2026-10-25').toISOString()).toBe('2026-10-25T02:00:00.000Z');
    expect(dayKey(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-24');
    expect(dayKey(new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-25');
    // The 2026-10-24 learning day lasts 25 hours.
    const len = dayStart('2026-10-25').getTime() - dayStart('2026-10-24').getTime();
    expect(len / 3_600_000).toBe(25);
  });

  it('weeks start on Monday, months on the 1st', () => {
    expect(weekStartDay('2026-09-27')).toBe('2026-09-21');
    expect(weekKey('2026-09-27')).toBe('2026-W39');
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(monthKey('2026-09-30')).toBe('2026-09');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});
