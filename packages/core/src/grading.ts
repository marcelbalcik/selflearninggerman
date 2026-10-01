/**
 * Grading and error classification for noun-phrase answers (spec §7).
 *
 * The classifier follows §7.3 step by step: number error first, then wrong
 * word, correct, wrong determiner (case / gender / ambiguous / det), and
 * finally a correct determiner with a wrong noun ending (weak / dative plural
 * / plural). An answer can carry a secondary class when the noun ending is
 * wrong on top of the determiner (`den Nachbar` for `dem Nachbarn`).
 */
import { GRADING } from './config';
import { allFormCells, nounForms, renderNp } from './declension';
import type { FormCell, NpForm } from './declension';
import { CONTRACTIONS, adjDeclAfter, contract, detCells, detClassesOf } from './determiners';
import type { DetCell, DetClass } from './determiners';
import { alignWord, foldForCompare, isToleratedTypo, normalizeAnswer } from './normalize';
import type { Case, Gender, GramNumber, NounInput, Slot } from './types';
import { CASES } from './types';

export interface NpTarget {
  noun: NounInput;
  num: GramNumber;
  case: Case;
  /** Determiner class the cue asks for; null for no determiner. */
  det: DetClass | null;
  /** Expected referent gender for adjectival or alternative-gender nouns (default: any). */
  gender?: Gender;
  /** Preposition that is part of the expected answer (`mit dem Kollegen`). */
  prep?: string;
}

export type NpErrorClass =
  | 'no_answer'
  | 'prep_error'
  | 'number_error'
  | 'wrong_word'
  | 'case_error'
  | 'gender_error'
  | 'ambiguous'
  | 'det_error'
  | 'weak_error'
  | 'datpl_error'
  | 'plural_error'
  | 'ending_error'
  | 'extra_words';

export type GradeNote = 'typo_tolerated' | 'noun_lowercase' | 'umlaut_spelling' | 'eszett_spelling';

export interface NpGrade {
  correct: boolean;
  /** Primary error class; null when correct. */
  errorClass: NpErrorClass | null;
  /** Further classes, e.g. `weak_error` next to a `case_error`. */
  secondary: NpErrorClass[];
  /** The preferred correct answer. */
  expected: string;
  /** The answer after normalisation (§7.1). */
  answer: string;
  notes: GradeNote[];
  typoTolerated: boolean;
  /** For `ambiguous`: the one-tap gender follow-up; settle it with `resolveAmbiguous`. */
  followUp: { kind: 'gender'; lemma: string; options: Gender[] } | null;
  /** Cells the typed determiner can realise in the target class and number (for the log). */
  detCandidates: { caseCells: DetCell[]; genderCells: DetCell[] } | null;
}

interface ParsedAnswer {
  prep: string | null;
  det: string | null;
  noun: string | null;
  extraWords: boolean;
}

const CONTRACTIONS_FOLDED = new Map(
  Object.entries(CONTRACTIONS).map(([k, v]) => [foldForCompare(k), v] as const),
);

function expandContractions(tokens: string[]): string[] {
  return tokens.flatMap((t) => {
    const expanded = CONTRACTIONS_FOLDED.get(foldForCompare(t));
    return expanded ? [...expanded] : [t];
  });
}

function tokenize(s: string): string[] {
  const norm = normalizeAnswer(s);
  return norm === '' ? [] : expandContractions(norm.split(' '));
}

function sameWord(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return foldForCompare(a) === foldForCompare(b);
}

/** How the typed noun relates to one known form. */
type NounMatch = 'exact' | 'typo' | null;

/**
 * Typo tolerance is off when the typed word is itself a form of the lemma:
 * `Mutter` for `Mütter` is one substitution before the ending, but it is the
 * singular, a grammatical error rather than a slip.
 */
function matchNoun(form: string, typed: string, allowTypo = true): NounMatch {
  const al = alignWord(form, typed);
  if (al.distance === 0) return 'exact';
  return allowTypo && isToleratedTypo(form, typed, al) ? 'typo' : null;
}

function nounGenders(noun: NounInput): Gender[] {
  if (noun.gender === null) return [];
  return [...new Set([noun.gender, ...(noun.altGenders ?? [])])];
}

function targetGenders(target: NpTarget): Gender[] {
  return target.gender !== undefined ? [target.gender] : nounGenders(target.noun);
}

function slotIsTargetNumber(slot: Slot, num: GramNumber): boolean {
  return num === 'pl' ? slot === 'pl' : slot !== 'pl';
}

function acceptedForms(target: NpTarget): NpForm[] {
  return renderNp(target.noun, {
    num: target.num,
    case: target.case,
    det: target.det,
    ...(target.gender !== undefined ? { gender: target.gender } : {}),
  });
}

/** Whether det + noun is one of these renderings, and how the noun matched. */
function matchNp(forms: NpForm[], det: string | null, noun: string, allowTypo: boolean): NounMatch {
  let best: NounMatch = null;
  for (const f of forms) {
    if (!sameWord(f.det, det)) continue;
    const m = matchNoun(f.noun, noun, allowTypo);
    if (m === 'exact') return 'exact';
    if (m === 'typo') best = 'typo';
  }
  return best;
}

/** The determiner class used in the other number (`ein` has no plural). */
function otherNumberDet(det: DetClass | null, otherNum: GramNumber): DetClass | null {
  if (otherNum === 'pl') return det === 'indef' ? null : det;
  return det === null ? 'indef' : det;
}

/**
 * Whether the noun looks like an attempt at a form of this lemma even though
 * it matches none (`Kinde`, `Mutters`): the singular stem or a plural form
 * followed by at most a few ending letters.
 */
function looksLikeAttempt(noun: NounInput, typed: string): boolean {
  const t = foldForCompare(typed);
  const stems = [noun.lemma, noun.lemma.replace(/e$/u, ''), ...noun.plural]
    .map(foldForCompare)
    .filter((s) => s.length >= GRADING.ATTEMPTED_FORM_MIN_STEM);
  return stems.some((s) => {
    if (!t.startsWith(s)) return false;
    const rest = t.slice(s.length);
    return rest.length <= GRADING.ATTEMPTED_FORM_MAX_EXTRA_CHARS && /^[enrs]*$/u.test(rest);
  });
}

function parse(answer: string, target: NpTarget, expectedTokens: string[]): ParsedAnswer {
  const tokens = tokenize(answer);
  let prep: string | null = null;
  if (target.prep !== undefined) {
    const first = tokens[0] ?? null;
    if (sameWord(first, target.prep) || tokens.length >= expectedTokens.length) {
      prep = tokens.shift() ?? null;
    }
  }
  const noun = tokens.length > 0 ? (tokens[tokens.length - 1] ?? null) : null;
  const det = tokens.length >= 2 ? (tokens[0] ?? null) : null;
  return { prep, det, noun, extraWords: tokens.length > 2 };
}

function notesFor(expectedNoun: string, typedNoun: string, typo: boolean): GradeNote[] {
  const notes: GradeNote[] = [];
  if (typo) notes.push('typo_tolerated');
  const al = alignWord(expectedNoun, typedNoun);
  const first = typedNoun[0];
  if (first !== undefined && expectedNoun[0] !== first && first === first.toLowerCase()) {
    notes.push('noun_lowercase');
  }
  if (al.notes.includes('umlaut')) notes.push('umlaut_spelling');
  if (al.notes.includes('eszett')) notes.push('eszett_spelling');
  return notes;
}

/**
 * Class of a wrong noun under a correct determiner (§7.3 step 4), also used
 * for the secondary class when the determiner is wrong as well.
 */
function nounEndingClass(
  target: NpTarget,
  typed: string,
  matched: FormCell[],
  allowTypo: boolean,
): 'weak_error' | 'datpl_error' | 'plural_error' | 'ending_error' {
  const { noun } = target;
  const matchesAny = (forms: string[]): boolean =>
    forms.some((f) => matchNoun(f, typed, allowTypo) !== null);
  if (
    (noun.weak === true || noun.mixed === true) &&
    target.num === 'sg' &&
    target.case !== 'nom' &&
    matchesAny(nounForms(noun, { num: 'sg', case: 'nom' }))
  ) {
    return 'weak_error';
  }
  if (target.num === 'pl') {
    const nomPl = nounForms(noun, { num: 'pl', case: 'nom', decl: adjDeclAfter(target.det, 'pl') });
    const datPl = nounForms(noun, { num: 'pl', case: 'dat', decl: adjDeclAfter(target.det, 'pl') });
    const missingN = nomPl.filter((p) => !datPl.includes(p));
    if (target.case === 'dat' && matchesAny(missingN)) return 'datpl_error';
    if (!matched.some((c) => c.num === 'pl')) return 'plural_error';
  }
  return 'ending_error';
}

/**
 * Whether the typed noun fits some cell the typed determiner realises in the
 * target number. If it does, the noun follows the user's own (wrong) case or
 * gender choice and carries no separate error.
 */
function nounFitsTypedDet(
  target: NpTarget,
  det: string,
  typed: string,
  allowTypo: boolean,
): boolean {
  for (const cls of detClassesOf(det)) {
    for (const cell of detCells(det, cls)) {
      if (!slotIsTargetNumber(cell.slot, target.num)) continue;
      const forms = nounForms(target.noun, {
        num: target.num,
        case: cell.case,
        ...(cell.slot !== 'pl' ? { gender: cell.slot } : {}),
        decl: adjDeclAfter(cls, cell.slot),
      });
      if (forms.some((f) => matchNoun(f, typed, allowTypo) !== null)) return true;
    }
  }
  return false;
}

function result(
  target: NpTarget,
  answer: string,
  partial: Partial<NpGrade> & Pick<NpGrade, 'correct' | 'errorClass'>,
): NpGrade {
  const expected = acceptedForms(target)[0];
  let expectedText = expected?.text ?? '';
  if (expected !== undefined && target.prep !== undefined) {
    const contracted = expected.det === null ? null : contract(target.prep, expected.det);
    expectedText = contracted
      ? `${contracted} ${expected.noun}`
      : `${target.prep} ${expected.text}`;
  }
  return {
    secondary: [],
    notes: [],
    typoTolerated: false,
    followUp: null,
    detCandidates: null,
    expected: expectedText,
    answer: normalizeAnswer(answer),
    ...partial,
  };
}

/** Grade and classify a typed noun-phrase answer against its target (§7.3). */
export function gradeNp(target: NpTarget, answer: string): NpGrade {
  const { noun } = target;
  const accepted = acceptedForms(target);
  const expected = accepted[0];
  const expectedTokens = tokenize(expected?.text ?? '');
  if (target.prep !== undefined) expectedTokens.unshift(target.prep);

  const parsed = parse(answer, target, expectedTokens);
  if (parsed.noun === null)
    return result(target, answer, { correct: false, errorClass: 'no_answer' });

  const typed = parsed.noun;
  const typedDet = parsed.det;
  const prepWrong = target.prep !== undefined && !sameWord(parsed.prep, target.prep);
  const withPrep = (g: NpGrade): NpGrade => {
    if (!prepWrong) return g;
    const secondary = g.errorClass === null ? g.secondary : [g.errorClass, ...g.secondary];
    return { ...g, correct: false, errorClass: 'prep_error', secondary, followUp: null };
  };

  const cells = allFormCells(noun);
  const exactCells = cells.filter((c) => matchNoun(c.form, typed) === 'exact');
  const allowTypo = exactCells.length === 0;
  const matchedCells =
    exactCells.length > 0 ? exactCells : cells.filter((c) => matchNoun(c.form, typed) === 'typo');

  // Step 0: a valid NP in the other number that cannot be read as the target number.
  const otherNum: GramNumber = target.num === 'sg' ? 'pl' : 'sg';
  const otherForms = renderNp(noun, {
    num: otherNum,
    case: target.case,
    det: otherNumberDet(target.det, otherNum),
  });
  if (!parsed.extraWords && matchNp(otherForms, typedDet, typed, allowTypo) !== null) {
    const readableAsTarget = CASES.some(
      (c) =>
        matchNp(
          renderNp(noun, { num: target.num, case: c, det: target.det }),
          typedDet,
          typed,
          allowTypo,
        ) !== null,
    );
    if (!readableAsTarget) {
      return withPrep(result(target, answer, { correct: false, errorClass: 'number_error' }));
    }
  }

  // Step 1: the noun matches no form of the lemma, even with typo tolerance.
  if (matchedCells.length === 0 && !looksLikeAttempt(noun, typed)) {
    return withPrep(result(target, answer, { correct: false, errorClass: 'wrong_word' }));
  }

  // Step 2: determiner and noun both correct.
  const npMatch = matchNp(accepted, typedDet, typed, allowTypo);
  if (npMatch !== null) {
    const form = accepted.find(
      (f) => sameWord(f.det, typedDet) && matchNoun(f.noun, typed, allowTypo) !== null,
    );
    const typo = npMatch === 'typo';
    const base = {
      notes: notesFor(form?.noun ?? typed, typed, typo),
      typoTolerated: typo,
    };
    if (parsed.extraWords) {
      return withPrep(
        result(target, answer, { correct: false, errorClass: 'extra_words', ...base }),
      );
    }
    return withPrep(result(target, answer, { correct: true, errorClass: null, ...base }));
  }

  const detCorrect = accepted.some((f) => sameWord(f.det, typedDet));
  if (detCorrect) {
    // Step 4: correct determiner, wrong noun ending.
    return withPrep(
      result(target, answer, {
        correct: false,
        errorClass: nounEndingClass(target, typed, matchedCells, allowTypo),
      }),
    );
  }

  // Step 3: wrong determiner.
  const secondary: NpErrorClass[] = [];
  const nounRight = accepted.some((f) => matchNoun(f.noun, typed, allowTypo) !== null);
  if (!nounRight && (typedDet === null || !nounFitsTypedDet(target, typedDet, typed, allowTypo))) {
    secondary.push(nounEndingClass(target, typed, matchedCells, allowTypo));
  }
  if (target.det === null || typedDet === null) {
    return withPrep(result(target, answer, { correct: false, errorClass: 'det_error', secondary }));
  }
  const genders = targetGenders(target);
  const inNumber = detCells(typedDet, target.det).filter((c) =>
    slotIsTargetNumber(c.slot, target.num),
  );
  const isTargetGender = (slot: Slot): boolean => slot === 'pl' || genders.includes(slot);
  const caseCells = inNumber.filter((c) => isTargetGender(c.slot) && c.case !== target.case);
  const genderCells = inNumber.filter((c) => !isTargetGender(c.slot) && c.case === target.case);
  const detCandidates = { caseCells, genderCells };
  let errorClass: NpErrorClass;
  if (caseCells.length > 0 && genderCells.length > 0) errorClass = 'ambiguous';
  else if (caseCells.length > 0) errorClass = 'case_error';
  else if (genderCells.length > 0) errorClass = 'gender_error';
  else errorClass = 'det_error';
  const followUp =
    errorClass === 'ambiguous'
      ? { kind: 'gender' as const, lemma: noun.lemma, options: ['m', 'f', 'n'] as Gender[] }
      : null;
  return withPrep(
    result(target, answer, { correct: false, errorClass, secondary, followUp, detCandidates }),
  );
}

/**
 * Settle an `ambiguous` grade with the user's answer to "Genus von …?": the
 * right gender means the case was wrong, a wrong gender means the gender was.
 */
export function resolveAmbiguous(grade: NpGrade, target: NpTarget, chosen: Gender): NpGrade {
  if (grade.errorClass !== 'ambiguous') return grade;
  const errorClass: NpErrorClass = targetGenders(target).includes(chosen)
    ? 'case_error'
    : 'gender_error';
  return { ...grade, errorClass, followUp: null };
}
