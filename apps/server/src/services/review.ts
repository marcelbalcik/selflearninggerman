/**
 * Prüfen (spec §8.4, §10) and disputes (docs/DECISIONS.md):
 * - disputes are decided by the other user only; an approved answer is added
 *   to the sentence's accepted answers and the attempt is regraded (its
 *   reviews voided, Good reviews at the original time, cards replayed);
 * - reports can be rejected (the sentence returns) or marked fixed;
 * - verb frames still needing review can be approved or rejected;
 * - the other user's komposition texts wait here for review.
 */
import { lemmaFacetKey, sentenceFacets, skillFacetKey } from '@wortduell/core';
import type { FacetKey } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import type { Repo } from '../repo';
import { AttemptError } from './attempts';
import type { Cards } from './cards';
import type { Sessions } from './session';

export class Review {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly cards: Cards,
    private readonly sessions: Sessions,
  ) {}

  dispute(userId: number, attemptId: number, note: string, now: Date): { id: number } {
    const a = this.db
      .prepare<[number, number], { correct: number; voided: number }>(
        'SELECT correct, voided FROM attempt WHERE id = ? AND user_id = ?',
      )
      .get(attemptId, userId);
    if (!a) throw new AttemptError(404, 'attempt not found');
    if (a.correct === 1 || a.voided === 1) throw new AttemptError(409, 'nothing to dispute');
    const open = this.db
      .prepare("SELECT 1 FROM dispute WHERE attempt_id = ? AND status = 'open'")
      .get(attemptId);
    if (open) throw new AttemptError(409, 'already disputed');
    const info = this.db
      .prepare(
        "INSERT INTO dispute (attempt_id, user_id, note, status, created_at) VALUES (?, ?, ?, 'open', ?)",
      )
      .run(attemptId, userId, note, now.toISOString());
    return { id: Number(info.lastInsertRowid) };
  }

  decideDispute(
    deciderId: number,
    disputeId: number,
    approve: boolean,
    now: Date,
  ): { status: string } {
    const d = this.db
      .prepare<[number], { user_id: number; attempt_id: number; status: string }>(
        'SELECT user_id, attempt_id, status FROM dispute WHERE id = ?',
      )
      .get(disputeId);
    if (!d) throw new AttemptError(404, 'dispute not found');
    if (d.user_id === deciderId) throw new AttemptError(403, 'the other user decides a dispute');
    if (d.status !== 'open') throw new AttemptError(409, 'already decided');
    const status = approve ? 'approved' : 'rejected';
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE dispute SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
        .run(status, deciderId, now.toISOString(), disputeId);
      if (approve) this.regrade(d.user_id, d.attempt_id, disputeId);
    })();
    return { status };
  }

  /** The disputed answer becomes accepted; the attempt counts as correct from its own time on. */
  private regrade(userId: number, attemptId: number, disputeId: number): void {
    const a = this.db
      .prepare<[number], { sentence_id: number; answer_raw: string; ts: string; context: string }>(
        'SELECT sentence_id, answer_raw, ts, context FROM attempt WHERE id = ?',
      )
      .get(attemptId);
    if (!a) return;
    const sentence = this.repo.sentence(a.sentence_id);
    const lemma = sentence ? this.repo.lemma(sentence.lemmaId) : null;
    if (!sentence || !lemma) return;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO accepted_extra (sentence_id, answer, dispute_id) VALUES (?, ?, ?)',
      )
      .run(a.sentence_id, a.answer_raw.trim(), disputeId);
    const affected = new Set(
      this.db
        .prepare<[number], { facet_key: FacetKey }>(
          'SELECT facet_key FROM review_log WHERE attempt_id = ? AND voided = 0',
        )
        .all(attemptId)
        .map((r) => r.facet_key),
    );
    this.db.prepare('UPDATE review_log SET voided = 1 WHERE attempt_id = ?').run(attemptId);
    this.db
      .prepare('UPDATE attempt SET correct = 1, error_class = NULL WHERE id = ?')
      .run(attemptId);
    const f = sentenceFacets({
      lemmaId: lemma.id,
      targetFacet: sentence.targetFacet,
      exerciseType: sentence.exerciseType,
      skillIds: sentence.skillIds,
      features: sentence.gap.features ?? null,
      governor: sentence.gap.governed_by ?? null,
      nounIsWeak: lemma.noun ? lemma.noun.weak || lemma.noun.mixed : false,
    });
    const keys = [
      ...f.lexical.map((x) => lemmaFacetKey(x.lemmaId, x.facet)),
      ...f.skills.map((x) => skillFacetKey(x)),
    ].filter((k) => this.cards.get(userId, k)?.unlocked === 1);
    for (const key of keys) {
      this.db
        .prepare(
          `INSERT INTO review_log (user_id, facet_key, attempt_id, rating, card_before, card_after, ts, context)
           VALUES (?, ?, ?, 'good', '{}', '{}', ?, ?)`,
        )
        .run(userId, key, attemptId, a.ts, a.context);
      affected.add(key);
    }
    for (const key of affected) this.cards.replay(userId, key);
  }

  decideReport(reportId: number, action: 'reject' | 'fixed', now: Date): { ok: true } {
    const r = this.db
      .prepare<[number], { sentence_id: number; status: string }>(
        'SELECT sentence_id, status FROM report WHERE id = ?',
      )
      .get(reportId);
    if (!r) throw new AttemptError(404, 'report not found');
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE report SET status = ? WHERE id = ?')
        .run(action === 'reject' ? 'rejected' : 'fixed', reportId);
      if (action === 'reject') {
        this.db
          .prepare("UPDATE sentence SET status = 'ok' WHERE id = ? AND status = 'reported'")
          .run(r.sentence_id);
      }
    })();
    void now;
    return { ok: true };
  }

  decideFrame(
    userId: number,
    lemmaId: number,
    status: 'approved' | 'rejected',
    frame: { objects: string[]; preps?: { prep: string; case: string }[] } | null,
    now: Date,
  ): { addedCards: number } {
    const lemma = this.repo.lemma(lemmaId);
    if (!lemma?.verb) throw new AttemptError(404, 'verb not found');
    const chosen = frame ?? lemma.verb.frame ?? { objects: [] };
    this.db
      .prepare(
        `INSERT INTO frame_review (lemma_id, status, frame, decided_by, decided_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(lemma_id) DO UPDATE SET status = excluded.status, frame = excluded.frame,
           decided_by = excluded.decided_by, decided_at = excluded.decided_at`,
      )
      .run(lemmaId, status, JSON.stringify(chosen), userId, now.toISOString());
    this.repo.invalidate(lemmaId);
    const updated = this.repo.lemma(lemmaId);
    return {
      addedCards: status === 'approved' && updated ? this.cards.ensureLexical(updated, now) : 0,
    };
  }

  /** Everything waiting on the Prüfen screen for this user. */
  list(userId: number): Record<string, unknown[]> {
    const disputes = this.db
      .prepare<
        [number],
        {
          id: number;
          attempt_id: number;
          note: string;
          sentence_id: number;
          answer_raw: string;
          name: string;
        }
      >(
        `SELECT d.id, d.attempt_id, d.note, a.sentence_id, a.answer_raw, u.name FROM dispute d
         JOIN attempt a ON a.id = d.attempt_id JOIN user u ON u.id = d.user_id
         WHERE d.status = 'open' AND d.user_id != ? ORDER BY d.id`,
      )
      .all(userId)
      .map((d) => {
        const s = this.repo.sentence(d.sentence_id);
        const lemma = s ? this.repo.lemma(s.lemmaId) : null;
        return {
          id: d.id,
          by: d.name,
          note: d.note,
          answer: d.answer_raw,
          exerciseType: s?.exerciseType,
          prompt: s && lemma ? this.sessions.prompt(s, lemma) : null,
          accepted: s?.accepted.slice(0, 3) ?? [],
        };
      });
    const myDisputes = this.db
      .prepare<[number], { id: number; status: string; answer_raw: string }>(
        `SELECT d.id, d.status, a.answer_raw FROM dispute d JOIN attempt a ON a.id = d.attempt_id
         WHERE d.user_id = ? ORDER BY d.id DESC LIMIT 20`,
      )
      .all(userId);
    const reports = this.db
      .prepare<[], { id: number; sentence_id: number; reason: string; name: string; de: string }>(
        `SELECT r.id, r.sentence_id, r.reason, u.name, s.de FROM report r JOIN user u ON u.id = r.user_id
         JOIN sentence s ON s.id = r.sentence_id WHERE r.status = 'open' ORDER BY r.id`,
      )
      .all();
    const frames = this.db
      .prepare<
        [],
        {
          lemma_id: number;
          text: string;
          gloss_en: string;
          frame: string | null;
          frame_sources: string | null;
        }
      >(
        `SELECT v.lemma_id, l.text, l.gloss_en, v.frame, v.frame_sources FROM verb v JOIN lemma l ON l.id = v.lemma_id
         WHERE v.frame_status = 'needs_review' AND l.retired = 0
           AND v.lemma_id NOT IN (SELECT lemma_id FROM frame_review) ORDER BY l.freq_rank`,
      )
      .all()
      .map((f) => ({
        lemmaId: f.lemma_id,
        text: f.text,
        gloss: f.gloss_en,
        proposal: json(f.frame),
        corpus:
          (
            json<{ corpus?: { uses: number; counts: Record<string, number> } }>(f.frame_sources) ??
            {}
          ).corpus ?? null,
      }));
    const lemmas = this.db
      .prepare<[], { id: number; text: string; pos: string; review_reasons: string }>(
        "SELECT id, text, pos, review_reasons FROM lemma WHERE status = 'needs_review' AND retired = 0 ORDER BY freq_rank",
      )
      .all()
      .map((l) => ({ ...l, review_reasons: json<string[]>(l.review_reasons) }));
    const kompositions = this.db
      .prepare<
        [number],
        {
          id: number;
          text: string;
          lemma_ids: string;
          checks: string;
          languagetool: string | null;
          name: string;
          created_at: string;
        }
      >(
        `SELECT k.id, k.text, k.lemma_ids, k.checks, k.languagetool, u.name, k.created_at FROM komposition k
         JOIN user u ON u.id = k.user_id WHERE k.user_id != ? AND k.reviewed_by IS NULL ORDER BY k.id`,
      )
      .all(userId)
      .map((k) => ({
        id: k.id,
        by: k.name,
        text: k.text,
        targets: (json<number[]>(k.lemma_ids) ?? []).map(
          (id) => this.repo.lemma(id)?.text ?? String(id),
        ),
        checks: json(k.checks),
        languageTool: json(k.languagetool),
        createdAt: k.created_at,
      }));
    return { disputes, myDisputes, reports, frames, lemmas, kompositions };
  }
}
