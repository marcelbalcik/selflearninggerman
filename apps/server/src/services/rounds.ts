/**
 * Duel and Monatsprüfung rounds (spec §9.1, §9.3): identical items for both
 * users, played asynchronously, no feedback until the end, the other user's
 * results hidden until both finished or the round closed. Round attempts are
 * normal FSRS reviews (context 'duel' / 'exam').
 */
import { DUEL, EXAM, addDays, dayStart, lemmaFacetKey, recall, seededRng } from '@wortduell/core';
import type { ExerciseType, LexicalFacet, StoredCard } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import type { Repo } from '../repo';
import { AttemptError } from './attempts';
import type { AttemptInput, Attempts, Feedback } from './attempts';
import type { Prompt, Sessions } from './session';

export const DUEL_TYPES: ExerciseType[] = [
  'kasus_luecke',
  'wer_tut_was',
  'en_de_chunk',
  'fehlersuche',
];

export type RoundKind = 'duel' | 'exam';

export interface RoundItem {
  sentenceId: number;
  lemmaId: number;
  facetKey: string;
  /** Predicted recall of the primary facet per user at generation time. */
  r: Record<string, number>;
}

export interface RoundRow {
  id: number;
  key: string; // day key (duel) or month key (exam)
  items: RoundItem[];
  mode: string;
  closesAt: string;
  settledAt: string | null;
}

export interface RoundTotals {
  userId: number;
  played: boolean;
  finished: boolean;
  correct: number;
  total: number;
  expectedSum: number;
  totalMs: number;
}

/** FNV-1a: a stable seed from a period key. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

interface Candidate {
  id: number;
  lemma_id: number;
  target_facet: LexicalFacet;
}

export class Rounds {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly attempts: Attempts,
    private readonly sessions: Sessions,
  ) {}

  row(kind: RoundKind, key: string): RoundRow | null {
    if (kind === 'duel') {
      const r = this.db
        .prepare<
          [string],
          { id: number; day_key: string; items: string; mode: string; settled_at: string | null }
        >('SELECT id, day_key, items, mode, settled_at FROM duel WHERE day_key = ?')
        .get(key);
      return r
        ? {
            id: r.id,
            key: r.day_key,
            items: json<RoundItem[]>(r.items) ?? [],
            mode: r.mode,
            closesAt: dayStart(addDays(r.day_key, 1)).toISOString(),
            settledAt: r.settled_at,
          }
        : null;
    }
    const r = this.db
      .prepare<
        [string],
        {
          id: number;
          month_key: string;
          items: string;
          closes_at: string;
          settled_at: string | null;
        }
      >('SELECT id, month_key, items, closes_at, settled_at FROM exam WHERE month_key = ?')
      .get(key);
    return r
      ? {
          id: r.id,
          key: r.month_key,
          items: json<RoundItem[]>(r.items) ?? [],
          mode: 'exam',
          closesAt: r.closes_at,
          settledAt: r.settled_at,
        }
      : null;
  }

  rowById(kind: RoundKind, id: number): RoundRow | null {
    const key = this.db
      .prepare<[number], { k: string }>(
        kind === 'duel'
          ? 'SELECT day_key AS k FROM duel WHERE id = ?'
          : 'SELECT month_key AS k FROM exam WHERE id = ?',
      )
      .get(id)?.k;
    return key ? this.row(kind, key) : null;
  }

  /** Lemmas both users introduced (core track). */
  private sharedCandidates(userIds: number[], excludeLemmas: Set<number>): Candidate[] {
    const [a, b] = userIds as [number, number];
    const types = DUEL_TYPES.map((t) => `'${t}'`).join(', ');
    return this.db
      .prepare<[number, number], Candidate>(
        `SELECT s.id, s.lemma_id, s.target_facet FROM sentence s JOIN lemma l ON l.id = s.lemma_id
         WHERE s.status = 'ok' AND s.retired = 0 AND l.retired = 0 AND l.track = 'core'
           AND json_extract(s.exercise_types, '$[0]') IN (${types})
           AND s.lemma_id IN (SELECT lemma_id FROM lemma_intro WHERE user_id = ?
                              INTERSECT SELECT lemma_id FROM lemma_intro WHERE user_id = ?)
         ORDER BY s.id`,
      )
      .all(a, b)
      .filter((c) => !excludeLemmas.has(c.lemma_id));
  }

  private card(userId: number, key: string): { card: StoredCard; introducedAt: string } | null {
    const r = this.db
      .prepare<[number, string], { fsrs: string; unlocked: number; introduced_at: string }>(
        'SELECT fsrs, unlocked, introduced_at FROM facet_card WHERE user_id = ? AND facet_key = ?',
      )
      .get(userId, key);
    if (!r || r.unlocked !== 1) return null;
    return { card: json<StoredCard>(r.fsrs) as StoredCard, introducedAt: r.introduced_at };
  }

  /** Items with both users' predicted recall; null when a user has no unlocked card. */
  private withRecall(c: Candidate, userIds: number[], now: Date): RoundItem | null {
    const facetKey = lemmaFacetKey(c.lemma_id, c.target_facet);
    const r: Record<string, number> = {};
    for (const u of userIds) {
      const card = this.card(u, facetKey);
      if (!card) return null;
      r[String(u)] = recall(card.card, now);
    }
    return { sentenceId: c.id, lemmaId: c.lemma_id, facetKey, r };
  }

  /** The day's duel, generated once (idempotent). Empty items: no duel today. */
  ensureDuel(day: string, userIds: number[], mode: string, now: Date): RoundRow {
    const existing = this.row('duel', day);
    if (existing) return existing;
    const recent = new Set<number>();
    for (const d of this.db
      .prepare<[string, string], { items: string }>(
        'SELECT items FROM duel WHERE day_key >= ? AND day_key < ?',
      )
      .all(addDays(day, -DUEL.LEMMA_COOLDOWN_DAYS), day)) {
      for (const it of json<RoundItem[]>(d.items) ?? []) recent.add(it.lemmaId);
    }
    const rand = seededRng(hashSeed(`duel:${day}`));
    const byLemma = new Map<number, RoundItem>();
    for (const c of shuffle(this.sharedCandidates(userIds, recent), rand)) {
      if (byLemma.has(c.lemma_id)) continue;
      const item = this.withRecall(c, userIds, now);
      if (item) byLemma.set(c.lemma_id, item);
    }
    const inBand = (it: RoundItem) =>
      Object.values(it.r).every((x) => x >= DUEL.PREFERRED_R_MIN && x <= DUEL.PREFERRED_R_MAX);
    const mid = (DUEL.PREFERRED_R_MIN + DUEL.PREFERRED_R_MAX) / 2;
    const dist = (it: RoundItem) => Math.max(...Object.values(it.r).map((x) => Math.abs(x - mid)));
    const all = [...byLemma.values()];
    const items = [
      ...all.filter(inBand),
      ...all.filter((it) => !inBand(it)).sort((x, y) => dist(x) - dist(y)),
    ].slice(0, DUEL.ITEMS);
    this.db
      .prepare('INSERT INTO duel (day_key, items, mode, created_at) VALUES (?, ?, ?, ?)')
      .run(day, JSON.stringify(items), mode, now.toISOString());
    return this.row('duel', day) as RoundRow;
  }

  /**
   * The exam for `month`, generated when its window opens: facets both users
   * introduced during the month and at least MIN_FACET_AGE_DAYS before the
   * window, topped up with older shared facets.
   */
  ensureExam(month: string, userIds: number[], opensAt: Date, closesAt: Date, now: Date): RoundRow {
    const existing = this.row('exam', month);
    if (existing) return existing;
    const monthStart = dayStart(`${month}-01`).toISOString();
    const latest = new Date(opensAt.getTime() - EXAM.MIN_FACET_AGE_DAYS * 86_400_000).toISOString();
    const rand = seededRng(hashSeed(`exam:${month}`));
    const candidates = shuffle(this.sharedCandidates(userIds, new Set()), rand);
    const fresh: RoundItem[] = [];
    const older: RoundItem[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const key = lemmaFacetKey(c.lemma_id, c.target_facet);
      if (seen.has(key)) continue;
      const cards = userIds.map((u) => this.card(u, key));
      if (cards.some((x) => x === null)) continue;
      seen.add(key);
      const item = this.withRecall(c, userIds, opensAt) as RoundItem;
      const intro = cards.map((x) => x?.introducedAt ?? '');
      if (intro.every((t) => t >= monthStart && t <= latest)) fresh.push(item);
      else if (intro.every((t) => t < monthStart)) older.push(item);
    }
    const items = [...fresh, ...older].slice(0, EXAM.ITEMS);
    this.db
      .prepare(
        'INSERT INTO exam (month_key, items, opens_at, closes_at, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        month,
        JSON.stringify(items),
        opensAt.toISOString(),
        closesAt.toISOString(),
        now.toISOString(),
      );
    return this.row('exam', month) as RoundRow;
  }

  private attemptsOf(kind: RoundKind, roundId: number, userId: number) {
    return this.db
      .prepare<
        [number, number],
        {
          id: number;
          item_index: number;
          correct: number;
          latency_ms: number;
          voided: number;
          feedback: string | null;
        }
      >(
        `SELECT id, item_index, correct, latency_ms, voided, feedback FROM attempt
         WHERE ${kind === 'duel' ? 'duel_id' : 'exam_id'} = ? AND user_id = ? ORDER BY item_index`,
      )
      .all(roundId, userId);
  }

  /** Items still counted: their sentence was not reported (spec §8.4). */
  private counted(round: RoundRow): Set<number> {
    const out = new Set<number>();
    for (const [i, it] of round.items.entries()) {
      if (this.repo.sentence(it.sentenceId)?.status === 'ok') out.add(i);
    }
    return out;
  }

  private resultTable(kind: RoundKind): string {
    return kind === 'duel' ? 'duel_result' : 'exam_result';
  }

  private resultRow(kind: RoundKind, roundId: number, userId: number) {
    return this.db
      .prepare<[number, number], { started_at: string; finished_at: string | null }>(
        `SELECT started_at, finished_at FROM ${this.resultTable(kind)} WHERE ${kind}_id = ? AND user_id = ?`,
      )
      .get(roundId, userId);
  }

  /** Live totals from the attempts (voided attempts and reported items do not count). */
  totals(kind: RoundKind, round: RoundRow, userId: number): RoundTotals {
    const row = this.resultRow(kind, round.id, userId);
    const counted = this.counted(round);
    let correct = 0;
    let totalMs = 0;
    for (const a of this.attemptsOf(kind, round.id, userId)) {
      if (a.voided === 1 || !counted.has(a.item_index)) continue;
      correct += a.correct;
      totalMs += a.latency_ms;
    }
    let expectedSum = 0;
    for (const i of counted) expectedSum += round.items[i]?.r[String(userId)] ?? 0;
    return {
      userId,
      played: row !== undefined,
      finished: typeof row?.finished_at === 'string',
      correct,
      total: counted.size,
      expectedSum,
      totalMs,
    };
  }

  /** Store the totals on the result row (after an answer, a settlement or a re-settlement). */
  storeTotals(kind: RoundKind, round: RoundRow, t: RoundTotals): void {
    if (kind === 'duel') {
      this.db
        .prepare(
          'UPDATE duel_result SET correct = ?, expected_sum = ?, total_ms = ? WHERE duel_id = ? AND user_id = ?',
        )
        .run(t.correct, t.expectedSum, t.totalMs, round.id, t.userId);
    } else {
      this.db
        .prepare('UPDATE exam_result SET correct = ?, total = ? WHERE exam_id = ? AND user_id = ?')
        .run(t.correct, t.total, round.id, t.userId);
    }
  }

  /** A player who never started forfeits (spec §9.1). */
  markForfeit(kind: RoundKind, round: RoundRow, userId: number, at: Date): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ${this.resultTable(kind)} (${kind}_id, user_id, started_at, forfeit) VALUES (?, ?, ?, 1)`,
      )
      .run(round.id, userId, at.toISOString());
  }

  private nextIndex(kind: RoundKind, round: RoundRow, userId: number): number | null {
    const answered = new Set(this.attemptsOf(kind, round.id, userId).map((a) => a.item_index));
    for (const [i, it] of round.items.entries()) {
      if (answered.has(i)) continue;
      if (this.repo.sentence(it.sentenceId)?.status !== 'ok') continue; // reported meanwhile
      return i;
    }
    return null;
  }

  /** Answer the next item; feedback is withheld until the round is finished. */
  answer(
    kind: RoundKind,
    round: RoundRow,
    userId: number,
    input: Pick<AttemptInput, 'answer' | 'tappedIndex' | 'latencyMs'> & { index: number },
    now: Date,
  ): { index: number; finished: boolean } {
    if (now.toISOString() >= round.closesAt) throw new AttemptError(409, 'round closed');
    const next = this.nextIndex(kind, round, userId);
    if (next === null) throw new AttemptError(409, 'round already finished');
    if (input.index !== next) throw new AttemptError(409, 'answer the items in order');
    const item = round.items[next] as RoundItem;
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ${this.resultTable(kind)} (${kind}_id, user_id, started_at) VALUES (?, ?, ?)`,
      )
      .run(round.id, userId, now.toISOString());
    this.attempts.submit(
      userId,
      {
        sentenceId: item.sentenceId,
        answer: input.answer,
        tappedIndex: input.tappedIndex,
        latencyMs: input.latencyMs,
        context: kind,
        round:
          kind === 'duel' ? { duelId: round.id, index: next } : { examId: round.id, index: next },
      },
      now,
    );
    const finished = this.nextIndex(kind, round, userId) === null;
    if (finished) {
      this.db
        .prepare(
          `UPDATE ${this.resultTable(kind)} SET finished_at = ? WHERE ${kind}_id = ? AND user_id = ?`,
        )
        .run(now.toISOString(), round.id, userId);
    }
    this.storeTotals(kind, round, this.totals(kind, round, userId));
    return { index: next, finished };
  }

  /** What a user sees: the next prompt while playing, full feedback at the end. */
  view(kind: RoundKind, round: RoundRow, userId: number, otherId: number, now: Date) {
    const mine = this.totals(kind, round, userId);
    const other = this.totals(kind, round, otherId);
    const closed = now.toISOString() >= round.closesAt || round.settledAt !== null;
    const next = this.nextIndex(kind, round, userId);
    const base = {
      id: round.id,
      key: round.key,
      mode: round.mode,
      total: round.items.length,
      closesAt: round.closesAt,
      answered: this.attemptsOf(kind, round.id, userId).length,
    };
    if (!mine.finished && !closed && next !== null) {
      const item = round.items[next] as RoundItem;
      const sentence = this.repo.sentence(item.sentenceId);
      const lemma = this.repo.lemma(item.lemmaId);
      if (!sentence || !lemma) throw new AttemptError(500, 'round item missing');
      const prompt: Prompt = this.sessions.prompt(sentence, lemma);
      return {
        ...base,
        status: mine.played ? ('playing' as const) : ('ready' as const),
        next: {
          index: next,
          exerciseType: sentence.exerciseType,
          lemmaId: lemma.id,
          pos: lemma.pos,
          prompt,
        },
        mine: null,
        other: null,
        feedback: [],
      };
    }
    const reveal = closed || (mine.finished && other.finished);
    const feedback = this.attemptsOf(kind, round.id, userId).map((a) => {
      const item = round.items[a.item_index] as RoundItem;
      const sentence = this.repo.sentence(item.sentenceId);
      const lemma = this.repo.lemma(item.lemmaId);
      return {
        index: a.item_index,
        voided: a.voided === 1,
        exerciseType: sentence?.exerciseType ?? null,
        prompt: sentence && lemma ? this.sessions.prompt(sentence, lemma) : null,
        feedback: json<Feedback>(a.feedback),
      };
    });
    return {
      ...base,
      status: closed ? ('closed' as const) : ('finished' as const),
      next: null,
      mine,
      other: reveal ? other : { userId: otherId, finished: other.finished },
      feedback,
    };
  }

  /** Round ids an attempt or a sentence's attempts belong to (for re-settlement). */
  roundsOfAttempts(attemptIds: number[]): { kind: RoundKind; id: number }[] {
    if (attemptIds.length === 0) return [];
    const marks = attemptIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare<number[], { duel_id: number | null; exam_id: number | null }>(
        `SELECT DISTINCT duel_id, exam_id FROM attempt WHERE id IN (${marks})`,
      )
      .all(...attemptIds);
    const out: { kind: RoundKind; id: number }[] = [];
    for (const r of rows) {
      if (r.duel_id !== null) out.push({ kind: 'duel', id: r.duel_id });
      if (r.exam_id !== null) out.push({ kind: 'exam', id: r.exam_id });
    }
    return out;
  }
}
