/**
 * Daily session queue (spec §8.2): due reviews, then new words.
 *
 * - Due facets are grouped by lemma; each lemma gets the sentence covering
 *   most of its due facets (and due skills).
 * - No exercise type exceeds SESSION.MAX_EXERCISE_TYPE_SHARE of the session
 *   (at least 2 items per type, so tiny sessions stay possible); a lemma whose
 *   only fitting type is full waits for the next session.
 * - Parts of speech are interleaved and a lemma never appears twice in a row.
 * - New words: up to NEW_PER_DAY per learning day (core and personal
 *   together), in frequency order, never two from the same semantic field on
 *   one day. Each comes back as a `meaning_recv` item a few items later.
 * - Facets no available exercise type can train yet (e.g. `pp_aux` before
 *   `satzbau` exists) are left out of the queue and counted separately.
 */
import {
  SESSION,
  dayKey,
  displayTable,
  isDue,
  lemmaFacetKey,
  sentenceFacets,
  skillFacetKey,
} from '@wortduell/core';
import type { ExerciseType, FacetKey, StoredCard } from '@wortduell/core';
import { json } from '../db';
import { Settings } from './settings';
import type { Db } from '../db';
import { nounInput } from '../repo';
import type { Lemma, Repo, Sentence } from '../repo';

export interface ExerciseItem {
  kind: 'exercise';
  sentenceId: number;
  exerciseType: ExerciseType;
  lemmaId: number;
  pos: Lemma['pos'];
  /** Facets this item is expected to rate. */
  covers: FacetKey[];
  prompt: Prompt;
  /** Retrieval of a word introduced earlier in this session. */
  afterIntro?: boolean;
}

export interface IntroItem {
  kind: 'intro';
  lemmaId: number;
  pos: Lemma['pos'];
  lemma: LemmaCard;
}

export type SessionItem = ExerciseItem | IntroItem;

export type Prompt =
  | { type: 'kasus_luecke'; tokens: string[]; gapIndex: number; cue: string; en: string | null }
  | { type: 'fehlersuche'; tokens: string[] }
  | {
      type: 'bedeutung';
      de: string;
      tokens: string[];
      highlightIndex: number;
      word: string;
      /** "Tipp": first letter of the expected meaning. */
      hint: string;
    }
  | { type: 'en_de_chunk'; prompt: string; pos: Lemma['pos'] }
  | { type: 'umformen'; instruction: 'dat_pl' | 'perfekt' | 'du_form'; source: string }
  | { type: 'satzbau'; chunks: string[]; frame: string }
  | { type: 'wer_tut_was'; de: string; options: string[] }
  | { type: 'diktat'; speak: string; words: number };

export interface LemmaCard {
  id: number;
  text: string;
  pos: Lemma['pos'];
  gloss: string;
  article: string | null;
  forms: ReturnType<typeof displayTable> | null;
  verb: Lemma['verb'];
  example: { de: string; en: string | null } | null;
  audioUrl: string | null;
}

export interface SessionPlan {
  day: string;
  dueCount: number;
  backlog: boolean;
  newRemaining: number;
  items: SessionItem[];
  deferred: number;
  untrainable: number;
}

interface DueCard {
  facet_key: FacetKey;
  lemma_id: number | null;
  skill_id: string | null;
  fsrs: string;
}

const ARTICLE = { m: 'der', f: 'die', n: 'das' } as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Sessions {
  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly settings: Settings = new Settings(db),
  ) {}

  /** The new-word cap in effect (dual-approval setting). */
  newPerDay(now: Date): number {
    return this.settings.get('NEW_PER_DAY', now);
  }

  lemmaCard(lemma: Lemma): LemmaCard {
    const example = this.repo.sentences(lemma.id).find((s) => s.exerciseType === 'bedeutung');
    const audio = this.db
      .prepare<[number], { url: string }>('SELECT url FROM audio WHERE lemma_id = ?')
      .get(lemma.id);
    return {
      id: lemma.id,
      text: lemma.text,
      pos: lemma.pos,
      gloss: lemma.gloss,
      article: lemma.noun?.gender
        ? ARTICLE[lemma.noun.gender]
        : lemma.noun?.pluralOnly
          ? 'die'
          : null,
      forms: lemma.noun ? displayTable(nounInput(lemma)) : null,
      verb: lemma.verb,
      example: example ? { de: example.de, en: example.en } : null,
      audioUrl: audio?.url ?? null,
    };
  }

  prompt(s: Sentence, lemma: Lemma): Prompt {
    const g = s.gap;
    switch (s.exerciseType) {
      case 'kasus_luecke':
        return {
          type: 'kasus_luecke',
          tokens: g.tokens,
          gapIndex: g.gap_index ?? 0,
          cue: g.cue ?? lemma.text,
          en: s.en,
        };
      case 'fehlersuche':
        return { type: 'fehlersuche', tokens: g.tokens };
      case 'en_de_chunk':
        return { type: 'en_de_chunk', prompt: g.prompt ?? s.en ?? '', pos: lemma.pos };
      case 'umformen':
        return { type: 'umformen', instruction: g.instruction ?? 'dat_pl', source: g.source ?? '' };
      case 'satzbau': {
        // Shuffle the chunks deterministically so the order is no hint.
        const chunks = [...(g.chunks ?? [])].sort(
          (a, b) => hash(`${s.id}:${a}`) - hash(`${s.id}:${b}`),
        );
        return { type: 'satzbau', chunks, frame: g.frame ?? 'hauptsatz' };
      }
      case 'wer_tut_was':
        return { type: 'wer_tut_was', de: s.de, options: g.options ?? [] };
      case 'diktat':
        return {
          type: 'diktat',
          speak: s.de,
          words: g.tokens.filter((t) => /\p{L}/u.test(t)).length,
        };
      default:
        return {
          type: 'bedeutung',
          de: s.de,
          tokens: g.tokens,
          highlightIndex: g.highlight_index ?? 0,
          word: lemma.text,
          hint: (s.accepted[0] ?? '').charAt(0),
        };
    }
  }

  /** Every exercisable due facet, grouped by lemma, plus due skills. */
  private dueCards(
    userId: number,
    now: Date,
  ): { byLemma: Map<number, FacetKey[]>; skills: Set<FacetKey> } {
    const rows = this.db
      .prepare<[number, string], DueCard>(
        'SELECT facet_key, lemma_id, skill_id, fsrs FROM facet_card WHERE user_id = ? AND unlocked = 1 AND due <= ?',
      )
      .all(userId, now.toISOString());
    const byLemma = new Map<number, FacetKey[]>();
    const skills = new Set<FacetKey>();
    for (const r of rows) {
      if (!isDue(json<StoredCard>(r.fsrs) as StoredCard, now)) continue;
      if (r.lemma_id !== null) {
        const list = byLemma.get(r.lemma_id) ?? [];
        list.push(r.facet_key);
        byLemma.set(r.lemma_id, list);
      } else {
        skills.add(r.facet_key);
      }
    }
    return { byLemma, skills };
  }

  /** Facets a sentence covers, as facet keys. */
  covers(s: Sentence, lemma: Lemma): FacetKey[] {
    const f = sentenceFacets({
      lemmaId: lemma.id,
      targetFacet: s.targetFacet,
      exerciseType: s.exerciseType,
      skillIds: s.skillIds,
      features: s.gap.features ?? null,
      governor: s.gap.governed_by ?? null,
      nounIsWeak: lemma.noun ? lemma.noun.weak || lemma.noun.mixed : false,
    });
    return [
      ...f.lexical.map((x) => lemmaFacetKey(x.lemmaId, x.facet)),
      ...f.skills.map((x) => skillFacetKey(x)),
    ];
  }

  private lastSeen(userId: number): Map<number, string> {
    const rows = this.db
      .prepare<[number], { sentence_id: number; ts: string }>(
        'SELECT sentence_id, MAX(ts) AS ts FROM attempt WHERE user_id = ? GROUP BY sentence_id',
      )
      .all(userId);
    return new Map(rows.map((r) => [r.sentence_id, r.ts]));
  }

  introducedToday(userId: number, now: Date): Lemma[] {
    return this.db
      .prepare<[number, string], { lemma_id: number }>(
        "SELECT lemma_id FROM lemma_intro WHERE user_id = ? AND day_key = ? AND source = 'session'",
      )
      .all(userId, dayKey(now))
      .map((r) => this.repo.lemma(r.lemma_id))
      .filter((l): l is Lemma => l !== null);
  }

  build(userId: number, now: Date, opts: { reviewsOnly?: boolean } = {}): SessionPlan {
    const { byLemma, skills } = this.dueCards(userId, now);
    const seen = this.lastSeen(userId);

    // 1. Pick one sentence per lemma with due facets.
    interface Pick {
      lemma: Lemma;
      sentence: Sentence;
      covers: FacetKey[];
      options: { sentence: Sentence; covers: FacetKey[]; score: number }[];
    }
    const picks: Pick[] = [];
    let untrainable = 0;
    let dueCount = 0;
    for (const [lemmaId, due] of byLemma) {
      const lemma = this.repo.lemma(lemmaId);
      if (!lemma) continue;
      const options = this.repo
        .sentences(lemmaId)
        .map((sentence) => {
          const covers = this.covers(sentence, lemma);
          const score = covers.filter((k) => due.includes(k) || skills.has(k)).length;
          return { sentence, covers, score };
        })
        .filter((o) => o.covers.some((k) => due.includes(k)))
        .sort(
          (a, b) =>
            b.score - a.score ||
            (seen.get(a.sentence.id) ?? '').localeCompare(seen.get(b.sentence.id) ?? '') ||
            a.sentence.id - b.sentence.id,
        );
      const trainable = new Set(options.flatMap((o) => o.covers));
      untrainable += due.filter((k) => !trainable.has(k)).length;
      dueCount += due.filter((k) => trainable.has(k)).length;
      const best = options[0];
      if (best) picks.push({ lemma, sentence: best.sentence, covers: best.covers, options });
    }

    // 2. Cap each exercise type's share; fall back to the next best type.
    const cap = Math.max(2, Math.ceil(SESSION.MAX_EXERCISE_TYPE_SHARE * picks.length));
    const perType = new Map<ExerciseType, number>();
    const chosen: Pick[] = [];
    let deferred = 0;
    picks.sort((a, b) => (a.lemma.freqRank ?? 0) - (b.lemma.freqRank ?? 0));
    for (const p of picks) {
      const option = p.options.find((o) => (perType.get(o.sentence.exerciseType) ?? 0) < cap);
      if (!option) {
        deferred += 1;
        continue;
      }
      perType.set(
        option.sentence.exerciseType,
        (perType.get(option.sentence.exerciseType) ?? 0) + 1,
      );
      chosen.push({ ...p, sentence: option.sentence, covers: option.covers });
    }

    // 3. Interleave parts of speech (round robin), never the same lemma twice in a row.
    const buckets = new Map<string, Pick[]>();
    for (const p of chosen) buckets.set(p.lemma.pos, [...(buckets.get(p.lemma.pos) ?? []), p]);
    const items: SessionItem[] = [];
    while ([...buckets.values()].some((b) => b.length > 0)) {
      for (const bucket of buckets.values()) {
        const p = bucket.shift();
        if (!p) continue;
        items.push(this.exerciseItem(p.sentence, p.lemma, p.covers));
      }
    }

    // 4. New words, each followed a few items later by its first retrieval.
    const today = this.introducedToday(userId, now);
    let newRemaining = Math.max(0, this.newPerDay(now) - today.length);
    const retrievals: { item: ExerciseItem; gap: number }[] = [];
    if (!opts.reviewsOnly && newRemaining > 0) {
      const fields = new Set(today.map((l) => l.semanticField).filter((f) => f !== null));
      const introduced = new Set(
        this.db
          .prepare<[number], { lemma_id: number }>(
            'SELECT lemma_id FROM lemma_intro WHERE user_id = ?',
          )
          .all(userId)
          .map((r) => r.lemma_id),
      );
      const fresh: Lemma[] = [];
      for (const lemma of this.repo.coreDeck()) {
        if (fresh.length >= newRemaining) break;
        if (introduced.has(lemma.id)) continue;
        if (lemma.semanticField !== null && fields.has(lemma.semanticField)) continue;
        if (!this.repo.sentences(lemma.id).some((s) => s.exerciseType === 'bedeutung')) continue;
        fresh.push(lemma);
        if (lemma.semanticField !== null) fields.add(lemma.semanticField);
      }
      const span = SESSION.INTRO_REAPPEAR_MAX_ITEMS - SESSION.INTRO_REAPPEAR_MIN_ITEMS + 1;
      for (const lemma of fresh) {
        items.push({
          kind: 'intro',
          lemmaId: lemma.id,
          pos: lemma.pos,
          lemma: this.lemmaCard(lemma),
        });
        const retrieval = this.repo.sentences(lemma.id).find((s) => s.exerciseType === 'bedeutung');
        if (!retrieval) continue;
        retrievals.push({
          item: {
            ...this.exerciseItem(retrieval, lemma, [lemmaFacetKey(lemma.id, 'meaning_recv')]),
            afterIntro: true,
          },
          gap: SESSION.INTRO_REAPPEAR_MIN_ITEMS + (lemma.id % span),
        });
      }
      newRemaining -= fresh.length;
    }
    const ordered = placeRetrievals(items, retrievals);
    avoidRepeats(ordered);

    return {
      day: dayKey(now),
      dueCount,
      backlog: dueCount > SESSION.BACKLOG_THRESHOLD,
      newRemaining,
      items: ordered,
      deferred,
      untrainable,
    };
  }

  private exerciseItem(sentence: Sentence, lemma: Lemma, covers: FacetKey[]): ExerciseItem {
    return {
      kind: 'exercise',
      sentenceId: sentence.id,
      exerciseType: sentence.exerciseType,
      lemmaId: lemma.id,
      pos: lemma.pos,
      covers,
      prompt: this.prompt(sentence, lemma),
    };
  }
}

/**
 * Insert each retrieval `gap` items after its intro (spec §6: "after 3–5 other
 * items"); when the session is shorter, it goes last.
 */
function placeRetrievals(
  items: SessionItem[],
  retrievals: { item: ExerciseItem; gap: number }[],
): SessionItem[] {
  const out = [...items];
  for (const r of retrievals) {
    let introPos = out.findIndex((i) => i.kind === 'intro' && i.lemmaId === r.item.lemmaId);
    const shortBy = introPos + 1 + r.gap - out.length;
    if (shortBy > 0) {
      // Too few items after the intro: move the intro earlier instead.
      const [intro] = out.splice(introPos, 1);
      introPos = Math.max(0, introPos - shortBy);
      out.splice(introPos, 0, intro as SessionItem);
    }
    out.splice(Math.min(out.length, introPos + 1 + r.gap), 0, r.item);
  }
  return out;
}

/**
 * Swap items so the same lemma never appears twice in a row. A retrieval never
 * moves before its intro: only the earlier item of a pair is moved backwards.
 */
function avoidRepeats(items: SessionItem[]): void {
  const clash = (k: number, x: SessionItem | undefined): boolean =>
    x !== undefined && (items[k - 1]?.lemmaId === x.lemmaId || items[k + 1]?.lemmaId === x.lemmaId);
  for (let i = 1; i < items.length; i++) {
    if (items[i]?.lemmaId !== items[i - 1]?.lemmaId) continue;
    const later = items.findIndex(
      (x, k) =>
        k > i &&
        x.lemmaId !== items[i]?.lemmaId &&
        !clash(i, x) &&
        !(x.kind === 'exercise' && x.afterIntro),
    );
    if (later > i) {
      [items[i], items[later]] = [items[later] as SessionItem, items[i] as SessionItem];
      continue;
    }
    const prev = items[i - 1] as SessionItem;
    const earlier = items.findIndex(
      (x, k) => k < i - 1 && x.lemmaId !== prev.lemmaId && !clash(k, prev) && !clash(i - 1, x),
    );
    if (earlier >= 0) [items[i - 1], items[earlier]] = [items[earlier] as SessionItem, prev];
  }
}
