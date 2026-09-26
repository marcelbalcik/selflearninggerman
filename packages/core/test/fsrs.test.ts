import { default_w, forgetting_curve } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { isDue, newCard, recall, replayCard, reviewCard } from '../src/fsrs';

const t0 = new Date('2026-09-27T08:00:00Z');
const day = 86_400_000;

describe('FSRS wrapper (spec §5.3)', () => {
  it('schedules further out after Good than after Again', () => {
    const good = reviewCard(newCard(t0), 'good', t0);
    const again = reviewCard(newCard(t0), 'again', t0);
    expect(new Date(good.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
    expect(good.reps).toBe(1);
  });

  it('a new card is due immediately and has no recall', () => {
    const c = newCard(t0);
    expect(isDue(c, t0)).toBe(true);
    expect(recall(c, t0)).toBe(0);
  });

  it('replay is deterministic, so voiding a middle review can rebuild the card', () => {
    const reviews = [
      { rating: 'good' as const, at: t0 },
      { rating: 'hard' as const, at: new Date(t0.getTime() + 2 * day) },
      { rating: 'good' as const, at: new Date(t0.getTime() + 6 * day) },
    ];
    expect(replayCard(t0, reviews)).toEqual(replayCard(t0, reviews));
    const withoutMiddle = replayCard(t0, [reviews[0]!, reviews[2]!]);
    expect(withoutMiddle).not.toEqual(replayCard(t0, reviews));
  });

  it('recall uses the library forgetting curve with default parameters', () => {
    let c = reviewCard(newCard(t0), 'good', t0);
    c = reviewCard(c, 'good', new Date(t0.getTime() + 3 * day));
    const at = new Date(t0.getTime() + 10 * day);
    const expected = forgetting_curve(default_w, 7 + 7, c.stability);
    expect(recall(c, at, 7)).toBeCloseTo(expected, 6);
    // Fixture regenerated from the library (spec §9.2): S = 10 d, t = 7 d.
    expect(forgetting_curve(default_w, 7, 10)).toBeGreaterThan(0.9);
  });
});
