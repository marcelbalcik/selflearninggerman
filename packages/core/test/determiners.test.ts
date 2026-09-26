import { describe, expect, it } from 'vitest';
import { contract, detCells, detClassesOf, determiner } from '../src/determiners';
import { CASES, SLOTS } from '../src/types';

describe('determiner tables (spec §4.2)', () => {
  it('definite article', () => {
    const table = CASES.map((c) => SLOTS.map((s) => determiner('def', s, c)).join(' '));
    expect(table).toEqual([
      'der die das die',
      'den die das die',
      'dem der dem den',
      'des der des der',
    ]);
  });

  it('indefinite article has no plural', () => {
    const table = CASES.map((c) => SLOTS.map((s) => determiner('indef', s, c) ?? '-').join(' '));
    expect(table).toEqual([
      'ein eine ein -',
      'einen eine ein -',
      'einem einer einem -',
      'eines einer eines -',
    ]);
  });

  it('kein and possessives follow the indefinite pattern with plural forms', () => {
    expect(CASES.map((c) => determiner('kein', 'pl', c))).toEqual([
      'keine',
      'keine',
      'keinen',
      'keiner',
    ]);
    expect(CASES.map((c) => determiner('mein', 'pl', c))).toEqual([
      'meine',
      'meine',
      'meinen',
      'meiner',
    ]);
    expect(determiner('unser', 'm', 'dat')).toBe('unserem');
    expect(determiner('euer', 'f', 'nom')).toBe('eure');
  });

  it('lists the cells a determiner realises', () => {
    expect(detCells('der', 'def')).toEqual([
      { slot: 'm', case: 'nom' },
      { slot: 'f', case: 'dat' },
      { slot: 'f', case: 'gen' },
      { slot: 'pl', case: 'gen' },
    ]);
    expect(detCells('Dem', 'def')).toEqual([
      { slot: 'm', case: 'dat' },
      { slot: 'n', case: 'dat' },
    ]);
    expect(detClassesOf('einem')).toEqual(['indef']);
    expect(detClassesOf('den')).toEqual(['def']);
  });

  it('contracts preposition + article where standard German does', () => {
    expect(contract('zu', 'dem')).toBe('zum');
    expect(contract('in', 'das')).toBe('ins');
    expect(contract('mit', 'dem')).toBeNull();
  });
});
