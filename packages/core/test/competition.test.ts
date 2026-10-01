import { default_w, forgetting_curve } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  coopTier,
  decideDuel,
  decideExam,
  decideWeek,
  defaultBand,
  drawReward,
  eligibleRewards,
  weeklyScore,
} from '../src/competition';
import type { DuelPlayerResult, RewardCandidate } from '../src/competition';
import { recall, replayCard } from '../src/fsrs';

const p = (
  userId: number,
  correct: number,
  totalMs = 60_000,
  expectedSum = 0,
): DuelPlayerResult => ({
  userId,
  played: true,
  correct,
  totalMs,
  expectedSum,
});

describe('duel (spec §9.1)', () => {
  it('raw: more correct wins, then lower time, exact tie draws', () => {
    expect(decideDuel(p(1, 8), p(2, 7), 'raw')).toEqual({ kind: 'win', winner: 1, loser: 2 });
    expect(decideDuel(p(1, 8, 70_000), p(2, 8, 60_000), 'raw')).toEqual({
      kind: 'win',
      winner: 2,
      loser: 1,
    });
    expect(decideDuel(p(1, 8), p(2, 8), 'raw')).toEqual({ kind: 'draw' });
  });

  it('forfeits: the player who played wins; nobody played is no result', () => {
    const absent = { ...p(2, 0), played: false };
    expect(decideDuel(p(1, 0), absent, 'raw')).toEqual({ kind: 'win', winner: 1, loser: 2 });
    expect(decideDuel({ ...p(1, 0), played: false }, absent, 'raw')).toEqual({ kind: 'none' });
  });

  it('vs_expected: beating one’s own expectation wins; close scores draw', () => {
    // A: 9 correct, expected 8.2 (+0.8). B: 7 correct, expected 5.9 (+1.1). B wins.
    expect(decideDuel(p(1, 9, 1, 8.2), p(2, 7, 1, 5.9), 'vs_expected')).toEqual({
      kind: 'win',
      winner: 2,
      loser: 1,
    });
    // The spec example (+0.8 vs +0.9) is within the 0.25 draw margin.
    expect(decideDuel(p(1, 9, 1, 8.2), p(2, 7, 1, 6.1), 'vs_expected')).toEqual({ kind: 'draw' });
  });
});

describe('exam (spec §9.3)', () => {
  it('at most one item apart is a draw', () => {
    const r = (userId: number, correct: number) => ({ userId, played: true, correct, total: 40 });
    expect(decideExam(r(1, 30), r(2, 29))).toEqual({ kind: 'draw' });
    expect(decideExam(r(1, 30), r(2, 28))).toEqual({ kind: 'win', winner: 1, loser: 2 });
    expect(decideExam(r(1, 0), { ...r(2, 0), played: false })).toMatchObject({ winner: 1 });
  });
});

describe('Behalten-Score (spec §9.2)', () => {
  it('uses the library’s default forgetting curve', () => {
    const t0 = new Date('2027-01-04T08:00:00Z');
    const card = replayCard(t0, [{ rating: 'good', at: t0 }]);
    const r = recall(card, t0, 7);
    expect(r).toBeCloseTo(forgetting_curve(default_w, 7, card.stability), 10);
    // Fixture regenerated from the library, not the FSRS-5 table in the spec.
    const at = (s: number) => forgetting_curve(default_w, 7, s);
    expect(at(2)).toBeLessThan(at(10));
    expect(at(10)).toBeLessThan(at(30));
    expect(at(30)).toBeLessThan(1);
  });

  it('weekly score is the change of the mean; week 1 has baseline 0', () => {
    expect(weeklyScore([10, 12, 14], null)).toBe(12);
    expect(weeklyScore([13, 13], [12, 12])).toBe(1);
    expect(decideWeek({ userId: 1, w: 1.2 }, { userId: 2, w: 0.8 })).toEqual({ kind: 'draw' });
    expect(decideWeek({ userId: 1, w: 1.6 }, { userId: 2, w: 0.8 })).toMatchObject({ winner: 1 });
  });
});

describe('joint goal (spec §9.5)', () => {
  it('uses the minimum over both users', () => {
    expect(
      coopTier([
        { activeDays: 6, kompositions: 3 },
        { activeDays: 6, kompositions: 3 },
      ]),
    ).toBe(10);
    expect(
      coopTier([
        { activeDays: 7, kompositions: 5 },
        { activeDays: 6, kompositions: 2 },
      ]),
    ).toBe(5);
    expect(
      coopTier([
        { activeDays: 7, kompositions: 5 },
        { activeDays: 4, kompositions: 9 },
      ]),
    ).toBe(3);
    expect(
      coopTier([
        { activeDays: 7, kompositions: 5 },
        { activeDays: 3, kompositions: 9 },
      ]),
    ).toBeNull();
  });

  it('bands and change follow the spec table', () => {
    const cases: [number[], number, number][] = [
      [[3], 3, 0],
      [[5, 5], 10, 0],
      [[5, 5, 3], 10, 3],
      [[10, 5], 15, 0],
      [[10, 10, 5, 5], 30, 0],
    ];
    for (const [vouchers, band, change] of cases) {
      const total = vouchers.reduce((s, v) => s + v, 0);
      expect(defaultBand(total)).toBe(band);
      expect(total - band).toBe(change);
    }
    expect(defaultBand(2)).toBeNull();
  });
});

describe('reward draw', () => {
  const now = new Date('2027-01-10T10:00:00Z');
  const r = (
    id: number,
    budgetEur: number,
    extra: Partial<RewardCandidate> = {},
  ): RewardCandidate => ({
    id,
    budgetEur,
    season: 'any',
    needsBabysitter: false,
    lastDrawnAt: null,
    ...extra,
  });

  it('excludes out-of-season, babysitter and recently drawn rewards', () => {
    const pool = [
      r(1, 10, { season: 'outdoor' }),
      r(2, 10, { needsBabysitter: true }),
      r(3, 10, { lastDrawnAt: '2026-12-20T10:00:00Z' }),
      r(4, 10, { lastDrawnAt: '2026-10-01T10:00:00Z' }),
    ];
    const ids = eligibleRewards(pool, 10, { now, month: 1, babysitterAvailable: false }).map(
      (x) => x.id,
    );
    expect(ids).toEqual([4]);
  });

  it('is reproducible from the seed and falls back to a lower band', () => {
    const pool = [r(1, 10), r(2, 10), r(3, 10), r(4, 5)];
    const o = { now, month: 1, babysitterAvailable: true };
    const a = drawReward(pool, 13, 10, 42, o);
    expect(drawReward(pool, 13, 10, 42, o)).toEqual(a);
    expect(a).toMatchObject({ band: 10, change: 3 });
    // No 15 € reward: the draw falls back to 10 € and the change grows to 5 €.
    expect(drawReward(pool, 15, 15, 7, o)).toMatchObject({ band: 10, change: 5 });
    expect(drawReward([r(9, 20)], 15, 15, 7, o)).toBeNull();
  });
});
