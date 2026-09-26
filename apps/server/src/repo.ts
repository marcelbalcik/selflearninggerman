/** Typed read access to imported content. */
import type {
  Declension,
  ExerciseType,
  Gender,
  LemmaFacts,
  LexicalFacet,
  NounInput,
  SkillId,
} from '@wortduell/core';
import { json } from './db';
import type { Db } from './db';

export interface Lemma {
  id: number;
  pos: 'noun' | 'verb' | 'adj' | 'adv' | 'other';
  text: string;
  senseKey: string;
  gloss: string;
  glossesAccepted: string[];
  freqRank: number | null;
  semanticField: string | null;
  theme: string | null;
  track: string;
  status: string;
  noun: NounData | null;
  verb: VerbData | null;
}

export interface NounData {
  gender: Gender | null;
  altGenders: Gender[];
  plural: string[];
  pluralOnly: boolean;
  noPlural: boolean;
  genSg: string[];
  weak: boolean;
  mixed: boolean;
  adjectival: boolean;
  forms: Declension;
}

export interface VerbData {
  prefix: string | null;
  separable: boolean;
  dualPrefix: boolean;
  aux: string | null;
  partizip2: string | null;
  praeteritum3sg: string | null;
  praesens2sg: string | null;
  praesens3sg: string | null;
  stemChange: boolean | null;
  reflexive: string;
  frame: { objects: string[]; preps?: { prep: string; case: string }[] } | null;
  frameStatus: string;
  zuInfinitive: string | null;
}

export interface Sentence {
  id: number;
  lemmaId: number;
  targetFacet: LexicalFacet;
  skillIds: SkillId[];
  de: string;
  en: string | null;
  gap: Gap;
  accepted: string[];
  exerciseType: ExerciseType;
  status: string;
}

export interface Gap {
  tokens: string[];
  gap_index?: number;
  expected?: string;
  cue?: string;
  features?: { case: 'nom' | 'akk' | 'dat' | 'gen'; number: 'sg' | 'pl'; det: string };
  governed_by?: { type: 'verb' | 'prep'; text: string; lemma_id?: number | null } | null;
  error_index?: number;
  wrong?: string;
  correct?: string;
  highlight_index?: number;
}

interface LemmaRow {
  id: number;
  pos: Lemma['pos'];
  text: string;
  sense_key: string;
  gloss_en: string;
  glosses_accepted: string;
  freq_rank: number | null;
  semantic_field: string | null;
  theme: string | null;
  track: string;
  status: string;
}

interface NounRow {
  gender: Gender | null;
  alt_genders: string | null;
  plural: string | null;
  plural_only: number;
  no_plural: number;
  gen_sg: string | null;
  weak: number;
  mixed: number;
  adjectival: number;
  forms: string;
}

interface VerbRow {
  prefix: string | null;
  separable: number;
  dual_prefix: number;
  aux: string | null;
  partizip2: string | null;
  praeteritum_3sg: string | null;
  praesens_2sg: string | null;
  praesens_3sg: string | null;
  stem_change: number | null;
  reflexive: string;
  frame: string | null;
  frame_status: string;
  zu_infinitive: string | null;
}

interface SentenceRow {
  id: number;
  lemma_id: number;
  target_facet: LexicalFacet;
  skill_ids: string;
  de: string;
  en: string | null;
  gap: string;
  accepted: string;
  exercise_types: string;
  status: string;
}

/** Content changes only at startup, so lemmas are cached per process. */
export class Repo {
  private lemmas = new Map<number, Lemma>();
  private sentencesByLemma = new Map<number, Sentence[]>();

  constructor(private readonly db: Db) {}

  reset(): void {
    this.lemmas.clear();
    this.sentencesByLemma.clear();
  }

  lemma(id: number): Lemma | null {
    const hit = this.lemmas.get(id);
    if (hit) return hit;
    const row = this.db.prepare<[number], LemmaRow>('SELECT * FROM lemma WHERE id = ?').get(id);
    if (!row) return null;
    const lemma: Lemma = {
      id: row.id,
      pos: row.pos,
      text: row.text,
      senseKey: row.sense_key,
      gloss: row.gloss_en,
      glossesAccepted: json<string[]>(row.glosses_accepted) ?? [],
      freqRank: row.freq_rank,
      semanticField: row.semantic_field,
      theme: row.theme,
      track: row.track,
      status: row.status,
      noun: null,
      verb: null,
    };
    if (row.pos === 'noun') {
      const n = this.db.prepare<[number], NounRow>('SELECT * FROM noun WHERE lemma_id = ?').get(id);
      if (n) {
        lemma.noun = {
          gender: n.gender,
          altGenders: json<Gender[]>(n.alt_genders) ?? [],
          plural: json<string[]>(n.plural) ?? [],
          pluralOnly: n.plural_only === 1,
          noPlural: n.no_plural === 1,
          genSg: json<string[]>(n.gen_sg) ?? [],
          weak: n.weak === 1,
          mixed: n.mixed === 1,
          adjectival: n.adjectival === 1,
          forms: json<Declension>(n.forms) as Declension,
        };
      }
    }
    if (row.pos === 'verb') {
      const v = this.db.prepare<[number], VerbRow>('SELECT * FROM verb WHERE lemma_id = ?').get(id);
      if (v) {
        lemma.verb = {
          prefix: v.prefix,
          separable: v.separable === 1,
          dualPrefix: v.dual_prefix === 1,
          aux: v.aux,
          partizip2: v.partizip2,
          praeteritum3sg: v.praeteritum_3sg,
          praesens2sg: v.praesens_2sg,
          praesens3sg: v.praesens_3sg,
          stemChange: v.stem_change === null ? null : v.stem_change === 1,
          reflexive: v.reflexive,
          frame: json<VerbData['frame']>(v.frame),
          frameStatus: v.frame_status,
          zuInfinitive: v.zu_infinitive,
        };
      }
    }
    this.lemmas.set(id, lemma);
    return lemma;
  }

  /** Usable sentences of a lemma (status ok, not retired). Not cached: reports change status. */
  sentences(lemmaId: number): Sentence[] {
    return this.db
      .prepare<[number], SentenceRow>(
        "SELECT * FROM sentence WHERE lemma_id = ? AND status = 'ok' AND retired = 0",
      )
      .all(lemmaId)
      .map(toSentence);
  }

  sentence(id: number): Sentence | null {
    const row = this.db
      .prepare<[number], SentenceRow>('SELECT * FROM sentence WHERE id = ?')
      .get(id);
    return row ? toSentence(row) : null;
  }

  /** Core-deck lemmas in frequency order. */
  coreDeck(): Lemma[] {
    return this.db
      .prepare<[], { id: number }>(
        "SELECT id FROM lemma WHERE track = 'core' AND status = 'ok' AND retired = 0 ORDER BY freq_rank, id",
      )
      .all()
      .map((r) => this.lemma(r.id))
      .filter((l): l is Lemma => l !== null);
  }
}

function toSentence(r: SentenceRow): Sentence {
  return {
    id: r.id,
    lemmaId: r.lemma_id,
    targetFacet: r.target_facet,
    skillIds: json<SkillId[]>(r.skill_ids) ?? [],
    de: r.de,
    en: r.en,
    gap: json<Gap>(r.gap) as Gap,
    accepted: json<string[]>(r.accepted) ?? [],
    exerciseType: (json<ExerciseType[]>(r.exercise_types) ?? [])[0] as ExerciseType,
    status: r.status,
  };
}

/** The declension engine's input, with the stored table (which wins). */
export function nounInput(lemma: Lemma): NounInput {
  const n = lemma.noun as NounData;
  return {
    lemma: lemma.text,
    gender: n.gender,
    altGenders: n.altGenders,
    plural: n.plural,
    pluralOnly: n.pluralOnly,
    noPlural: n.noPlural,
    genSg: n.genSg,
    weak: n.weak,
    mixed: n.mixed,
    adjectival: n.adjectival,
    forms: n.forms,
  };
}

export function lemmaFacts(lemma: Lemma): LemmaFacts {
  return {
    pos: lemma.pos,
    ...(lemma.noun
      ? {
          noun: {
            weak: lemma.noun.weak,
            mixed: lemma.noun.mixed,
            pluralOnly: lemma.noun.pluralOnly,
            noPlural: lemma.noun.noPlural,
          },
        }
      : {}),
    ...(lemma.verb
      ? {
          verb: {
            separable: lemma.verb.separable,
            dualPrefix: lemma.verb.dualPrefix,
            stemChange: lemma.verb.stemChange,
            frame: lemma.verb.frame,
            frameApproved: lemma.verb.frameStatus === 'approved',
          },
        }
      : {}),
  };
}
