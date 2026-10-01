import { describe, expect, it } from 'vitest';
import {
  checkNoun,
  dativePlural,
  declension,
  declineByRules,
  displayTable,
  renderNp,
  strongGenitiveCandidates,
  syllableCount,
} from '../src/declension';
import type { NpSpec } from '../src/declension';
import type { NounInput } from '../src/types';
import { ANGESTELLTE, GOLDEN, NACHBAR, VISUM, noun } from './fixtures';

const np = (n: NounInput, spec: NpSpec): string[] => renderNp(n, spec).map((f) => f.text);

describe('golden nouns (spec §4.2)', () => {
  for (const [name, golden] of Object.entries(GOLDEN)) {
    it(`declines ${name}`, () => {
      const table = declineByRules(golden.input);
      expect(table).toEqual({ kind: 'regular', sg: golden.sg, pl: golden.pl });
      expect(checkNoun(golden.input)).toEqual([]);
    });
  }

  it('weak masculines take -(e)n in akk/dat/gen singular', () => {
    expect(np(noun('Kollege'), { num: 'sg', case: 'akk', det: 'def' })).toEqual(['den Kollegen']);
    expect(np(noun('Junge'), { num: 'sg', case: 'dat', det: 'def' })).toEqual(['dem Jungen']);
    expect(np(noun('Mensch'), { num: 'sg', case: 'gen', det: 'def' })).toEqual(['des Menschen']);
    expect(np(NACHBAR, { num: 'sg', case: 'dat', det: 'def' })).toEqual(['dem Nachbarn']);
  });

  it('Herr: Herrn in the singular oblique cases, Herren in the plural', () => {
    expect(np(noun('Herr'), { num: 'sg', case: 'akk', det: 'def' })).toEqual(['den Herrn']);
    expect(np(noun('Herr'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Herren']);
  });

  it('mixed declension: der Name, das Herz', () => {
    expect(np(noun('Name'), { num: 'sg', case: 'akk', det: 'def' })).toEqual(['den Namen']);
    expect(np(noun('Name'), { num: 'sg', case: 'gen', det: 'def' })).toEqual(['des Namens']);
    expect(np(noun('Herz'), { num: 'sg', case: 'akk', det: 'def' })).toEqual(['das Herz']);
    expect(np(noun('Herz'), { num: 'sg', case: 'dat', det: 'def' })).toEqual(['dem Herzen']);
    expect(np(noun('Herz'), { num: 'sg', case: 'gen', det: 'def' })).toEqual(['des Herzens']);
  });

  it('dative plural: -n unless -n/-s; Latin/Greek -a plurals unchanged', () => {
    expect(np(noun('Kind'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Kindern']);
    expect(np(noun('Auto'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Autos']);
    expect(np(noun('Frau'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Frauen']);
    expect(np(noun('Praktikum'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Praktika']);
    expect(np(VISUM, { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Visa']);
    expect(np(noun('Leute'), { num: 'pl', case: 'dat', det: 'def' })).toEqual(['den Leuten']);
    expect(dativePlural('Äpfel')).toBe('Äpfeln');
    // Zero plurals of measure nouns after numerals stay unchanged (M1 crosscheck).
    expect(dativePlural('Euro')).toBe('Euro');
    expect(dativePlural('Stück')).toBe('Stück');
    expect(dativePlural('Jahr')).toBe('Jahr');
    expect(dativePlural('Mal')).toBe('Mal');
  });

  it('never produces the archaic dative -e', () => {
    const forms = np(noun('Kind'), { num: 'sg', case: 'dat', det: 'def' });
    expect(forms).toEqual(['dem Kind']);
  });

  it('determiners: indefinite, kein, possessives; no indefinite plural article', () => {
    expect(np(noun('Tisch'), { num: 'sg', case: 'akk', det: 'indef' })).toEqual(['einen Tisch']);
    expect(np(noun('Frau'), { num: 'sg', case: 'dat', det: 'kein' })).toEqual(['keiner Frau']);
    expect(np(noun('Kind'), { num: 'pl', case: 'dat', det: 'mein' })).toEqual(['meinen Kindern']);
    expect(np(noun('Kind'), { num: 'pl', case: 'dat', det: 'euer' })).toEqual(['euren Kindern']);
    expect(np(noun('Kind'), { num: 'sg', case: 'nom', det: 'euer' })).toEqual(['euer Kind']);
    expect(np(noun('Kind'), { num: 'pl', case: 'dat', det: 'indef' })).toEqual(['Kindern']);
  });

  it('alternative genders are both accepted: der/das Joghurt', () => {
    expect(np(noun('Joghurt'), { num: 'sg', case: 'akk', det: 'def' })).toEqual([
      'den Joghurt',
      'das Joghurt',
    ]);
    expect(np(noun('Joghurt'), { num: 'sg', case: 'akk', det: 'def', gender: 'n' })).toEqual([
      'das Joghurt',
    ]);
  });

  it('plural-only and no-plural nouns', () => {
    expect(np(noun('Leute'), { num: 'sg', case: 'nom', det: 'def' })).toEqual([]);
    expect(np(noun('Obst'), { num: 'pl', case: 'nom', det: 'def' })).toEqual([]);
    expect(displayTable(noun('Leute')).sg).toBeNull();
    expect(displayTable(noun('Obst')).pl).toBeNull();
  });

  it('der See and die See are separate lemmas', () => {
    expect(np(GOLDEN['See (der)']!.input, { num: 'sg', case: 'dat', det: 'def' })).toEqual([
      'dem See',
    ]);
    expect(np(GOLDEN['See (die)']!.input, { num: 'sg', case: 'dat', det: 'def' })).toEqual([
      'der See',
    ]);
  });
});

describe('adjectival nouns: der/die Angestellte', () => {
  const cases = [
    [{ num: 'sg', case: 'nom', det: 'def', gender: 'm' }, 'der Angestellte'],
    [{ num: 'sg', case: 'akk', det: 'def', gender: 'm' }, 'den Angestellten'],
    [{ num: 'sg', case: 'dat', det: 'def', gender: 'm' }, 'dem Angestellten'],
    [{ num: 'sg', case: 'nom', det: 'indef', gender: 'm' }, 'ein Angestellter'],
    [{ num: 'sg', case: 'akk', det: 'indef', gender: 'm' }, 'einen Angestellten'],
    [{ num: 'sg', case: 'dat', det: 'indef', gender: 'm' }, 'einem Angestellten'],
    [{ num: 'sg', case: 'nom', det: 'def', gender: 'f' }, 'die Angestellte'],
    [{ num: 'sg', case: 'dat', det: 'def', gender: 'f' }, 'der Angestellten'],
    [{ num: 'sg', case: 'nom', det: 'indef', gender: 'f' }, 'eine Angestellte'],
    [{ num: 'sg', case: 'dat', det: 'indef', gender: 'f' }, 'einer Angestellten'],
    [{ num: 'pl', case: 'nom', det: 'def' }, 'die Angestellten'],
    [{ num: 'pl', case: 'nom', det: 'kein' }, 'keine Angestellten'],
    [{ num: 'pl', case: 'nom', det: 'indef' }, 'Angestellte'],
    [{ num: 'pl', case: 'dat', det: 'indef' }, 'Angestellten'],
  ] as const;
  for (const [spec, expected] of cases) {
    it(`${JSON.stringify(spec)} → ${expected}`, () => {
      expect(np(ANGESTELLTE, spec)).toEqual([expected]);
    });
  }

  it('offers both genders when the referent is open', () => {
    expect(np(ANGESTELLTE, { num: 'sg', case: 'nom', det: 'indef' })).toEqual([
      'ein Angestellter',
      'eine Angestellte',
    ]);
  });

  it('has no structural issues', () => {
    expect(checkNoun(ANGESTELLTE)).toEqual([]);
  });
});

describe('stored tables win over the rules', () => {
  it('uses NounInput.forms when present', () => {
    const stored = declineByRules(noun('Kind'));
    if (stored.kind !== 'regular' || stored.sg === null) throw new Error('unexpected');
    const input: NounInput = {
      ...noun('Kind'),
      forms: { ...stored, sg: { ...stored.sg, gen: ['Kindes'] } },
    };
    expect(np(input, { num: 'sg', case: 'gen', det: 'def' })).toEqual(['des Kindes']);
    expect(declension(input)).toBe(input.forms);
  });
});

describe('display strip', () => {
  it('shows definite forms per case', () => {
    expect(displayTable(noun('Tisch'))).toEqual({
      sg: { nom: 'der Tisch', akk: 'den Tisch', dat: 'dem Tisch', gen: 'des Tisches' },
      pl: { nom: 'die Tische', akk: 'die Tische', dat: 'den Tischen', gen: 'der Tische' },
    });
  });
});

describe('display strip without a stored genitive', () => {
  it('shows a dash instead of guessing', () => {
    expect(displayTable({ lemma: 'Tisch', gender: 'm', plural: ['Tische'] }).sg).toEqual({
      nom: 'der Tisch',
      akk: 'den Tisch',
      dat: 'dem Tisch',
      gen: '–',
    });
  });
});

describe('noun data checks', () => {
  it('flags missing and implausible genitives of strong nouns', () => {
    expect(checkNoun({ lemma: 'Tisch', gender: 'm', plural: ['Tische'] })).toEqual([
      'gen_sg_missing',
    ]);
    expect(
      checkNoun({ lemma: 'Tisch', gender: 'm', plural: ['Tische'], genSg: ['Tischen'] }),
    ).toEqual(['gen_sg_implausible']);
  });

  it('flags contradictory flags', () => {
    expect(checkNoun({ lemma: 'Frau', gender: 'f', plural: ['Frauen'], weak: true })).toEqual([
      'weak_not_masculine',
    ]);
    expect(checkNoun({ lemma: 'Kind', gender: 'n', plural: [], genSg: ['Kindes'] })).toEqual([
      'plural_missing',
    ]);
  });

  it('genitive candidates allow -s, -es, unchanged and -ses', () => {
    expect(strongGenitiveCandidates('Haus')).toContain('Hauses');
    expect(strongGenitiveCandidates('Ergebnis')).toContain('Ergebnisses');
    expect(strongGenitiveCandidates('Beispiel')).toEqual(
      expect.arrayContaining(['Beispiels', 'Beispieles']),
    );
    expect(strongGenitiveCandidates('September')).toContain('September');
    expect(strongGenitiveCandidates('Tisch')).not.toContain('Tischen');
  });

  it('syllable estimate', () => {
    expect(syllableCount('Sprung')).toBe(1);
    expect(syllableCount('Zeitung')).toBe(2);
    expect(syllableCount('Bauer')).toBe(2);
    expect(syllableCount('Knie')).toBe(1);
  });
});
