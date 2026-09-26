/**
 * Golden test nouns (spec §4.2) plus the nouns the classifier tests need.
 * Headword data and expected tables follow Duden / Wiktionary; genitive
 * variants list the preferred form first.
 */
import type { CaseForms, NounInput } from '../src/types';

export interface GoldenNoun {
  input: NounInput;
  sg: CaseForms | null;
  pl: CaseForms | null;
}

const same = (f: string): CaseForms => ({ nom: [f], akk: [f], dat: [f], gen: [f] });

export const GOLDEN: Record<string, GoldenNoun> = {
  Tisch: {
    input: { lemma: 'Tisch', gender: 'm', plural: ['Tische'], genSg: ['Tisches', 'Tischs'] },
    sg: { nom: ['Tisch'], akk: ['Tisch'], dat: ['Tisch'], gen: ['Tisches', 'Tischs'] },
    pl: { nom: ['Tische'], akk: ['Tische'], dat: ['Tischen'], gen: ['Tische'] },
  },
  Kollege: {
    input: { lemma: 'Kollege', gender: 'm', plural: ['Kollegen'], weak: true },
    sg: { nom: ['Kollege'], akk: ['Kollegen'], dat: ['Kollegen'], gen: ['Kollegen'] },
    pl: same('Kollegen'),
  },
  Junge: {
    input: { lemma: 'Junge', gender: 'm', plural: ['Jungen'], weak: true },
    sg: { nom: ['Junge'], akk: ['Jungen'], dat: ['Jungen'], gen: ['Jungen'] },
    pl: same('Jungen'),
  },
  Mensch: {
    input: { lemma: 'Mensch', gender: 'm', plural: ['Menschen'], weak: true },
    sg: { nom: ['Mensch'], akk: ['Menschen'], dat: ['Menschen'], gen: ['Menschen'] },
    pl: same('Menschen'),
  },
  Herr: {
    input: { lemma: 'Herr', gender: 'm', plural: ['Herren'], weak: true },
    sg: { nom: ['Herr'], akk: ['Herrn'], dat: ['Herrn'], gen: ['Herrn'] },
    pl: same('Herren'),
  },
  Student: {
    input: { lemma: 'Student', gender: 'm', plural: ['Studenten'], weak: true },
    sg: { nom: ['Student'], akk: ['Studenten'], dat: ['Studenten'], gen: ['Studenten'] },
    pl: same('Studenten'),
  },
  Name: {
    input: { lemma: 'Name', gender: 'm', plural: ['Namen'], mixed: true },
    sg: { nom: ['Name'], akk: ['Namen'], dat: ['Namen'], gen: ['Namens'] },
    pl: same('Namen'),
  },
  Herz: {
    input: { lemma: 'Herz', gender: 'n', plural: ['Herzen'], mixed: true },
    sg: { nom: ['Herz'], akk: ['Herz'], dat: ['Herzen'], gen: ['Herzens'] },
    pl: same('Herzen'),
  },
  Auto: {
    input: { lemma: 'Auto', gender: 'n', plural: ['Autos'], genSg: ['Autos'] },
    sg: { nom: ['Auto'], akk: ['Auto'], dat: ['Auto'], gen: ['Autos'] },
    pl: same('Autos'),
  },
  Kind: {
    input: { lemma: 'Kind', gender: 'n', plural: ['Kinder'], genSg: ['Kindes', 'Kinds'] },
    sg: { nom: ['Kind'], akk: ['Kind'], dat: ['Kind'], gen: ['Kindes', 'Kinds'] },
    pl: { nom: ['Kinder'], akk: ['Kinder'], dat: ['Kindern'], gen: ['Kinder'] },
  },
  Zimmer: {
    input: { lemma: 'Zimmer', gender: 'n', plural: ['Zimmer'], genSg: ['Zimmers'] },
    sg: { nom: ['Zimmer'], akk: ['Zimmer'], dat: ['Zimmer'], gen: ['Zimmers'] },
    pl: { nom: ['Zimmer'], akk: ['Zimmer'], dat: ['Zimmern'], gen: ['Zimmer'] },
  },
  Mutter: {
    input: { lemma: 'Mutter', gender: 'f', plural: ['Mütter'] },
    sg: same('Mutter'),
    pl: { nom: ['Mütter'], akk: ['Mütter'], dat: ['Müttern'], gen: ['Mütter'] },
  },
  Frau: {
    input: { lemma: 'Frau', gender: 'f', plural: ['Frauen'] },
    sg: same('Frau'),
    pl: same('Frauen'),
  },
  Museum: {
    input: { lemma: 'Museum', gender: 'n', plural: ['Museen'], genSg: ['Museums'] },
    sg: { nom: ['Museum'], akk: ['Museum'], dat: ['Museum'], gen: ['Museums'] },
    pl: same('Museen'),
  },
  Praktikum: {
    input: { lemma: 'Praktikum', gender: 'n', plural: ['Praktika'], genSg: ['Praktikums'] },
    sg: { nom: ['Praktikum'], akk: ['Praktikum'], dat: ['Praktikum'], gen: ['Praktikums'] },
    pl: same('Praktika'),
  },
  Leute: {
    input: { lemma: 'Leute', gender: null, plural: ['Leute'], pluralOnly: true },
    sg: null,
    pl: { nom: ['Leute'], akk: ['Leute'], dat: ['Leuten'], gen: ['Leute'] },
  },
  Obst: {
    input: { lemma: 'Obst', gender: 'n', plural: [], noPlural: true, genSg: ['Obstes', 'Obsts'] },
    sg: { nom: ['Obst'], akk: ['Obst'], dat: ['Obst'], gen: ['Obstes', 'Obsts'] },
    pl: null,
  },
  Joghurt: {
    input: {
      lemma: 'Joghurt',
      gender: 'm',
      altGenders: ['n'],
      plural: ['Joghurts'],
      genSg: ['Joghurts'],
    },
    sg: { nom: ['Joghurt'], akk: ['Joghurt'], dat: ['Joghurt'], gen: ['Joghurts'] },
    pl: same('Joghurts'),
  },
  'See (der)': {
    input: { lemma: 'See', gender: 'm', plural: ['Seen'], genSg: ['Sees'] },
    sg: { nom: ['See'], akk: ['See'], dat: ['See'], gen: ['Sees'] },
    pl: same('Seen'),
  },
  'See (die)': {
    input: { lemma: 'See', gender: 'f', plural: ['Seen'] },
    sg: same('See'),
    pl: same('Seen'),
  },
};

/** der/die Angestellte: adjectival, masculine with a feminine alternative. */
export const ANGESTELLTE: NounInput = {
  lemma: 'Angestellte',
  gender: 'm',
  altGenders: ['f'],
  plural: ['Angestellten'],
  adjectival: true,
};

/** Classifier fixtures (spec §7.3). Nachbar is a weak noun. */
export const NACHBAR: NounInput = {
  lemma: 'Nachbar',
  gender: 'm',
  plural: ['Nachbarn'],
  weak: true,
};

export const VISUM: NounInput = {
  lemma: 'Visum',
  gender: 'n',
  plural: ['Visa'],
  genSg: ['Visums'],
};

export function noun(key: string): NounInput {
  const g = GOLDEN[key];
  if (g === undefined) throw new Error(`no golden noun ${key}`);
  return g.input;
}
