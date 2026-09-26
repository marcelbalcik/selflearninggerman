/**
 * Determiner tables (spec §4.2). `kein` and the possessives follow the
 * indefinite pattern and have plural forms; `ein` has none.
 */
import { foldForCompare } from './normalize';
import type { AdjDecl, Case, Slot } from './types';
import { CASES, SLOTS } from './types';

export type PossessiveStem = 'mein' | 'dein' | 'sein' | 'ihr' | 'unser' | 'euer';
export type DetClass = 'def' | 'indef' | 'kein' | PossessiveStem;

export const POSSESSIVE_STEMS: readonly PossessiveStem[] = [
  'mein',
  'dein',
  'sein',
  'ihr',
  'unser',
  'euer',
];
export const DET_CLASSES: readonly DetClass[] = ['def', 'indef', 'kein', ...POSSESSIVE_STEMS];

const DEFINITE: Record<Case, Record<Slot, string>> = {
  nom: { m: 'der', f: 'die', n: 'das', pl: 'die' },
  akk: { m: 'den', f: 'die', n: 'das', pl: 'die' },
  dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
  gen: { m: 'des', f: 'der', n: 'des', pl: 'der' },
};

/** Endings of `ein`, `kein` and the possessives. */
const EIN_WORD_ENDINGS: Record<Case, Record<Slot, string>> = {
  nom: { m: '', f: 'e', n: '', pl: 'e' },
  akk: { m: 'en', f: 'e', n: '', pl: 'e' },
  dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
  gen: { m: 'es', f: 'er', n: 'es', pl: 'er' },
};

function einWordStem(cls: Exclude<DetClass, 'def'>): string {
  return cls === 'indef' ? 'ein' : cls;
}

/**
 * The determiner for a cell, or null where the class has none (`ein` in the
 * plural: the indefinite plural has no article).
 */
export function determiner(cls: DetClass, slot: Slot, kase: Case): string | null {
  if (cls === 'def') return DEFINITE[kase][slot];
  if (cls === 'indef' && slot === 'pl') return null;
  const ending = EIN_WORD_ENDINGS[kase][slot];
  const stem = einWordStem(cls);
  // `euer` drops its second e before an ending: eure, eurem, euren.
  if (stem === 'euer' && ending !== '') return `eur${ending}`;
  return stem + ending;
}

export interface DetCell {
  slot: Slot;
  case: Case;
}

/** Every (slot, case) cell in which `word` is the determiner of class `cls`. */
export function detCells(word: string, cls: DetClass): DetCell[] {
  const target = foldForCompare(word);
  const cells: DetCell[] = [];
  for (const kase of CASES) {
    for (const slot of SLOTS) {
      const det = determiner(cls, slot, kase);
      if (det !== null && foldForCompare(det) === target) cells.push({ slot, case: kase });
    }
  }
  return cells;
}

/** Determiner classes that contain `word` in any cell. */
export function detClassesOf(word: string): DetClass[] {
  return DET_CLASSES.filter((cls) => detCells(word, cls).length > 0);
}

/** Which adjectival-noun declension follows this determiner (none = null). */
export function adjDeclAfter(cls: DetClass | null, slot: Slot): AdjDecl {
  if (cls === null) return 'strong';
  if (cls === 'def') return 'weak';
  if (cls === 'indef' && slot === 'pl') return 'strong';
  return 'mixed';
}

/**
 * Preposition + definite article contractions accepted in answers. Each maps
 * to the preposition and the article it contains.
 */
export const CONTRACTIONS: Readonly<Record<string, readonly [string, string]>> = {
  am: ['an', 'dem'],
  ans: ['an', 'das'],
  aufs: ['auf', 'das'],
  beim: ['bei', 'dem'],
  durchs: ['durch', 'das'],
  fürs: ['für', 'das'],
  hinters: ['hinter', 'das'],
  im: ['in', 'dem'],
  ins: ['in', 'das'],
  übers: ['über', 'das'],
  ums: ['um', 'das'],
  unters: ['unter', 'das'],
  vom: ['von', 'dem'],
  vors: ['vor', 'das'],
  zum: ['zu', 'dem'],
  zur: ['zu', 'der'],
};

/** Contractions that standard written German prefers; used when showing answers. */
const PREFERRED_CONTRACTIONS = ['am', 'ans', 'beim', 'im', 'ins', 'vom', 'zum', 'zur'] as const;

/** `zu` + `dem` → `zum`; null when the pair is normally written out. */
export function contract(prep: string, article: string): string | null {
  for (const c of PREFERRED_CONTRACTIONS) {
    const [p, a] = CONTRACTIONS[c] ?? [];
    if (p === prep.toLowerCase() && a === article.toLowerCase()) return c;
  }
  return null;
}
