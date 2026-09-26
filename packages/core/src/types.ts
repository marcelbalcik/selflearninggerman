export type Gender = 'm' | 'f' | 'n';
export type Case = 'nom' | 'akk' | 'dat' | 'gen';
export type GramNumber = 'sg' | 'pl';

/** A column of the determiner table: a singular gender, or the plural. */
export type Slot = Gender | 'pl';

export const GENDERS: readonly Gender[] = ['m', 'f', 'n'];
export const CASES: readonly Case[] = ['nom', 'akk', 'dat', 'gen'];
export const SLOTS: readonly Slot[] = ['m', 'f', 'n', 'pl'];

/** Forms per case; each cell lists every accepted variant, preferred form first. */
export type CaseForms = Record<Case, string[]>;

/**
 * Declension of an adjectival noun after a kind of determiner: weak after
 * der-words, mixed after ein-words, strong with no determiner.
 */
export type AdjDecl = 'weak' | 'mixed' | 'strong';
export const ADJ_DECLS: readonly AdjDecl[] = ['weak', 'mixed', 'strong'];

/** A full noun form table (spec §4.1 `noun.forms`). */
export type Declension =
  | { kind: 'regular'; sg: CaseForms | null; pl: CaseForms | null }
  | {
      /** Adjectival nouns (`der/die Angestellte`) inflect by determiner type. */
      kind: 'adjectival';
      sg: Partial<Record<Gender, Record<AdjDecl, CaseForms>>>;
      pl: Record<AdjDecl, CaseForms> | null;
    };

/**
 * Stored grammatical data for one noun lemma (spec §4.1 `noun`), as the
 * declension engine consumes it. Never filled in by guesswork: the pipeline
 * copies it from Wiktionary or marks the lemma `needs_review`.
 */
export interface NounInput {
  /** Citation form: nominative singular; nominative plural for plural-only nouns;
   *  the form after `der`/`die`/`das` for adjectival nouns (`Angestellte`). */
  lemma: string;
  /** Null only for plural-only nouns. */
  gender: Gender | null;
  altGenders?: Gender[];
  /** Nominative plural variants, preferred first. Empty for `noPlural`. */
  plural: string[];
  pluralOnly?: boolean;
  noPlural?: boolean;
  /** Stored genitive singular variants (strong masculine/neuter nouns). */
  genSg?: string[];
  weak?: boolean;
  mixed?: boolean;
  adjectival?: boolean;
  /** Stored (Wiktionary) form table. When present it wins over the rule engine. */
  forms?: Declension;
}

export type LexicalFacet =
  | 'meaning_recv'
  | 'meaning_prod'
  | 'gender'
  | 'plural'
  | 'weak'
  | 'frame'
  | 'separable'
  | 'pp_aux'
  | 'stem_change';

export type CaseSkill =
  'case.akk.m' | 'case.dat.m' | 'case.dat.f' | 'case.dat.n' | 'case.dat.pl' | 'case.weak_noun';

export type PrepSkill = 'prep.dat' | 'prep.akk' | 'prep.wechsel.loc' | 'prep.wechsel.dir';

export type VerbSkill =
  'verb.sep.v2' | 'verb.sep.sub' | 'verb.sep.perf' | 'verb.sep.zu' | 'verb.insep.perf';

export type SkillId = CaseSkill | PrepSkill | VerbSkill;

/** `lemma:{id}:{facet}` or `skill:{id}` (spec §13 `facet_card.facet_key`). */
export type FacetKey = `lemma:${number}:${LexicalFacet}` | `skill:${SkillId}`;

export function lemmaFacetKey(lemmaId: number, facet: LexicalFacet): FacetKey {
  return `lemma:${lemmaId}:${facet}`;
}

export function skillFacetKey(skill: SkillId): FacetKey {
  return `skill:${skill}`;
}

/** FSRS ratings used in v1 (spec §5.3). Easy is never produced. */
export type Rating = 'again' | 'hard' | 'good';

export type ExerciseType =
  | 'kasus_luecke'
  | 'wer_tut_was'
  | 'satzbau'
  | 'umformen'
  | 'diktat'
  | 'en_de_chunk'
  | 'fehlersuche'
  | 'komposition'
  | 'bedeutung';
