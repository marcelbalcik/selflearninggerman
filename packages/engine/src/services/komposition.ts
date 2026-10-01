/**
 * Komposition (spec §6.8, docs/DECISIONS.md): two sentences with three target
 * lemmas. Deterministic check that each target appears in a stored form (and,
 * if asked, a noun in the dative); the other user reviews the text in Prüfen.
 * (No grammar checker: the app runs without a server.)
 */
import {
  CONTRACTIONS,
  SESSION,
  dayKey,
  detCells,
  detClassesOf,
  lemmaFacetKey,
  nounForms,
  skillFacetKey,
} from '@wortduell/core';
import type { FacetKey, FacetRating, Gender, SkillId } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { nounInput } from '../repo';
import type { Lemma, Repo } from '../repo';
import type { Cards } from './cards';
import { AttemptError } from './attempts';
import { Ids } from '../ids';

export interface KompositionTask {
  lemmas: { id: number; text: string; pos: string; article: string | null }[];
  requiredCase: 'dat' | null;
}

export interface TargetCheck {
  lemmaId: number;
  found: boolean;
  span: [number, number] | null;
  dative: boolean;
}

const ARTICLE = { m: 'der', f: 'die', n: 'das' } as const;

export class Komposition {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly cards: Cards,
    private readonly ids: Ids = new Ids(),
  ) {}

  doneToday(userId: number, now: Date): boolean {
    return (
      this.db
        .prepare('SELECT 1 FROM komposition WHERE user_id = ? AND day_key = ?')
        .get(userId, dayKey(now)) !== undefined
    );
  }

  /**
   * Three due or recently introduced lemmas (nouns, verbs, adjectives), or
   * null when there are not enough (spec §8.2 step 4).
   */
  task(userId: number, now: Date): KompositionTask | null {
    if (this.doneToday(userId, now)) return null;
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const rows = this.db
      .prepare<[number, string, string], { lemma_id: number }>(
        `SELECT DISTINCT c.lemma_id FROM facet_card c JOIN lemma l ON l.id = c.lemma_id
         WHERE c.user_id = ? AND c.unlocked = 1 AND l.pos IN ('noun', 'verb', 'adj')
           AND (c.due <= ? OR c.introduced_at >= ?)
         ORDER BY c.due LIMIT 30`,
      )
      .all(userId, now.toISOString(), since);
    const lemmas = rows
      .map((r) => this.repo.lemma(r.lemma_id))
      .filter(
        (l): l is Lemma => l !== null && (l.pos !== 'noun' || typeof l.noun?.gender === 'string'),
      );
    // Prefer a mix: at least one noun so the dative task makes sense.
    const nouns = lemmas.filter((l) => l.pos === 'noun');
    const picked = [
      ...nouns.slice(0, 1),
      ...lemmas.filter((l) => !nouns.slice(0, 1).includes(l)),
    ].slice(0, SESSION.KOMPOSITION_TARGET_LEMMAS);
    if (picked.length < SESSION.KOMPOSITION_TARGET_LEMMAS) return null;
    return {
      lemmas: picked.map((l) => ({
        id: l.id,
        text: l.text,
        pos: l.pos,
        article: l.noun?.gender ? ARTICLE[l.noun.gender] : null,
      })),
      requiredCase: picked.some((l) => l.pos === 'noun') ? 'dat' : null,
    };
  }

  /** Deterministic target checks (exported for tests). */
  check(text: string, lemmas: Lemma[], requiredCase: 'dat' | null): TargetCheck[] {
    const tokens = [...text.matchAll(/[A-Za-zÄÖÜäöüß]+/gu)].map((m) => ({
      word: m[0],
      lower: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    }));
    return lemmas.map((l) => {
      const forms = this.repo.forms(l.id);
      forms.add(l.text.toLowerCase());
      if (l.verb?.prefix) forms.delete(l.verb.prefix.toLowerCase());
      const hits = tokens.filter((t) => forms.has(t.lower));
      let dative = false;
      if (requiredCase === 'dat' && l.noun) {
        for (const hit of hits) {
          const i = tokens.indexOf(hit);
          const prev = tokens[i - 1]?.lower;
          if (prev && isDativeBefore(prev, l, hit.word)) dative = true;
        }
      }
      const first = hits[0];
      return {
        lemmaId: l.id,
        found: first !== undefined,
        span: first ? [first.start, first.end] : null,
        dative,
      };
    });
  }

  submit(
    userId: number,
    input: { lemmaIds: number[]; requiredCase: 'dat' | null; text: string },
    now: Date,
  ): { id: number; checks: TargetCheck[]; ratings: FacetRating[] } {
    if (this.doneToday(userId, now)) throw new AttemptError(409, 'komposition already done today');
    const lemmas = input.lemmaIds
      .map((id) => this.repo.lemma(id))
      .filter((l): l is Lemma => l !== null);
    if (lemmas.length !== input.lemmaIds.length) throw new AttemptError(400, 'unknown lemma');
    const checks = this.check(input.text, lemmas, input.requiredCase);
    const ratings: FacetRating[] = [];
    for (const [i, l] of lemmas.entries()) {
      const c = checks[i] as TargetCheck;
      const meaning = this.meaningFacet(userId, l.id);
      ratings.push({ facet: meaning, rating: c.found ? 'good' : 'again' });
    }
    if (input.requiredCase === 'dat') {
      const noun = lemmas.find((l) => l.noun?.gender);
      if (noun && !checks.some((c) => c.dative)) {
        ratings.push({
          facet: skillFacetKey(`case.dat.${noun.noun?.gender as Gender}` as SkillId),
          rating: 'again',
        });
      }
    }
    const id = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO komposition (id, user_id, day_key, lemma_ids, required_case, text, checks, languagetool, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.ids.next(),
          userId,
          dayKey(now),
          JSON.stringify(input.lemmaIds),
          input.requiredCase,
          input.text,
          JSON.stringify(checks),
          null,
          now.toISOString(),
        );
      const kid = Number(info.lastInsertRowid);
      for (const r of ratings) {
        if (r.facet.startsWith('skill:'))
          this.cards.ensureSkill(userId, r.facet.slice(6) as SkillId, now);
        this.cards.rate(userId, r.facet, r.rating, now, null, 'session', kid);
      }
      return kid;
    })();
    return { id, checks, ratings };
  }

  /**
   * Partner review: marks on target words add Again on the facet their error
   * type maps to (gender, frame, case, ending); other marks are feedback only.
   */
  review(
    reviewerId: number,
    kompositionId: number,
    marks: { start: number; end: number; type: string; correction: string }[],
    now: Date,
  ): { ratings: FacetRating[] } {
    const k = this.db
      .prepare<
        [number],
        { user_id: number; lemma_ids: string; checks: string; reviewed_by: number | null }
      >('SELECT user_id, lemma_ids, checks, reviewed_by FROM komposition WHERE id = ?')
      .get(kompositionId);
    if (!k) throw new AttemptError(404, 'komposition not found');
    if (k.user_id === reviewerId)
      throw new AttemptError(403, 'the other user reviews a komposition');
    if (k.reviewed_by !== null) throw new AttemptError(409, 'already reviewed');
    const checks = json<TargetCheck[]>(k.checks) ?? [];
    const ratings: FacetRating[] = [];
    this.db.transaction(() => {
      for (const m of marks) {
        const hit = checks.find((c) => c.span && m.start < c.span[1] && m.end > c.span[0]);
        this.db
          .prepare(
            `INSERT INTO komposition_mark (komposition_id, reviewer_id, start, "end", error_type, correction, lemma_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            kompositionId,
            reviewerId,
            m.start,
            m.end,
            m.type,
            m.correction,
            hit?.lemmaId ?? null,
            now.toISOString(),
          );
        if (!hit) continue;
        const l = this.repo.lemma(hit.lemmaId);
        if (!l) continue;
        const facet = markFacet(l, m.type, this.meaningFacet(k.user_id, l.id));
        if (facet.startsWith('skill:'))
          this.cards.ensureSkill(k.user_id, facet.slice(6) as SkillId, now);
        if (this.cards.rate(k.user_id, facet, 'again', now, null, 'session', kompositionId)) {
          ratings.push({ facet, rating: 'again' });
        }
      }
      this.db
        .prepare('UPDATE komposition SET reviewed_by = ?, reviewed_at = ? WHERE id = ?')
        .run(reviewerId, now.toISOString(), kompositionId);
    })();
    return { ratings };
  }

  private meaningFacet(userId: number, lemmaId: number): FacetKey {
    const prod = lemmaFacetKey(lemmaId, 'meaning_prod');
    return this.cards.get(userId, prod)?.unlocked === 1
      ? prod
      : lemmaFacetKey(lemmaId, 'meaning_recv');
  }
}

function markFacet(l: Lemma, type: string, meaning: FacetKey): FacetKey {
  if (type === 'gender' && l.noun) return lemmaFacetKey(l.id, 'gender');
  if (type === 'frame' && l.verb) return lemmaFacetKey(l.id, 'frame');
  if (type === 'case' && l.noun?.gender)
    return skillFacetKey(`case.dat.${l.noun.gender}` as SkillId);
  if (type === 'ending' && l.noun && (l.noun.weak || l.noun.mixed))
    return lemmaFacetKey(l.id, 'weak');
  return meaning;
}

/** Whether `prev` + `word` is a dative NP of this noun (dem Kind, im Haus, einer Frau). */
function isDativeBefore(prev: string, l: Lemma, word: string): boolean {
  const noun = nounInput(l);
  const contraction = CONTRACTIONS[prev];
  const det = contraction ? contraction[1] : prev;
  for (const cls of detClassesOf(det)) {
    for (const cell of detCells(det, cls)) {
      if (cell.case !== 'dat') continue;
      const num = cell.slot === 'pl' ? 'pl' : 'sg';
      if (
        num === 'sg' &&
        cell.slot !== noun.gender &&
        !(noun.altGenders ?? []).includes(cell.slot as Gender)
      ) {
        continue;
      }
      const forms = nounForms(noun, { num, case: 'dat' });
      if (forms.some((f) => f.toLowerCase() === word.toLowerCase())) return true;
    }
  }
  return false;
}
