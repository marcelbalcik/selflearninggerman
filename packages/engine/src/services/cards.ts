/**
 * FSRS cards per user × facet (spec §5, §13). Every review stores the card
 * before and after, so any review can be voided (spec §8.4): voided reviews
 * are skipped and the card is replayed from its creation (docs/DECISIONS.md).
 */
import {
  FSRS,
  dayKey,
  lemmaFacetKey,
  lexicalFacets,
  newCard,
  replayCard,
  reviewCard,
  skillFacetKey,
} from '@wortduell/core';
import type { FacetKey, LexicalFacet, Rating, SkillId, StoredCard } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { lemmaFacts } from '../repo';
import type { Lemma } from '../repo';

export interface CardRow {
  user_id: number;
  facet_key: FacetKey;
  lemma_id: number | null;
  skill_id: string | null;
  fsrs: string;
  due: string;
  introduced_at: string;
  unlocked: number;
}

export type ReviewContext = 'session' | 'duel' | 'exam' | 'placement';

export class Cards {
  constructor(private readonly db: Db) {}

  get(userId: number, key: FacetKey): (CardRow & { card: StoredCard }) | null {
    const row = this.db
      .prepare<[number, string], CardRow>(
        'SELECT * FROM facet_card WHERE user_id = ? AND facet_key = ?',
      )
      .get(userId, key);
    return row ? { ...row, card: json<StoredCard>(row.fsrs) as StoredCard } : null;
  }

  private insert(
    userId: number,
    key: FacetKey,
    lemmaId: number | null,
    skillId: string | null,
    now: Date,
    unlocked: boolean,
  ): void {
    const card = newCard(now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO facet_card (user_id, facet_key, lemma_id, skill_id, fsrs, due, introduced_at, unlocked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        key,
        lemmaId,
        skillId,
        JSON.stringify(card),
        card.due,
        now.toISOString(),
        unlocked ? 1 : 0,
      );
  }

  isIntroduced(userId: number, lemmaId: number): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM lemma_intro WHERE user_id = ? AND lemma_id = ?')
        .get(userId, lemmaId) !== undefined
    );
  }

  /** Introduce a lemma: one card per applicable facet (spec §5.1). Idempotent. */
  introduce(userId: number, lemma: Lemma, now: Date, source: 'session' | 'placement'): boolean {
    if (this.isIntroduced(userId, lemma.id)) return false;
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO lemma_intro (user_id, lemma_id, introduced_at, day_key, source) VALUES (?, ?, ?, ?, ?)',
        )
        .run(userId, lemma.id, now.toISOString(), dayKey(now), source);
      for (const f of lexicalFacets(lemmaFacts(lemma))) {
        this.insert(userId, lemmaFacetKey(lemma.id, f.facet), lemma.id, null, now, f.unlocked);
      }
    })();
    return true;
  }

  /** Add facet cards a lemma gained later (e.g. a frame approved in Prüfen). */
  ensureLexical(lemma: Lemma, now: Date): number {
    const users = this.db
      .prepare<[number], { user_id: number }>('SELECT user_id FROM lemma_intro WHERE lemma_id = ?')
      .all(lemma.id);
    let added = 0;
    for (const { user_id } of users) {
      for (const f of lexicalFacets(lemmaFacts(lemma))) {
        const key = lemmaFacetKey(lemma.id, f.facet);
        if (this.get(user_id, key)) continue;
        this.insert(user_id, key, lemma.id, null, now, f.unlocked);
        added += 1;
      }
    }
    return added;
  }

  /** Skill cards are created the first time an attempt implicates them. */
  ensureSkill(userId: number, skill: SkillId, now: Date): void {
    this.insert(userId, skillFacetKey(skill), null, skill, now, true);
  }

  /** Apply one rating and log it with the card before and after. */
  rate(
    userId: number,
    key: FacetKey,
    rating: Rating,
    now: Date,
    attemptId: number | null,
    context: ReviewContext,
    kompositionId: number | null = null,
  ): StoredCard | null {
    const row = this.get(userId, key);
    if (!row || row.unlocked !== 1) return null;
    const after = reviewCard(row.card, rating, now);
    this.save(userId, key, after);
    this.db
      .prepare(
        `INSERT INTO review_log (user_id, facet_key, attempt_id, rating, card_before, card_after, ts, context, komposition_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        key,
        attemptId,
        rating,
        row.fsrs,
        JSON.stringify(after),
        now.toISOString(),
        context,
        kompositionId,
      );
    if (key.endsWith(':meaning_recv')) this.maybeUnlockProduction(userId, key, after, now);
    return after;
  }

  private save(userId: number, key: FacetKey, card: StoredCard): void {
    this.db
      .prepare('UPDATE facet_card SET fsrs = ?, due = ? WHERE user_id = ? AND facet_key = ?')
      .run(JSON.stringify(card), card.due, userId, key);
  }

  /** `meaning_prod` unlocks once `meaning_recv` stability reaches the threshold. */
  private maybeUnlockProduction(
    userId: number,
    recvKey: FacetKey,
    card: StoredCard,
    now: Date,
  ): void {
    if (card.stability < FSRS.PROD_UNLOCK_STABILITY_DAYS) return;
    const prodKey = recvKey.replace(/:meaning_recv$/u, ':meaning_prod') as FacetKey;
    const prod = this.get(userId, prodKey);
    if (!prod || prod.unlocked === 1) return;
    const fresh = newCard(now);
    this.db
      .prepare(
        'UPDATE facet_card SET unlocked = 1, fsrs = ?, due = ?, introduced_at = ? WHERE user_id = ? AND facet_key = ?',
      )
      .run(JSON.stringify(fresh), fresh.due, now.toISOString(), userId, prodKey);
  }

  /** Rebuild a card from its non-voided reviews (after voiding). */
  replay(userId: number, key: FacetKey): void {
    const row = this.get(userId, key);
    if (!row) return;
    const reviews = this.db
      .prepare<[number, string], { rating: Rating; ts: string }>(
        'SELECT rating, ts FROM review_log WHERE user_id = ? AND facet_key = ? AND voided = 0 ORDER BY ts, id',
      )
      .all(userId, key)
      .map((r) => ({ rating: r.rating, at: new Date(r.ts) }));
    this.save(userId, key, replayCard(new Date(row.introduced_at), reviews));
  }

  lemmaFacetKey(lemmaId: number, facet: LexicalFacet): FacetKey {
    return lemmaFacetKey(lemmaId, facet);
  }
}
