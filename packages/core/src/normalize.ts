/**
 * Answer normalisation and character alignment (spec §7.1, §7.2).
 *
 * `ae/oe/ue` for `ä/ö/ü` and `ss` for `ß` are accepted with a note, and so is
 * a difference in letter case. The alignment below treats those as free
 * operations instead of rewriting the answer, so a correct `Mauer` never
 * becomes `Maür`.
 */
import { GRADING } from './config';

const TRAILING_PUNCTUATION = /[\s.,;:!?…"'»«„“”‚‘’)\]]+$/u;

/** NFC, trimmed, whitespace collapsed, final punctuation stripped. */
export function normalizeAnswer(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim().replace(TRAILING_PUNCTUATION, '');
}

const FOLD: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Lower-cased and transliterated to ASCII-style spelling. Only for lookups and
 * equality of whole words where both sides are known forms; grading of typed
 * input goes through `alignWord`.
 */
export function foldForCompare(s: string): string {
  return normalizeAnswer(s)
    .toLowerCase()
    .replace(/[äöüß]/gu, (ch) => FOLD[ch] ?? ch);
}

export type MatchNote = 'case' | 'umlaut' | 'eszett';

export type AlignOp =
  | { kind: 'match'; e: number; a: number; caseDiffers: boolean }
  | { kind: 'translit'; e: number; a: number; note: 'umlaut' | 'eszett' }
  | { kind: 'sub'; e: number; a: number }
  | { kind: 'del'; e: number }
  | { kind: 'ins'; a: number; before: number }
  | { kind: 'swap'; e: number; a: number };

export interface Alignment {
  /** Edits beyond letter case and accepted transliterations. */
  distance: number;
  /** Index in the expected string of the first edit, or null if none. */
  editPosition: number | null;
  notes: MatchNote[];
  ops: AlignOp[];
}

const TRANSLIT: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

function sameLetter(x: string | undefined, y: string | undefined): boolean {
  return x !== undefined && y !== undefined && x.toLowerCase() === y.toLowerCase();
}

function translitAt(e: string[], a: string[], i: number, j: number): 'umlaut' | 'eszett' | null {
  const ch = e[i]?.toLowerCase();
  if (ch === undefined) return null;
  const spelled = TRANSLIT[ch];
  if (spelled === undefined) return null;
  const typed = (a[j] ?? '') + (a[j + 1] ?? '');
  if (typed.toLowerCase() !== spelled) return null;
  return ch === 'ß' ? 'eszett' : 'umlaut';
}

/**
 * Optimal string alignment (restricted Damerau-Levenshtein) of an answer
 * against the expected text, where case differences and ae/oe/ue/ss spellings
 * cost nothing. Among optimal alignments, edits are placed as early as
 * possible, so a slip in a doubled letter (`Schife` for `Schiffe`) counts as a
 * stem edit rather than an ending edit.
 */
export function alignWord(expected: string, answer: string): Alignment {
  const e = Array.from(expected);
  const a = Array.from(answer);
  const n = e.length;
  const m = a.length;
  // d[i][j]: cheapest alignment of the prefixes e[..i) and a[..j).
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number =>
    i < 0 || j < 0 ? Infinity : (d[i]?.[j] ?? Infinity);
  const swapAt = (i: number, j: number): boolean =>
    i >= 2 &&
    j >= 2 &&
    sameLetter(e[i - 1], a[j - 2]) &&
    sameLetter(e[i - 2], a[j - 1]) &&
    !sameLetter(e[i - 1], e[i - 2]);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1);
      if (i > 0 && j > 0)
        best = Math.min(best, at(i - 1, j - 1) + (sameLetter(e[i - 1], a[j - 1]) ? 0 : 1));
      if (i > 0 && j > 1 && translitAt(e, a, i - 1, j - 2) !== null)
        best = Math.min(best, at(i - 1, j - 2));
      if (swapAt(i, j)) best = Math.min(best, at(i - 2, j - 2) + 1);
      (d[i] as number[])[j] = best;
    }
  }

  // Walk back from the end taking free steps first, which pushes edits early.
  const reversed: AlignOp[] = [];
  const notes = new Set<MatchNote>();
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = at(i, j);
    if (i > 0 && j > 0 && sameLetter(e[i - 1], a[j - 1]) && at(i - 1, j - 1) === here) {
      const caseDiffers = e[i - 1] !== a[j - 1];
      if (caseDiffers) notes.add('case');
      reversed.push({ kind: 'match', e: i - 1, a: j - 1, caseDiffers });
      i -= 1;
      j -= 1;
      continue;
    }
    const translit = i > 0 && j > 1 ? translitAt(e, a, i - 1, j - 2) : null;
    if (translit !== null && at(i - 1, j - 2) === here) {
      notes.add(translit);
      reversed.push({ kind: 'translit', e: i - 1, a: j - 2, note: translit });
      i -= 1;
      j -= 2;
      continue;
    }
    if (swapAt(i, j) && at(i - 2, j - 2) + 1 === here) {
      reversed.push({ kind: 'swap', e: i - 2, a: j - 2 });
      i -= 2;
      j -= 2;
      continue;
    }
    if (i > 0 && j > 0 && at(i - 1, j - 1) + 1 === here) {
      reversed.push({ kind: 'sub', e: i - 1, a: j - 1 });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && at(i - 1, j) + 1 === here) {
      reversed.push({ kind: 'del', e: i - 1 });
      i -= 1;
      continue;
    }
    // An insertion sits before expected position i.
    reversed.push({ kind: 'ins', a: j - 1, before: i });
    j -= 1;
  }
  const ops = reversed.reverse();
  let editPosition: number | null = null;
  for (const op of ops) {
    if (op.kind === 'match' || op.kind === 'translit') continue;
    editPosition = op.kind === 'ins' ? op.before : op.e;
    break;
  }
  return { distance: at(n, m), editPosition, notes: [...notes], ops };
}

/**
 * A tolerated stem typo (spec §7.2): exactly one edit, in a word of at least
 * five letters, before the protected ending, with the ending typed exactly.
 */
export function isToleratedTypo(expected: string, answer: string, alignment?: Alignment): boolean {
  const al = alignment ?? alignWord(expected, answer);
  const e = Array.from(expected);
  const a = Array.from(answer);
  const suffix = GRADING.TYPO_PROTECTED_SUFFIX;
  if (al.distance === 0 || al.distance > GRADING.TYPO_MAX_DISTANCE) return false;
  if (e.length < GRADING.TYPO_MIN_WORD_LENGTH) return false;
  if (al.editPosition === null || al.editPosition >= e.length - suffix) return false;
  return foldForCompare(a.slice(-suffix).join('')) === foldForCompare(e.slice(-suffix).join(''));
}

export type MarkStatus = 'ok' | 'wrong' | 'missing';

/** A run of the user's answer for the red-pen display (spec §6, §10). */
export interface Mark {
  text: string;
  status: MarkStatus;
}

/**
 * The user's answer split into correct and wrong runs. Wrong runs are exactly
 * the substituted, extra or swapped characters; `missing` runs carry the
 * expected characters that were left out, shown as an insertion mark.
 */
export function markAnswer(expected: string, answer: string): Mark[] {
  const e = Array.from(expected);
  const a = Array.from(answer);
  const marks: Mark[] = [];
  const push = (text: string, status: MarkStatus): void => {
    const last = marks[marks.length - 1];
    if (last !== undefined && last.status === status) last.text += text;
    else marks.push({ text, status });
  };
  for (const op of alignWord(expected, answer).ops) {
    switch (op.kind) {
      case 'match':
        push(a[op.a] ?? '', 'ok');
        break;
      case 'translit':
        push((a[op.a] ?? '') + (a[op.a + 1] ?? ''), 'ok');
        break;
      case 'sub':
      case 'ins':
        push(a[op.a] ?? '', 'wrong');
        break;
      case 'swap':
        push((a[op.a] ?? '') + (a[op.a + 1] ?? ''), 'wrong');
        break;
      case 'del':
        push(e[op.e] ?? '', 'missing');
        break;
    }
  }
  return marks;
}
