/**
 * Pure competition rules (spec §9): duel and exam decisions, the weekly
 * Behalten-Score, joint-goal tiers, reward bands with change, and the seeded
 * reward draw. The server supplies the data and stores the results.
 */
import { BEHALTEN, COOP, DUEL, EXAM } from './config';

export type Outcome =
  { kind: 'win'; winner: number; loser: number } | { kind: 'draw' } | { kind: 'none' };

export interface DuelPlayerResult {
  userId: number;
  /** false: never started (forfeit). */
  played: boolean;
  correct: number;
  /** Σ predicted recall of the counted items (vs_expected). */
  expectedSum: number;
  totalMs: number;
}

export type DuelMode = 'raw' | 'vs_expected';

export function duelScore(r: DuelPlayerResult, mode: DuelMode): number {
  return mode === 'raw' ? r.correct : r.correct - r.expectedSum;
}

/** Spec §9.1: forfeits first, then the score, then (raw) the lower total time. */
export function decideDuel(a: DuelPlayerResult, b: DuelPlayerResult, mode: DuelMode): Outcome {
  const forfeit = decideForfeit(a, b);
  if (forfeit) return forfeit;
  const sa = duelScore(a, mode);
  const sb = duelScore(b, mode);
  if (mode === 'vs_expected') {
    if (Math.abs(sa - sb) < DUEL.VS_EXPECTED_DRAW_MARGIN) return { kind: 'draw' };
    return sa > sb ? win(a, b) : win(b, a);
  }
  if (sa !== sb) return sa > sb ? win(a, b) : win(b, a);
  if (a.totalMs !== b.totalMs) return a.totalMs < b.totalMs ? win(a, b) : win(b, a);
  return { kind: 'draw' };
}

function win(w: { userId: number }, l: { userId: number }): Outcome {
  return { kind: 'win', winner: w.userId, loser: l.userId };
}

function decideForfeit(
  a: { userId: number; played: boolean },
  b: { userId: number; played: boolean },
): Outcome | null {
  if (!a.played && !b.played) return { kind: 'none' };
  if (!a.played) return win(b, a);
  if (!b.played) return win(a, b);
  return null;
}

export interface ExamPlayerResult {
  userId: number;
  played: boolean;
  correct: number;
  total: number;
}

/** Spec §9.3: higher percentage wins; at most DRAW_MAX_ITEM_DIFF items apart is a draw. */
export function decideExam(a: ExamPlayerResult, b: ExamPlayerResult): Outcome {
  const forfeit = decideForfeit(a, b);
  if (forfeit) return forfeit;
  // Both answer the same items, so the item difference decides the draw.
  if (Math.abs(a.correct - b.correct) <= EXAM.DRAW_MAX_ITEM_DIFF) return { kind: 'draw' };
  const pa = a.total > 0 ? a.correct / a.total : 0;
  const pb = b.total > 0 ? b.correct / b.total : 0;
  return pa > pb ? win(a, b) : win(b, a);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** W_u = mean(this week's snapshots) − mean(last week's); week 1 has baseline 0 (spec §9.2). */
export function weeklyScore(thisWeek: number[], lastWeek: number[] | null): number {
  return mean(thisWeek) - (lastWeek ? mean(lastWeek) : 0);
}

export function decideWeek(
  a: { userId: number; w: number },
  b: { userId: number; w: number },
): Outcome {
  if (Math.abs(a.w - b.w) < BEHALTEN.DRAW_MARGIN) return { kind: 'draw' };
  return a.w > b.w ? win(a, b) : win(b, a);
}

export interface CoopTier {
  valueEur: number;
  minActiveDays: number;
  minKomposition: number;
}

/** The weekly voucher value: the best tier both users reach (spec §9.5). */
export function coopTier(
  users: { activeDays: number; kompositions: number }[],
  tiers: readonly CoopTier[] = COOP.TIERS,
  maxEur: number = COOP.MAX_WEEKLY_VOUCHER_EUR,
): number | null {
  const sorted = [...tiers].sort((x, y) => y.valueEur - x.valueEur);
  for (const t of sorted) {
    if (users.every((u) => u.activeDays >= t.minActiveDays && u.kompositions >= t.minKomposition)) {
      return Math.min(t.valueEur, maxEur);
    }
  }
  return null;
}

/** The default target band: the largest band ≤ the total (spec §9.5). */
export function defaultBand(
  total: number,
  bands: readonly number[] = COOP.REWARD_BANDS,
): number | null {
  const fit = bands.filter((b) => b <= total);
  return fit.length ? Math.max(...fit) : null;
}

/** Deterministic RNG (mulberry32) for reproducible draws. */
export function seededRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RewardCandidate {
  id: number;
  budgetEur: number;
  season: 'any' | 'outdoor';
  needsBabysitter: boolean;
  lastDrawnAt: string | null;
}

export interface DrawOptions {
  now: Date;
  /** Month 1–12 in Berlin at `now`. */
  month: number;
  babysitterAvailable: boolean;
  excludeIds?: number[];
  cooldownWeeks?: number;
}

/** Rewards that may be drawn at a band (spec §9.5 exclusions). */
export function eligibleRewards(
  rewards: RewardCandidate[],
  band: number,
  o: DrawOptions,
): RewardCandidate[] {
  const cooldownMs = (o.cooldownWeeks ?? COOP.REWARD_COOLDOWN_WEEKS) * 7 * 86_400_000;
  const outdoorOk = o.month >= COOP.OUTDOOR_FIRST_MONTH && o.month <= COOP.OUTDOOR_LAST_MONTH;
  return rewards.filter(
    (r) =>
      r.budgetEur === band &&
      !(o.excludeIds ?? []).includes(r.id) &&
      (r.season === 'any' || outdoorOk) &&
      (!r.needsBabysitter || o.babysitterAvailable) &&
      (r.lastDrawnAt === null || o.now.getTime() - new Date(r.lastDrawnAt).getTime() >= cooldownMs),
  );
}

export interface Draw {
  rewardId: number;
  band: number;
  change: number;
}

/**
 * Draw one reward at the chosen band, falling back to the next lower band with
 * an eligible reward; the change grows accordingly (spec §9.5). Null when no
 * band at or below the chosen one has a reward.
 */
export function drawReward(
  rewards: RewardCandidate[],
  total: number,
  chosenBand: number,
  seed: number,
  o: DrawOptions,
  bands: readonly number[] = COOP.REWARD_BANDS,
): Draw | null {
  const lower = [...bands].filter((b) => b <= chosenBand && b <= total).sort((x, y) => y - x);
  const rand = seededRng(seed);
  for (const band of lower) {
    const pool = eligibleRewards(rewards, band, o).sort((x, y) => x.id - y.id);
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(rand() * pool.length)] as RewardCandidate;
    return { rewardId: pick.id, band, change: total - band };
  }
  return null;
}
