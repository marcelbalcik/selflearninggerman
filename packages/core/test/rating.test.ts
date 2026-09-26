import { describe, expect, it } from 'vitest';
import { RATING } from '../src/config';
import { gradeNp } from '../src/grading';
import type { NpTarget } from '../src/grading';
import { caseSkillFor, medianLatencyMs, rateNpAttempt } from '../src/rating';
import type { NpRatingContext, SpeedInfo } from '../src/rating';
import { NACHBAR } from './fixtures';

const target: NpTarget = { noun: NACHBAR, num: 'sg', case: 'dat', det: 'def' };

// "Ich helfe ___ (Nachbar, bestimmt, Sg.)": lemma 123, governed by helfen (456).
const ctx: NpRatingContext = {
  lemmaId: 123,
  num: 'sg',
  case: 'dat',
  gender: 'm',
  primary: 'lemma:123:weak',
  meaning: 'lemma:123:meaning_recv',
  governor: { kind: 'verb', lemmaId: 456 },
  implicated: ['lemma:123:gender', 'lemma:123:weak', 'skill:case.dat.m', 'lemma:456:frame'],
};

const fast: SpeedInfo = { latencyMs: 4_000, medianLatencyMs: 5_000, hintUsed: false };

describe('ratings (spec §5.3)', () => {
  it('Good on every implicated facet when correct and fast', () => {
    const ratings = rateNpAttempt(gradeNp(target, 'dem Nachbarn'), ctx, fast);
    expect(ratings).toEqual(ctx.implicated.map((facet) => ({ facet, rating: 'good' })));
  });

  it('Hard when slow, typo-tolerated or hinted', () => {
    const slow = { ...fast, latencyMs: RATING.SLOW_FACTOR * fast.medianLatencyMs + 1 };
    expect(rateNpAttempt(gradeNp(target, 'dem Nachbarn'), ctx, slow)[0]?.rating).toBe('hard');
    const hinted = { ...fast, hintUsed: true };
    expect(rateNpAttempt(gradeNp(target, 'dem Nachbarn'), ctx, hinted)[0]?.rating).toBe('hard');
    expect(rateNpAttempt(gradeNp(target, 'dem Nahcbarn'), ctx, fast)[0]?.rating).toBe('hard');
  });

  it('case_error: Again on the case skill and the governing verb frame only', () => {
    expect(rateNpAttempt(gradeNp(target, 'den Nachbarn'), ctx, fast)).toEqual([
      { facet: 'skill:case.dat.m', rating: 'again' },
      { facet: 'lemma:456:frame', rating: 'again' },
    ]);
  });

  it('weak_error: Again on the noun weak facet and case.weak_noun', () => {
    expect(rateNpAttempt(gradeNp(target, 'dem Nachbar'), ctx, fast)).toEqual([
      { facet: 'lemma:123:weak', rating: 'again' },
      { facet: 'skill:case.weak_noun', rating: 'again' },
    ]);
  });

  it('ambiguous: nothing until the follow-up is answered', () => {
    expect(rateNpAttempt(gradeNp(target, 'der Nachbarn'), ctx, fast)).toEqual([]);
  });

  it('secondary classes add their facets', () => {
    expect(rateNpAttempt(gradeNp(target, 'den Nachbar'), ctx, fast).map((r) => r.facet)).toEqual([
      'skill:case.dat.m',
      'lemma:456:frame',
      'lemma:123:weak',
      'skill:case.weak_noun',
    ]);
  });

  it('maps target cells to case skills', () => {
    expect(caseSkillFor('sg', 'akk', 'm')).toBe('case.akk.m');
    expect(caseSkillFor('sg', 'akk', 'f')).toBeNull();
    expect(caseSkillFor('pl', 'dat', null)).toBe('case.dat.pl');
    expect(caseSkillFor('sg', 'dat', 'n')).toBe('case.dat.n');
  });
});

describe('latency median', () => {
  it('uses the config default below the minimum sample count', () => {
    expect(medianLatencyMs([1000, 2000], 'kasus_luecke')).toBe(
      RATING.DEFAULT_MEDIAN_LATENCY_MS.kasus_luecke,
    );
  });

  it('uses the median of the rolling window', () => {
    const latencies = Array.from({ length: RATING.LATENCY_WINDOW + 50 }, (_, i) => i);
    // The window keeps the last LATENCY_WINDOW values: 50 … 249.
    expect(medianLatencyMs(latencies, 'kasus_luecke')).toBe(149.5);
  });
});
