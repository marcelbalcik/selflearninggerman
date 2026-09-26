/**
 * Reports with voiding (spec §8.4), placement (docs/DECISIONS.md: both users
 * start at A2.1), lemma detail (Wort screen) and today's numbers (Heute).
 */
import { PLACEMENT, SESSION, dayKey, dayStart, gradeGloss, recall } from '@wortduell/core';
import type { FacetKey, StoredCard } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import type { Lemma, Repo } from '../repo';
import type { Cards } from './cards';
import type { LemmaCard, Sessions } from './session';

export class Learning {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly cards: Cards,
    private readonly sessions: Sessions,
  ) {}

  /**
   * "Fehler melden": the sentence is excluded everywhere, every attempt on it
   * (both users) is voided and the affected cards are rebuilt without those
   * reviews. Duel and exam re-settlement joins this path in M5.
   */
  report(
    userId: number,
    sentenceId: number,
    reason: string,
    now: Date,
  ): { voidedAttempts: number } {
    return this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO report (user_id, sentence_id, reason, status, created_at) VALUES (?, ?, ?, 'open', ?)",
        )
        .run(userId, sentenceId, reason, now.toISOString());
      this.db.prepare("UPDATE sentence SET status = 'reported' WHERE id = ?").run(sentenceId);
      const attempts = this.db
        .prepare<[number], { id: number }>(
          'SELECT id FROM attempt WHERE sentence_id = ? AND voided = 0',
        )
        .all(sentenceId)
        .map((a) => a.id);
      if (attempts.length === 0) return { voidedAttempts: 0 };
      const marks = attempts.map(() => '?').join(',');
      const affected = this.db
        .prepare<number[], { user_id: number; facet_key: FacetKey }>(
          `SELECT DISTINCT user_id, facet_key FROM review_log WHERE attempt_id IN (${marks}) AND voided = 0`,
        )
        .all(...attempts);
      this.db.prepare(`UPDATE attempt SET voided = 1 WHERE id IN (${marks})`).run(...attempts);
      this.db
        .prepare(`UPDATE review_log SET voided = 1 WHERE attempt_id IN (${marks})`)
        .run(...attempts);
      for (const a of affected) this.cards.replay(a.user_id, a.facet_key);
      return { voidedAttempts: attempts.length };
    })();
  }

  /** Placement sample: every Nth core lemma below the A2.1 start rank. */
  placementSample(
    userId: number,
  ): { lemmaId: number; text: string; pos: string; sentence: string | null }[] {
    return this.placementBlocks(userId).map(({ sample }) => ({
      lemmaId: sample.id,
      text: sample.text,
      pos: sample.pos,
      sentence:
        this.repo.sentences(sample.id).find((s) => s.exerciseType === 'bedeutung')?.de ?? null,
    }));
  }

  private placementBlocks(userId: number): { sample: Lemma; block: Lemma[] }[] {
    const deck = this.repo
      .coreDeck()
      .filter(
        (l) =>
          (l.freqRank ?? Infinity) <= PLACEMENT.START_RANK &&
          !this.cards.isIntroduced(userId, l.id),
      );
    const blocks: { sample: Lemma; block: Lemma[] }[] = [];
    for (let i = 0; i < deck.length; i += PLACEMENT.SAMPLE_EVERY) {
      const block = deck.slice(i, i + PLACEMENT.SAMPLE_EVERY);
      const sample = block[block.length - 1];
      if (sample) blocks.push({ sample, block });
    }
    return blocks;
  }

  /**
   * Placement answers (typed English meanings, graded here): a passed sample
   * introduces its whole block with one Good review per card; a failed sample
   * leaves the block in the normal new-word queue. Allowed once per user.
   */
  placement(
    userId: number,
    answers: { lemmaId: number; answer: string }[],
    now: Date,
  ): {
    introduced: number;
    passed: number;
    results: { lemmaId: number; correct: boolean; expected: string }[];
  } {
    const done = this.db
      .prepare<[number], { placement_done_at: string | null }>(
        'SELECT placement_done_at FROM user WHERE id = ?',
      )
      .get(userId);
    if (done?.placement_done_at) return { introduced: 0, passed: 0, results: [] };
    const results = answers.map((a) => {
      const lemma = this.repo.lemma(a.lemmaId);
      const g = gradeGloss(lemma?.glossesAccepted ?? [], a.answer);
      return {
        lemmaId: a.lemmaId,
        correct: lemma !== null && g.correct,
        expected: lemma?.gloss ?? '',
      };
    });
    const passed = new Set(results.filter((r) => r.correct).map((r) => r.lemmaId));
    let introduced = 0;
    this.db.transaction(() => {
      for (const { sample, block } of this.placementBlocks(userId)) {
        if (!passed.has(sample.id)) continue;
        for (const lemma of block) {
          if (!this.cards.introduce(userId, lemma, now, 'placement')) continue;
          introduced += 1;
          const keys = this.db
            .prepare<[number, number], { facet_key: FacetKey }>(
              'SELECT facet_key FROM facet_card WHERE user_id = ? AND lemma_id = ? AND unlocked = 1',
            )
            .all(userId, lemma.id);
          for (const k of keys)
            this.cards.rate(userId, k.facet_key, 'good', now, null, 'placement');
        }
      }
      this.db
        .prepare('UPDATE user SET placement_done_at = ? WHERE id = ?')
        .run(now.toISOString(), userId);
    })();
    return { introduced, passed: passed.size, results };
  }

  /** Skip placement: start from the first core word. */
  skipPlacement(userId: number, now: Date): void {
    this.db
      .prepare('UPDATE user SET placement_done_at = ? WHERE id = ? AND placement_done_at IS NULL')
      .run(now.toISOString(), userId);
  }

  /** Wort screen: forms, example sentences and a stability bar per facet. */
  lemmaDetail(
    userId: number,
    lemmaId: number,
    now: Date,
  ): (LemmaCard & { facets: unknown[]; examples: unknown[] }) | null {
    const lemma = this.repo.lemma(lemmaId);
    if (!lemma) return null;
    const facets = this.db
      .prepare<
        [number, number],
        { facet_key: string; fsrs: string; unlocked: number; due: string }
      >('SELECT facet_key, fsrs, unlocked, due FROM facet_card WHERE user_id = ? AND lemma_id = ?')
      .all(userId, lemmaId)
      .map((r) => {
        const card = json<StoredCard>(r.fsrs) as StoredCard;
        return {
          facet: r.facet_key.split(':')[2],
          unlocked: r.unlocked === 1,
          stabilityDays: card.stability,
          recallNow: recall(card, now),
          due: r.due,
        };
      });
    const examples = this.repo
      .sentences(lemmaId)
      .filter((s) => s.exerciseType === 'bedeutung')
      .map((s) => ({ de: s.de, en: s.en }));
    return { ...this.sessions.lemmaCard(lemma), facets, examples };
  }

  /** Heute: due count, reviews and new words today. */
  today(userId: number, now: Date): Record<string, number | string | boolean> {
    const day = dayKey(now);
    const start = dayStart(day).toISOString();
    const reviews =
      this.db
        .prepare<[number, string], { n: number }>(
          "SELECT COUNT(*) AS n FROM attempt WHERE user_id = ? AND ts >= ? AND voided = 0 AND context = 'session'",
        )
        .get(userId, start)?.n ?? 0;
    const plan = this.sessions.build(userId, now, { reviewsOnly: true });
    const newToday = this.sessions.introducedToday(userId, now).length;
    return {
      day,
      dueCount: plan.dueCount,
      /** Exercises the due cards make up today (one per word). */
      dueItems: plan.items.length,
      backlog: plan.backlog,
      reviewsToday: reviews,
      newToday,
      newRemaining: Math.max(0, SESSION.NEW_PER_DAY - newToday),
    };
  }
}
