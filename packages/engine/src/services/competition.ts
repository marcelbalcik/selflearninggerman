/**
 * Settlement (spec §9): the jobs that run at each day boundary. `tick(now)`
 * processes every completed learning day since the last run, then makes sure
 * today's duel (and, in its window, the month's exam) exists and runs the
 * voucher timers. Every step is keyed by its period and skips work already
 * done, so re-running any of them changes nothing. Settled results change
 * only through re-settlement after a report or an approved dispute (§8.4).
 *
 * The competition starts on the first learning day on which both users have
 * finished placement (the epoch); week 1 is the week containing it.
 */
import {
  BEHALTEN,
  EXAM,
  SESSION,
  addDays,
  coopTier,
  dayKey,
  dayStart,
  decideDuel,
  decideExam,
  decideWeek,
  monthKey,
  recall,
  replayCard,
  weekKey,
  weekStartDay,
  weeklyScore,
} from '@wortduell/core';
import type { DuelMode, Outcome, Rating, StoredCard } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { Ids, boundaryKey } from '../ids';
import type { Chores } from './chores';
import type { RoundKind, RoundRow, RoundTotals, Rounds } from './rounds';
import type { Sessions } from './session';
import type { Settings } from './settings';

interface WeekScore {
  userId: number;
  w: number;
  snapshots: number;
}

export interface Player {
  id: number;
  name: string;
}

function outcomeFields(o: Outcome): { winner: number | null; draw: number } {
  return { winner: o.kind === 'win' ? o.winner : null, draw: o.kind === 'draw' ? 1 : 0 };
}

export class Competition {
  constructor(
    private readonly db: Db,
    private readonly rounds: Rounds,
    private readonly chores: Chores,
    private readonly settings: Settings,
    private readonly sessions: Sessions,
    private readonly ids: Ids = new Ids(),
  ) {}

  // Meta ----------------------------------------------------------------------

  private meta(key: string): string | null {
    return (
      this.db
        .prepare<[string], { value: string }>('SELECT value FROM app_meta WHERE key = ?')
        .get(key)?.value ?? null
    );
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  /** The two players, or null while fewer than two users exist. */
  players(): [Player, Player] | null {
    const users = this.db
      .prepare<[], Player>('SELECT id, name FROM user ORDER BY id LIMIT 2')
      .all();
    return users.length === 2 ? (users as [Player, Player]) : null;
  }

  other(userId: number): Player | null {
    return this.players()?.find((p) => p.id !== userId) ?? null;
  }

  /** The day the later of the two placements finished (null before both). */
  epoch(now: Date): string | null {
    const pair = this.players();
    if (!pair) return null;
    const r = this.db
      .prepare<[], { n: number; last: string | null }>(
        'SELECT COUNT(placement_done_at) AS n, MAX(placement_done_at) AS last FROM user',
      )
      .get();
    if (!r || r.n < 2 || r.last === null || r.last > now.toISOString()) return null;
    return dayKey(new Date(r.last));
  }

  // The job -----------------------------------------------------------------------

  /** Run every settlement that is due. Idempotent. */
  tick(now: Date): void {
    const pair = this.players();
    const epoch = this.epoch(now);
    if (!pair || !epoch) return;
    const today = dayKey(now);
    const processed = this.meta('processed_through');
    for (let d = processed ? addDays(processed, 1) : epoch; d < today; d = addDays(d, 1)) {
      this.db.transaction(() => {
        // Rows created by the settlement get ids from the boundary (src/ids.ts).
        this.ids.scope(boundaryKey(dayStart(addDays(d, 1))), () => this.closeDay(d, pair, epoch));
        this.setMeta('processed_through', d);
      })();
    }
    this.db.transaction(() => {
      this.rounds.ensureDuel(
        today,
        pair.map((p) => p.id),
        this.settings.get('DUEL_MODE', dayStart(today)),
      );
      this.openExam(today, pair, epoch);
      this.chores.timers(now);
    })();
  }

  /** Forget the processed-through marker (tests: prove re-runs change nothing). */
  resetProgress(): void {
    this.db.prepare("DELETE FROM app_meta WHERE key = 'processed_through'").run();
  }

  /** Everything that happens at the end of learning day `d` (at dayStart(d + 1)). */
  closeDay(d: string, pair: [Player, Player], epoch: string): void {
    const boundary = dayStart(addDays(d, 1));
    for (const p of pair) this.snapshot(p.id, d);
    this.settleDuel(d, pair, boundary);
    if (addDays(d, 1) === weekStartDay(addDays(d, 1))) {
      // d is a Sunday: the week Monday..Sunday is complete.
      const monday = weekStartDay(d);
      this.settleWeek(monday, pair, epoch, boundary);
      this.settleCoop(monday, pair, epoch, boundary);
    }
    if (Number(d.slice(8)) === EXAM.WINDOW_DAYS) {
      const month = monthKey(addDays(`${d.slice(0, 7)}-01`, -1));
      this.settleExam(month, pair, boundary);
    }
  }

  // Behalten snapshots ------------------------------------------------------------

  /** B_u at an instant: Σ R(Δt + 7 d; S) over the user's lexical facets (spec §9.2). */
  behalten(userId: number, at: Date): { value: number; reconstructed: boolean } {
    const t = at.toISOString();
    const later = new Set(
      this.db
        .prepare<[number, string], { facet_key: string }>(
          'SELECT DISTINCT facet_key FROM review_log WHERE user_id = ? AND voided = 0 AND ts > ?',
        )
        .all(userId, t)
        .map((r) => r.facet_key),
    );
    let value = 0;
    for (const f of this.db
      .prepare<[number, string], { facet_key: string; fsrs: string; introduced_at: string }>(
        'SELECT facet_key, fsrs, introduced_at FROM facet_card WHERE user_id = ? AND lemma_id IS NOT NULL AND introduced_at <= ?',
      )
      .all(userId, t)) {
      let card = json<StoredCard>(f.fsrs) as StoredCard;
      if (later.has(f.facet_key)) {
        // Rebuild the card as it was at `at` from the review log.
        const reviews = this.db
          .prepare<[number, string, string], { rating: Rating; ts: string }>(
            'SELECT rating, ts FROM review_log WHERE user_id = ? AND facet_key = ? AND voided = 0 AND ts <= ? ORDER BY ts, id',
          )
          .all(userId, f.facet_key, t)
          .map((r) => ({ rating: r.rating, at: new Date(r.ts) }));
        card = replayCard(new Date(f.introduced_at), reviews);
      }
      value += recall(card, at, BEHALTEN.HORIZON_DAYS);
    }
    return { value, reconstructed: later.size > 0 };
  }

  /** The nightly snapshot for the end of day `d`; reconstructed when taken late. */
  snapshot(userId: number, d: string): number {
    const existing = this.db
      .prepare<[number, string], { b_value: number }>(
        'SELECT b_value FROM snapshot WHERE user_id = ? AND day_key = ?',
      )
      .get(userId, d);
    if (existing) return existing.b_value;
    const at = dayStart(addDays(d, 1));
    const b = this.behalten(userId, at);
    this.db
      .prepare(
        'INSERT INTO snapshot (user_id, day_key, b_value, reconstructed, taken_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, d, b.value, b.reconstructed ? 1 : 0, at.toISOString());
    return b.value;
  }

  // Duel ------------------------------------------------------------------------------

  private roundTotals(
    kind: RoundKind,
    round: RoundRow,
    pair: [Player, Player],
  ): [RoundTotals, RoundTotals] {
    return pair.map((p) => this.rounds.totals(kind, round, p.id)) as [RoundTotals, RoundTotals];
  }

  private duelOutcome(round: RoundRow, pair: [Player, Player]) {
    const [a, b] = this.roundTotals('duel', round, pair);
    return { a, b, outcome: decideDuel(a, b, round.mode as DuelMode) };
  }

  settleDuel(d: string, pair: [Player, Player], boundary: Date): void {
    const round = this.rounds.row('duel', d);
    if (!round || round.items.length === 0 || round.settledAt) return;
    for (const p of pair) {
      if (!this.rounds.totals('duel', round, p.id).played)
        this.rounds.markForfeit('duel', round, p.id, boundary);
    }
    const { a, b, outcome } = this.duelOutcome(round, pair);
    for (const t of [a, b]) if (t.played) this.rounds.storeTotals('duel', round, t);
    const f = outcomeFields(outcome);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO period_result (kind, period_key, winner_user_id, draw, details, settled_at)
         VALUES ('day', ?, ?, ?, ?, ?)`,
      )
      .run(
        d,
        f.winner,
        f.draw,
        JSON.stringify({ mode: round.mode, results: [a, b], outcome: outcome.kind }),
        boundary.toISOString(),
      );
    this.db
      .prepare('UPDATE duel SET settled_at = ? WHERE id = ?')
      .run(boundary.toISOString(), round.id);
    if (outcome.kind === 'win')
      this.chores.awardStar(outcome.winner, outcome.loser, `day:${d}`, boundary);
  }

  // Week ------------------------------------------------------------------------------

  /** Snapshots of the week's completed days (before `before`, when given). */
  private weekSnapshots(userId: number, monday: string, epoch: string, before?: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < BEHALTEN.SNAPSHOTS_PER_WEEK; i++) {
      const d = addDays(monday, i);
      if (before && d >= before) break;
      if (d >= epoch) out.push(this.snapshot(userId, d));
    }
    return out;
  }

  weekScores(monday: string, pair: [Player, Player], epoch: string, live?: Date) {
    const lastMonday = addDays(monday, -7);
    return pair.map((p) => {
      const current = this.weekSnapshots(p.id, monday, epoch, live ? dayKey(live) : undefined);
      // Live view: today's B so far counts as the latest snapshot.
      if (live) current.push(this.behalten(p.id, live).value);
      const last =
        addDays(lastMonday, 6) >= epoch ? this.weekSnapshots(p.id, lastMonday, epoch) : null;
      return { userId: p.id, w: weeklyScore(current, last), snapshots: current.length };
    });
  }

  settleWeek(monday: string, pair: [Player, Player], epoch: string, boundary: Date): void {
    const key = weekKey(monday);
    if (
      this.db.prepare("SELECT 1 FROM period_result WHERE kind = 'week' AND period_key = ?").get(key)
    )
      return;
    const [a, b] = this.weekScores(monday, pair, epoch) as [WeekScore, WeekScore];
    const outcome = decideWeek(a, b);
    const f = outcomeFields(outcome);
    this.db
      .prepare(
        `INSERT INTO period_result (kind, period_key, winner_user_id, draw, details, settled_at)
         VALUES ('week', ?, ?, ?, ?, ?)`,
      )
      .run(
        key,
        f.winner,
        f.draw,
        JSON.stringify({ monday, scores: [a, b] }),
        boundary.toISOString(),
      );
    if (outcome.kind === 'win')
      this.chores.create('week', `week:${key}`, outcome.winner, outcome.loser, 'M', boundary);
  }

  // Joint goal ----------------------------------------------------------------------

  /** Active day (spec §8.3): duel played (when there was one) and queue cleared or ≥ 40 reviews. */
  activeDay(userId: number, d: string): boolean {
    const duel = this.rounds.row('duel', d);
    const duelOk =
      !duel || duel.items.length === 0 || this.rounds.totals('duel', duel, userId).finished;
    if (!duelOk) return false;
    if (
      this.db.prepare('SELECT 1 FROM day_activity WHERE user_id = ? AND day_key = ?').get(userId, d)
    )
      return true;
    const n =
      this.db
        .prepare<[number, string, string], { n: number }>(
          "SELECT COUNT(*) AS n FROM attempt WHERE user_id = ? AND voided = 0 AND context IN ('session', 'duel') AND ts >= ? AND ts < ?",
        )
        .get(userId, dayStart(d).toISOString(), dayStart(addDays(d, 1)).toISOString())?.n ?? 0;
    return n >= SESSION.ACTIVE_DAY_MIN_REVIEWS;
  }

  markCleared(userId: number, now: Date): void {
    this.db
      .prepare('INSERT OR IGNORE INTO day_activity (user_id, day_key, cleared_at) VALUES (?, ?, ?)')
      .run(userId, dayKey(now), now.toISOString());
  }

  /** Record that the due queue was empty at some point today (feeds active days). */
  markClearedIfEmpty(userId: number, now: Date): void {
    const d = dayKey(now);
    if (
      this.db.prepare('SELECT 1 FROM day_activity WHERE user_id = ? AND day_key = ?').get(userId, d)
    )
      return;
    const plan = this.sessions.build(userId, now, { reviewsOnly: true });
    if (plan.items.length === 0) {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO day_activity (user_id, day_key, cleared_at) VALUES (?, ?, ?)',
        )
        .run(userId, d, now.toISOString());
    }
  }

  /** Per user: active days and kompositions in the week (up to `until`, exclusive). */
  weekProgress(monday: string, pair: [Player, Player], epoch: string, until?: string) {
    return pair.map((p) => {
      const days: { day: string; active: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        if (d < epoch || (until && d > until)) continue;
        days.push({ day: d, active: this.activeDay(p.id, d) });
      }
      const kompositions =
        this.db
          .prepare<[number, string, string], { n: number }>(
            'SELECT COUNT(*) AS n FROM komposition WHERE user_id = ? AND day_key >= ? AND day_key <= ?',
          )
          .get(p.id, monday, addDays(monday, 6))?.n ?? 0;
      return {
        userId: p.id,
        name: p.name,
        activeDays: days.filter((x) => x.active).length,
        days,
        kompositions,
      };
    });
  }

  settleCoop(monday: string, pair: [Player, Player], epoch: string, boundary: Date): void {
    const key = weekKey(monday);
    if (this.db.prepare('SELECT 1 FROM coop_week WHERE week_key = ?').get(key)) return;
    const progress = this.weekProgress(monday, pair, epoch);
    const tier = coopTier(progress, this.settings.get('COOP_TIERS', boundary));
    let voucherId: number | null = null;
    if (tier !== null) {
      voucherId = Number(
        this.db
          .prepare(
            "INSERT INTO reward_voucher (id, value_eur, source, week_key, status, created_at) VALUES (?, ?, 'week', ?, 'banked', ?)",
          )
          .run(this.ids.next(), tier, key, boundary.toISOString()).lastInsertRowid,
      );
    }
    this.db
      .prepare(
        'INSERT INTO coop_week (week_key, tier_eur, details, voucher_id, settled_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(key, tier, JSON.stringify(progress), voucherId, boundary.toISOString());
  }

  // Exam ------------------------------------------------------------------------------

  private window(month: string): { opens: Date; closes: Date } {
    const first = `${addDays(`${month}-01`, 31).slice(0, 7)}-01`; // first day of the next month
    return { opens: dayStart(first), closes: dayStart(addDays(first, EXAM.WINDOW_DAYS)) };
  }

  private openExam(today: string, pair: [Player, Player], epoch: string): void {
    if (Number(today.slice(8)) > EXAM.WINDOW_DAYS) return;
    const month = monthKey(addDays(`${today.slice(0, 7)}-01`, -1));
    if (month < monthKey(epoch)) return;
    const { opens, closes } = this.window(month);
    this.rounds.ensureExam(
      month,
      pair.map((p) => p.id),
      opens,
      closes,
    );
  }

  settleExam(month: string, pair: [Player, Player], boundary: Date): void {
    const round = this.rounds.row('exam', month);
    if (!round || round.items.length === 0 || round.settledAt) return;
    for (const p of pair) {
      if (!this.rounds.totals('exam', round, p.id).played)
        this.rounds.markForfeit('exam', round, p.id, boundary);
    }
    const [a, b] = this.roundTotals('exam', round, pair);
    for (const t of [a, b]) if (t.played) this.rounds.storeTotals('exam', round, t);
    const outcome = decideExam(a, b);
    const f = outcomeFields(outcome);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO period_result (kind, period_key, winner_user_id, draw, details, settled_at)
         VALUES ('month', ?, ?, ?, ?, ?)`,
      )
      .run(
        month,
        f.winner,
        f.draw,
        JSON.stringify({ results: [a, b], outcome: outcome.kind }),
        boundary.toISOString(),
      );
    this.db
      .prepare('UPDATE exam SET settled_at = ? WHERE id = ?')
      .run(boundary.toISOString(), round.id);
    if (outcome.kind === 'win')
      this.chores.create('month', `month:${month}`, outcome.winner, outcome.loser, 'L', boundary);
  }

  // Re-settlement (spec §8.4) ------------------------------------------------------

  /** Recompute the duels and exams these attempts belong to. */
  resettleAttempts(attemptIds: number[], now: Date): void {
    const pair = this.players();
    if (!pair) return;
    for (const r of this.rounds.roundsOfAttempts(attemptIds)) {
      const round = this.rounds.rowById(r.kind, r.id);
      if (!round) continue;
      this.db.transaction(() => this.resettle(r.kind, round, pair, now))();
    }
  }

  resettleSentence(sentenceId: number, now: Date): void {
    const ids = this.db
      .prepare<[number], { id: number }>(
        'SELECT id FROM attempt WHERE sentence_id = ? AND (duel_id IS NOT NULL OR exam_id IS NOT NULL)',
      )
      .all(sentenceId)
      .map((r) => r.id);
    this.resettleAttempts(ids, now);
  }

  private resettle(kind: RoundKind, round: RoundRow, pair: [Player, Player], now: Date): void {
    const totals = this.roundTotals(kind, round, pair);
    for (const t of totals) if (t.played) this.rounds.storeTotals(kind, round, t);
    if (!round.settledAt) return;
    const periodKind = kind === 'duel' ? 'day' : 'month';
    const prev = this.db
      .prepare<[string, string], { winner_user_id: number | null; details: string }>(
        'SELECT winner_user_id, details FROM period_result WHERE kind = ? AND period_key = ?',
      )
      .get(periodKind, round.key);
    if (!prev) return;
    const [a, b] = totals;
    const outcome = kind === 'duel' ? decideDuel(a, b, round.mode as DuelMode) : decideExam(a, b);
    const f = outcomeFields(outcome);
    const details = {
      ...(json<Record<string, unknown>>(prev.details) ?? {}),
      results: [a, b],
      outcome: outcome.kind,
    };
    this.db
      .prepare(
        'UPDATE period_result SET winner_user_id = ?, draw = ?, details = ?, resettled_at = ? WHERE kind = ? AND period_key = ?',
      )
      .run(f.winner, f.draw, JSON.stringify(details), now.toISOString(), periodKind, round.key);
    if (prev.winner_user_id === f.winner) return;
    const loserOf = (w: number) => (pair[0].id === w ? pair[1].id : pair[0].id);
    if (kind === 'duel') {
      if (prev.winner_user_id !== null)
        this.chores.revokeStar(
          prev.winner_user_id,
          loserOf(prev.winner_user_id),
          `day:${round.key}`,
          now,
        );
      if (f.winner !== null)
        this.chores.awardStar(f.winner, loserOf(f.winner), `day:${round.key}`, now);
    } else {
      const old = this.db
        .prepare<[string], { id: number }>(
          "SELECT id FROM voucher WHERE from_period = ? AND status != 'void'",
        )
        .get(`month:${round.key}`);
      // A chore already under way stays; otherwise the voucher follows the new result.
      if (old && !this.chores.voidIfOpen(old.id, now)) return;
      if (f.winner !== null)
        this.chores.create('month', `month:${round.key}`, f.winner, loserOf(f.winner), 'L', now);
    }
  }

  // Views ---------------------------------------------------------------------------

  /** Wettbewerb: recent results, live week standing, stars and the ledger. */
  overview(now: Date) {
    const pair = this.players();
    const epoch = this.epoch(now);
    const results = (kind: string, limit: number) =>
      this.db
        .prepare<
          [string, number],
          {
            period_key: string;
            winner_user_id: number | null;
            draw: number;
            details: string;
            resettled_at: string | null;
          }
        >(
          'SELECT period_key, winner_user_id, draw, details, resettled_at FROM period_result WHERE kind = ? ORDER BY period_key DESC LIMIT ?',
        )
        .all(kind, limit)
        .map((r) => ({
          period: r.period_key,
          winnerId: r.winner_user_id,
          draw: r.draw === 1,
          details: json(r.details),
          resettled: r.resettled_at !== null,
        }));
    const monday = weekStartDay(dayKey(now));
    return {
      players: pair,
      epoch,
      days: results('day', 14),
      weeks: results('week', 8),
      months: results('month', 6),
      liveWeek:
        pair && epoch
          ? { week: weekKey(monday), scores: this.weekScores(monday, pair, epoch, now) }
          : null,
      stars: pair?.map((p) => ({ userId: p.id, ...this.chores.stars(p.id) })) ?? [],
      starsPerVoucher: this.settings.get('STARS_PER_S_VOUCHER', now),
      duelMode: this.settings.get('DUEL_MODE', now),
      ledger: this.chores.ledger(),
    };
  }

  /** Live joint-goal progress for the current week. */
  coopLive(now: Date) {
    const pair = this.players();
    const epoch = this.epoch(now);
    if (!pair || !epoch) return null;
    const today = dayKey(now);
    const monday = weekStartDay(today);
    const progress = this.weekProgress(monday, pair, epoch, today);
    const tiers = this.settings.get('COOP_TIERS', now);
    return {
      week: weekKey(monday),
      progress,
      secured: coopTier(progress, tiers),
      tiers,
      daysLeft:
        7 - (Math.round((dayStart(today).getTime() - dayStart(monday).getTime()) / 86_400_000) + 1),
    };
  }
}
