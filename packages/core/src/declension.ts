/**
 * Declension engine (spec §4.2). It rebuilds a noun's full form table from the
 * stored headword data (gender, plural, flags) so the pipeline can cross-check
 * it against the Wiktionary table. The ending rules are a fallback and a
 * cross-check only: a stored table (`NounInput.forms`) always wins.
 */
import { adjDeclAfter, determiner } from './determiners';
import type { DetClass } from './determiners';
import type {
  AdjDecl,
  Case,
  CaseForms,
  Declension,
  Gender,
  GramNumber,
  NounInput,
  Slot,
} from './types';
import { ADJ_DECLS, CASES } from './types';

/** Singular oblique forms of weak nouns that the ending rule cannot produce. */
const IRREGULAR_WEAK_OBLIQUE: Readonly<Record<string, string>> = { Herr: 'Herrn' };

const VOWEL = 'aeiouyäöü';
const NUCLEUS_PAIRS = new Set(['ai', 'au', 'äu', 'ei', 'eu', 'ie', 'aa', 'ee', 'oo']);

/**
 * Approximate syllable count: vowel runs, with diphthongs and long-vowel
 * digraphs counted once (`Bauer` → 2, `Knie` → 1). Used for the gender-rule
 * minimum (spec §4.4) and genitive plausibility, where an estimate suffices.
 */
export function syllableCount(word: string): number {
  const w = word.toLowerCase();
  let count = 0;
  let i = 0;
  while (i < w.length) {
    const ch = w[i] ?? '';
    if (!VOWEL.includes(ch)) {
      i += 1;
      continue;
    }
    count += 1;
    i += NUCLEUS_PAIRS.has(w.slice(i, i + 2)) ? 2 : 1;
  }
  return count;
}

function uniform(forms: string[]): CaseForms {
  return { nom: forms, akk: forms, dat: forms, gen: forms };
}

/**
 * Dative plural. The spec's rule is "-n unless the plural ends in -n or -s,
 * Latin/Greek -a plurals unchanged". Checked against Wiktionary (M1), the
 * precise rule is narrower: -n attaches only to plurals ending in -e, -el or
 * -er (`Tischen`, `Äpfeln`, `Kindern`). Every other ending stays unchanged:
 * -n/-s (`Frauen`, `Autos`), vowels (`Praktika`, `Celli`) and the zero
 * plurals of measure nouns after numerals (`zwei Stück`, `mit zehn Euro`).
 */
export function dativePlural(plural: string): string {
  return /(?:e|el|er)$/u.test(plural) ? `${plural}n` : plural;
}

/** Singular akk/dat/gen stem of a weak noun, and the base of mixed ones: `-(e)n`. */
function weakOblique(noun: NounInput): string {
  const irregular = IRREGULAR_WEAK_OBLIQUE[noun.lemma];
  if (irregular !== undefined) return irregular;
  // The plural of a weak noun is its oblique singular (Nachbar → Nachbarn,
  // Student → Studenten); this settles -n vs -en, which depends on stress.
  const fromPlural = noun.plural.find((p) => p === `${noun.lemma}n` || p === `${noun.lemma}en`);
  if (fromPlural !== undefined) return fromPlural;
  return noun.lemma.endsWith('e') ? `${noun.lemma}n` : `${noun.lemma}en`;
}

/**
 * Genitive singular forms the rules allow for a strong masculine or neuter
 * noun: `-s`, `-es` or unchanged (`des September`), plus `-ses` after a final
 * -s (`des Busses`, `des Ergebnisses`). Which of these a noun takes depends on
 * stress and usage, which the rules cannot see, so this is only a
 * plausibility set for stored data (M1 showed that stricter guesses reject
 * valid forms such as `Beispieles`, `Königes`).
 */
export function strongGenitiveCandidates(lemma: string): string[] {
  const out = [`${lemma}s`, `${lemma}es`, lemma];
  if (/s$/u.test(lemma)) out.push(`${lemma}ses`);
  return out;
}

function regularSingular(noun: NounInput): CaseForms {
  const { lemma, gender } = noun;
  if (noun.weak === true || noun.mixed === true) {
    const oblique = weakOblique(noun);
    if (noun.mixed === true) {
      // der Name → den Namen, des Namens; das Herz → das Herz, dem Herzen, des Herzens.
      return {
        nom: [lemma],
        akk: [gender === 'n' ? lemma : oblique],
        dat: [oblique],
        gen: [`${oblique}s`],
      };
    }
    return { nom: [lemma], akk: [oblique], dat: [oblique], gen: [oblique] };
  }
  if (gender === 'f') return uniform([lemma]);
  // Strong masculine/neuter: only the genitive changes, and only stored forms
  // are shown. The archaic dative -e (dem Hause) is never produced.
  return { nom: [lemma], akk: [lemma], dat: [lemma], gen: noun.genSg ?? [] };
}

function pluralForms(noun: NounInput): string[] {
  if (noun.pluralOnly === true && noun.plural.length === 0) return [noun.lemma];
  return noun.plural;
}

function regularPlural(noun: NounInput): CaseForms | null {
  if (noun.noPlural === true) return null;
  const forms = pluralForms(noun);
  if (forms.length === 0) return null;
  return { nom: forms, akk: forms, dat: dedupe(forms.map(dativePlural)), gen: forms };
}

const ADJ_ENDINGS: Record<AdjDecl, Record<Case, Record<Slot, string>>> = {
  weak: {
    nom: { m: 'e', f: 'e', n: 'e', pl: 'en' },
    akk: { m: 'en', f: 'e', n: 'e', pl: 'en' },
    dat: { m: 'en', f: 'en', n: 'en', pl: 'en' },
    gen: { m: 'en', f: 'en', n: 'en', pl: 'en' },
  },
  mixed: {
    nom: { m: 'er', f: 'e', n: 'es', pl: 'en' },
    akk: { m: 'en', f: 'e', n: 'es', pl: 'en' },
    dat: { m: 'en', f: 'en', n: 'en', pl: 'en' },
    gen: { m: 'en', f: 'en', n: 'en', pl: 'en' },
  },
  strong: {
    nom: { m: 'er', f: 'e', n: 'es', pl: 'e' },
    akk: { m: 'en', f: 'e', n: 'es', pl: 'e' },
    dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
    gen: { m: 'en', f: 'er', n: 'en', pl: 'er' },
  },
};

function adjectivalStem(noun: NounInput): string {
  return noun.lemma.endsWith('e') ? noun.lemma.slice(0, -1) : noun.lemma;
}

function adjectivalForms(stem: string, slot: Slot): Record<AdjDecl, CaseForms> {
  const byDecl = {} as Record<AdjDecl, CaseForms>;
  for (const decl of ADJ_DECLS) {
    const forms = {} as CaseForms;
    for (const kase of CASES) forms[kase] = [stem + ADJ_ENDINGS[decl][kase][slot]];
    byDecl[decl] = forms;
  }
  return byDecl;
}

function nounGenders(noun: NounInput): Gender[] {
  if (noun.gender === null) return [];
  return dedupe([noun.gender, ...(noun.altGenders ?? [])]);
}

/** The form table derived purely from the ending rules. */
export function declineByRules(noun: NounInput): Declension {
  if (noun.adjectival === true) {
    const stem = adjectivalStem(noun);
    const sg: Partial<Record<Gender, Record<AdjDecl, CaseForms>>> = {};
    if (noun.pluralOnly !== true) {
      for (const g of nounGenders(noun)) sg[g] = adjectivalForms(stem, g);
    }
    return {
      kind: 'adjectival',
      sg,
      pl: noun.noPlural === true ? null : adjectivalForms(stem, 'pl'),
    };
  }
  return {
    kind: 'regular',
    sg: noun.pluralOnly === true ? null : regularSingular(noun),
    pl: regularPlural(noun),
  };
}

/** The noun's form table: the stored table when present, else the rules. */
export function declension(noun: NounInput): Declension {
  return noun.forms ?? declineByRules(noun);
}

export interface FormQuery {
  num: GramNumber;
  case: Case;
  /** For adjectival nouns: the referent's gender (default: the lemma's gender). */
  gender?: Gender;
  /** For adjectival nouns: the declension after the determiner (default: weak). */
  decl?: AdjDecl;
}

/** Accepted forms of the noun itself for one cell; empty if the cell does not exist. */
export function nounForms(noun: NounInput, q: FormQuery): string[] {
  const table = declension(noun);
  if (table.kind === 'regular') return (q.num === 'sg' ? table.sg : table.pl)?.[q.case] ?? [];
  const decl = q.decl ?? 'weak';
  if (q.num === 'pl') return table.pl?.[decl][q.case] ?? [];
  const gender = q.gender ?? noun.gender;
  if (gender === null) return [];
  return table.sg[gender]?.[decl][q.case] ?? [];
}

export interface NpSpec {
  num: GramNumber;
  case: Case;
  /** Determiner class, or null for no determiner. */
  det: DetClass | null;
  /** Restrict to one gender (adjectival or alternative-gender nouns). */
  gender?: Gender;
}

export interface NpForm {
  det: string | null;
  noun: string;
  text: string;
  num: GramNumber;
  case: Case;
  /** Singular gender the determiner realises; null in the plural. */
  gender: Gender | null;
}

/**
 * Every accepted determiner + noun rendering of a cell, preferred first.
 * Alternative genders (`der/das Joghurt`) are included unless `gender` is set.
 * The indefinite plural has no article: `(unbestimmt, Pl.)` → `Kindern`.
 */
export function renderNp(noun: NounInput, spec: NpSpec): NpForm[] {
  const genders: (Gender | null)[] =
    spec.num === 'pl' ? [null] : spec.gender !== undefined ? [spec.gender] : nounGenders(noun);
  const out: NpForm[] = [];
  for (const gender of genders) {
    const slot: Slot = gender ?? 'pl';
    const det = spec.det === null ? null : determiner(spec.det, slot, spec.case);
    const detClass = det === null ? null : spec.det;
    const forms = nounForms(noun, {
      num: spec.num,
      case: spec.case,
      ...(gender !== null ? { gender } : {}),
      decl: adjDeclAfter(detClass, slot),
    });
    for (const form of forms) {
      const text = det === null ? form : `${det} ${form}`;
      if (!out.some((f) => f.text === text)) {
        out.push({ det, noun: form, text, num: spec.num, case: spec.case, gender });
      }
    }
  }
  return out;
}

/** One noun form with the cell it realises. */
export interface FormCell {
  form: string;
  num: GramNumber;
  case: Case;
  /** Singular gender for adjectival nouns; null otherwise. */
  gender: Gender | null;
  /** Declension type for adjectival nouns; null otherwise. */
  decl: AdjDecl | null;
}

/** Every form of the noun with the cells it realises. */
export function allFormCells(noun: NounInput): FormCell[] {
  const table = declension(noun);
  const cells: FormCell[] = [];
  const add = (
    forms: CaseForms | null | undefined,
    num: GramNumber,
    gender: Gender | null,
    decl: AdjDecl | null,
  ): void => {
    if (!forms) return;
    for (const kase of CASES) {
      for (const form of forms[kase]) cells.push({ form, num, case: kase, gender, decl });
    }
  };
  if (table.kind === 'regular') {
    add(table.sg, 'sg', null, null);
    add(table.pl, 'pl', null, null);
    return cells;
  }
  for (const [gender, byDecl] of Object.entries(table.sg) as [
    Gender,
    Record<AdjDecl, CaseForms>,
  ][]) {
    for (const decl of ADJ_DECLS) add(byDecl[decl], 'sg', gender, decl);
  }
  for (const decl of ADJ_DECLS) add(table.pl?.[decl], 'pl', null, decl);
  return cells;
}

/** Definite-article rows for the declension strip on every noun display (spec §1.4). */
export interface DisplayTable {
  sg: Record<Case, string> | null;
  pl: Record<Case, string> | null;
}

export function displayTable(noun: NounInput): DisplayTable {
  const row = (num: GramNumber): Record<Case, string> | null => {
    const out = {} as Record<Case, string>;
    let found = false;
    for (const kase of CASES) {
      const np = renderNp(noun, {
        num,
        case: kase,
        det: 'def',
        ...(noun.gender !== null ? { gender: noun.gender } : {}),
      })[0];
      found ||= np !== undefined;
      // A missing stored form (e.g. no genitive yet) shows as a dash, not a guess.
      out[kase] = np?.text ?? '–';
    }
    return found ? out : null;
  };
  return { sg: noun.pluralOnly === true ? null : row('sg'), pl: row('pl') };
}

export type NounIssue =
  | 'gender_missing'
  | 'plural_missing'
  | 'plural_only_and_no_plural'
  | 'weak_and_mixed'
  | 'weak_not_masculine'
  | 'adjectival_lemma_without_e'
  | 'gen_sg_missing'
  | 'gen_sg_implausible'
  | 'alt_gender_repeats_gender';

/** Structural problems in stored noun data; any issue sends the lemma to review. */
export function checkNoun(noun: NounInput): NounIssue[] {
  const issues: NounIssue[] = [];
  if (noun.gender === null && noun.pluralOnly !== true) issues.push('gender_missing');
  if (noun.pluralOnly === true && noun.noPlural === true) issues.push('plural_only_and_no_plural');
  if (noun.plural.length === 0 && noun.noPlural !== true && noun.pluralOnly !== true) {
    issues.push('plural_missing');
  }
  if (noun.weak === true && noun.mixed === true) issues.push('weak_and_mixed');
  if (noun.weak === true && noun.gender !== 'm') issues.push('weak_not_masculine');
  if (noun.adjectival === true && !noun.lemma.endsWith('e'))
    issues.push('adjectival_lemma_without_e');
  if (noun.gender !== null && noun.altGenders?.includes(noun.gender) === true) {
    issues.push('alt_gender_repeats_gender');
  }
  const strong =
    noun.adjectival !== true &&
    noun.weak !== true &&
    noun.mixed !== true &&
    noun.pluralOnly !== true &&
    (noun.gender === 'm' || noun.gender === 'n');
  if (strong) {
    if (noun.genSg === undefined || noun.genSg.length === 0) issues.push('gen_sg_missing');
    else {
      const allowed = strongGenitiveCandidates(noun.lemma);
      if (!noun.genSg.every((g) => allowed.includes(g))) issues.push('gen_sg_implausible');
    }
  }
  return issues;
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
