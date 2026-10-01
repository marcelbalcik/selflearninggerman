/**
 * FSRS wrapper around ts-fsrs (spec §5.3). Cards are stored as JSON with ISO
 * dates. Scheduling uses the configured parameters; competition scoring
 * always uses the library's default parameter set (spec §9.2).
 */
import {
  Rating as FsrsRating,
  createEmptyCard,
  default_w,
  forgetting_curve,
  fsrs,
  generatorParameters,
} from 'ts-fsrs';
import type { Card, FSRS as Scheduler } from 'ts-fsrs';
import { FSRS } from './config';
import type { Rating } from './types';

export interface StoredCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

const RATING: Record<Rating, FsrsRating.Again | FsrsRating.Hard | FsrsRating.Good> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
};

let cached: Scheduler | null = null;

/** The scheduler for due dates (configured retention, short-term steps, fuzz). */
export function scheduler(): Scheduler {
  cached ??= fsrs(
    generatorParameters({
      request_retention: FSRS.REQUEST_RETENTION,
      enable_short_term: FSRS.ENABLE_SHORT_TERM,
      enable_fuzz: FSRS.ENABLE_FUZZ,
    }),
  );
  return cached;
}

function toCard(c: StoredCard): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review === null ? undefined : new Date(c.last_review),
  };
}

function fromCard(c: Card): StoredCard {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function newCard(now: Date): StoredCard {
  return fromCard(createEmptyCard(now));
}

/** Apply one review. */
export function reviewCard(card: StoredCard, rating: Rating, now: Date): StoredCard {
  return fromCard(scheduler().next(toCard(card), now, RATING[rating]).card);
}

/**
 * Rebuild a card from its reviews, oldest first. ts-fsrs seeds its fuzz from
 * the card state and review time, so replay is deterministic; voiding a
 * review that is not the latest one replays the rest (docs/DECISIONS.md).
 */
export function replayCard(
  createdAt: Date,
  reviews: readonly { rating: Rating; at: Date }[],
): StoredCard {
  let card = newCard(createdAt);
  for (const r of reviews) card = reviewCard(card, r.rating, r.at);
  return card;
}

export function isDue(card: StoredCard, now: Date): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/** A card has a memory model once it has been reviewed at least once. */
export function isReviewed(card: StoredCard): boolean {
  return card.reps > 0 && card.last_review !== null && card.stability > 0;
}

/**
 * Predicted recall with the library's default parameters (duel item choice,
 * `vs_expected` scoring, Behalten-Score): R(elapsed + horizon; S). 0 for a
 * card never reviewed.
 */
export function recall(card: StoredCard, now: Date, horizonDays = 0): number {
  if (!isReviewed(card) || card.last_review === null) return 0;
  const elapsed = (now.getTime() - new Date(card.last_review).getTime()) / 86_400_000;
  return forgetting_curve(default_w, Math.max(0, elapsed) + horizonDays, card.stability);
}
