/**
 * Grading for `bedeutung` (typed English meaning) and `fehlersuche` (tap the
 * wrong word, type the correction).
 */
import { GRADING } from './config';
import { alignWord, foldForCompare, isToleratedTypo, normalizeAnswer } from './normalize';

export interface SimpleGrade {
  correct: boolean;
  typoTolerated: boolean;
  /** The accepted answer the user's answer matched, or the preferred one. */
  expected: string;
}

const LEADING = /^(to|the|a|an)\s+/u;
// British spellings fold to American ones (colour → color, centre → center).
const BRITISH: [RegExp, string][] = [
  [/our\b/gu, 'or'],
  [/tre\b/gu, 'ter'],
  [/ise\b/gu, 'ize'],
  [/yse\b/gu, 'yze'],
  [/ogue\b/gu, 'og'],
];

/** Normalised English gloss: lower case, no article or infinitive `to`, US spelling. */
export function normalizeGloss(text: string): string {
  let s = foldForCompare(text)
    .replace(/[.,;:!?"'()]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  s = s.replace(LEADING, '').replace(LEADING, '');
  for (const [re, to] of BRITISH) s = s.replace(re, to);
  return s;
}

/** `bedeutung`: any accepted gloss, with the usual typo tolerance on single words. */
export function gradeGloss(accepted: readonly string[], answer: string): SimpleGrade {
  const typed = normalizeGloss(answer);
  const first = accepted[0] ?? '';
  if (typed === '') return { correct: false, typoTolerated: false, expected: first };
  for (const a of accepted) {
    if (normalizeGloss(a) === typed) return { correct: true, typoTolerated: false, expected: a };
  }
  for (const a of accepted) {
    const n = normalizeGloss(a);
    if (!n.includes(' ') && isToleratedTypo(n, typed)) {
      return { correct: true, typoTolerated: true, expected: a };
    }
  }
  return { correct: false, typoTolerated: false, expected: first };
}

export interface FehlersucheGap {
  tokens: string[];
  error_index: number;
  wrong: string;
  correct: string;
}

export interface FehlersucheGrade extends SimpleGrade {
  /** The user tapped the wrong token. */
  foundError: boolean;
}

/** `fehlersuche`: the tapped token must be the error and the correction exact. */
export function gradeFehlersuche(
  gap: FehlersucheGap,
  tappedIndex: number,
  correction: string,
): FehlersucheGrade {
  const foundError = tappedIndex === gap.error_index;
  const typed = normalizeAnswer(correction);
  // Determiners must match exactly (spec §7.2); only letter case is free.
  const correct = foundError && alignWord(gap.correct, typed).distance === 0;
  return { correct, foundError, typoTolerated: false, expected: gap.correct };
}

/**
 * Closed answers (`umformen`, `en_de_chunk` words): exact up to letter case
 * and ae/oe/ue/ss, with the usual stem-typo tolerance on single words.
 */
export function gradeClosed(accepted: readonly string[], answer: string): SimpleGrade {
  const typed = normalizeAnswer(answer);
  const first = accepted[0] ?? '';
  for (const a of accepted) {
    if (alignWord(normalizeAnswer(a), typed).distance === 0)
      return { correct: true, typoTolerated: false, expected: a };
  }
  for (const a of accepted) {
    const n = normalizeAnswer(a);
    if (!n.includes(' ') && !typed.includes(' ') && isToleratedTypo(n, typed)) {
      return { correct: true, typoTolerated: true, expected: a };
    }
  }
  return { correct: false, typoTolerated: false, expected: first };
}

/** `satzbau`: any accepted variant; commas are optional, the sentence-final stop too. */
export function gradeSentence(accepted: readonly string[], answer: string): SimpleGrade {
  const simplify = (s: string) =>
    normalizeAnswer(s)
      .replace(/^[.…,\s]+/u, '')
      .replace(/,/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  const typed = simplify(answer);
  const first = accepted[0] ?? '';
  for (const a of accepted) {
    if (alignWord(simplify(a), typed).distance === 0)
      return { correct: true, typoTolerated: false, expected: a };
  }
  return { correct: false, typoTolerated: false, expected: first };
}

export interface DiktatGrade extends SimpleGrade {
  targetCorrect: boolean;
  /** Edit distance of the whole sentence divided by its length. */
  distance: number;
}

/**
 * `diktat` (spec §6.5): the target word must be exact (letter case aside);
 * the rest passes at a normalised edit distance ≤ DIKTAT_MAX_NORMALISED_DISTANCE.
 */
export function gradeDiktat(sentence: string, target: string, answer: string): DiktatGrade {
  const norm = (s: string) =>
    normalizeAnswer(s)
      .replace(/[.,;:!?"„“»«]/gu, '')
      .replace(/\s+/gu, ' ');
  const expected = norm(sentence);
  const typed = norm(answer);
  const targetFolded = foldForCompare(target);
  const targetCorrect = typed.split(' ').some((w) => foldForCompare(w) === targetFolded);
  const distance = alignWord(expected, typed).distance / Math.max(1, Array.from(expected).length);
  return {
    correct: targetCorrect && distance <= GRADING.DIKTAT_MAX_NORMALISED_DISTANCE,
    typoTolerated: distance > 0,
    targetCorrect,
    distance,
    expected: sentence,
  };
}
