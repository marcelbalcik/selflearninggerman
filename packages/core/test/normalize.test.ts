import { describe, expect, it } from 'vitest';
import {
  alignWord,
  foldForCompare,
  isToleratedTypo,
  markAnswer,
  normalizeAnswer,
} from '../src/normalize';

describe('normalisation (spec §7.1)', () => {
  it('applies NFC, trims, collapses whitespace and strips final punctuation', () => {
    const decomposed = 'Mütter'; // u + combining diaeresis
    expect(normalizeAnswer(`  ${decomposed}  `)).toBe('Mütter');
    expect(normalizeAnswer('dem   Nachbarn .')).toBe('dem Nachbarn');
    expect(normalizeAnswer('Ich helfe ihm!?')).toBe('Ich helfe ihm');
  });

  it('folds case and umlaut spellings for lookups', () => {
    expect(foldForCompare('Straße')).toBe(foldForCompare('strasse'));
    expect(foldForCompare('Mütter')).toBe('muetter');
  });
});

describe('alignment', () => {
  it('accepts ae/oe/ue and ss with a note, without penalty', () => {
    expect(alignWord('Mütter', 'Muetter')).toMatchObject({ distance: 0, notes: ['umlaut'] });
    expect(alignWord('Straße', 'Strasse')).toMatchObject({ distance: 0, notes: ['eszett'] });
  });

  it('never rewrites a real "ue" into an umlaut', () => {
    expect(alignWord('Mauer', 'Mauer').distance).toBe(0);
    expect(alignWord('Mauer', 'Mauer').notes).toEqual([]);
  });

  it('is case-insensitive but notes the difference', () => {
    expect(alignWord('Tisch', 'tisch')).toMatchObject({ distance: 0, notes: ['case'] });
  });

  it('counts transpositions as one edit', () => {
    expect(alignWord('Kollegen', 'Kolelgen').distance).toBe(1);
  });
});

describe('typo tolerance (spec §7.2)', () => {
  it('Kolegen for Kollegen is tolerated', () => {
    expect(isToleratedTypo('Kollegen', 'Kolegen')).toBe(true);
  });

  it('Kollege for Kollegen is wrong: the ending differs', () => {
    expect(isToleratedTypo('Kollegen', 'Kollege')).toBe(false);
  });

  it('Kinder for Kindern is wrong', () => {
    expect(isToleratedTypo('Kindern', 'Kinder')).toBe(false);
  });

  it('needs at least five letters', () => {
    expect(isToleratedTypo('Kind', 'Kinf')).toBe(false);
    expect(isToleratedTypo('Tisch', 'Tsich')).toBe(true);
  });

  it('places a doubled-letter slip in the stem, not the ending', () => {
    expect(isToleratedTypo('Schiffe', 'Schife')).toBe(true);
  });

  it('rejects edits inside the protected ending', () => {
    expect(isToleratedTypo('Kollegen', 'Kollegne')).toBe(false);
    expect(isToleratedTypo('Kollegen', 'Kollegem')).toBe(false);
  });

  it('rejects two edits', () => {
    expect(isToleratedTypo('Kollegen', 'Kolgen')).toBe(false);
  });
});

describe('red-pen marks', () => {
  it('marks exactly the wrong characters', () => {
    expect(markAnswer('dem Nachbarn', 'den Nachbarn')).toEqual([
      { text: 'de', status: 'ok' },
      { text: 'n', status: 'wrong' },
      { text: ' Nachbarn', status: 'ok' },
    ]);
  });

  it('shows missing characters as an insertion mark', () => {
    expect(markAnswer('Kindern', 'Kinder')).toEqual([
      { text: 'Kinder', status: 'ok' },
      { text: 'n', status: 'missing' },
    ]);
  });

  it('keeps transliterated spellings unmarked', () => {
    expect(markAnswer('Mütter', 'Muetter')).toEqual([{ text: 'Muetter', status: 'ok' }]);
  });
});
