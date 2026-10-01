import { describe, expect, it } from 'vitest';
import { gradeNp, resolveAmbiguous } from '../src/grading';
import type { NpErrorClass, NpTarget } from '../src/grading';
import { ANGESTELLTE, NACHBAR, noun } from './fixtures';

const nachbarDat: NpTarget = { noun: NACHBAR, num: 'sg', case: 'dat', det: 'def' };
const frauDat: NpTarget = { noun: noun('Frau'), num: 'sg', case: 'dat', det: 'def' };
const kinderDat: NpTarget = { noun: noun('Kind'), num: 'pl', case: 'dat', det: 'def' };
const tischAkk: NpTarget = { noun: noun('Tisch'), num: 'sg', case: 'akk', det: 'def' };
const autoAkk: NpTarget = { noun: noun('Auto'), num: 'sg', case: 'akk', det: 'def' };
const mitKind: NpTarget = { noun: noun('Kind'), num: 'sg', case: 'dat', det: 'def', prep: 'mit' };

describe('required classifier cases (spec §7.3)', () => {
  const table: [string, NpTarget, string, NpErrorClass][] = [
    ['dem Nachbarn', nachbarDat, 'den Nachbarn', 'case_error'],
    ['dem Nachbarn', nachbarDat, 'dem Nachbar', 'weak_error'],
    ['dem Nachbarn', nachbarDat, 'der Nachbarn', 'ambiguous'],
    ['der Frau', frauDat, 'dem Frau', 'gender_error'],
    ['den Kindern', kinderDat, 'den Kinder', 'datpl_error'],
    ['den Tisch', tischAkk, 'der Tisch', 'case_error'],
    ['das Auto', autoAkk, 'den Auto', 'gender_error'],
    ['mit dem Kind', mitKind, 'mit den Kindern', 'number_error'],
  ];
  for (const [expected, target, answer, errorClass] of table) {
    it(`${expected} ← ${answer}: ${errorClass}`, () => {
      const grade = gradeNp(target, answer);
      expect(grade.expected).toBe(expected);
      expect(grade.correct).toBe(false);
      expect(grade.errorClass).toBe(errorClass);
    });
  }
});

describe('correct answers', () => {
  it('accepts the exact answer', () => {
    expect(gradeNp(nachbarDat, 'dem Nachbarn')).toMatchObject({ correct: true, errorClass: null });
  });

  it('accepts a tolerated stem typo with a note', () => {
    const kollegeDat: NpTarget = { noun: noun('Kollege'), num: 'sg', case: 'dat', det: 'def' };
    expect(gradeNp(kollegeDat, 'dem Kolegen')).toMatchObject({
      correct: true,
      typoTolerated: true,
      notes: ['typo_tolerated'],
    });
  });

  it('does not penalise a lowercase noun or umlaut spellings', () => {
    const muetterDat: NpTarget = { noun: noun('Mutter'), num: 'pl', case: 'dat', det: 'def' };
    expect(gradeNp(muetterDat, 'den muettern')).toMatchObject({
      correct: true,
      notes: ['noun_lowercase', 'umlaut_spelling'],
    });
  });

  it('accepts either gender of der/das Joghurt', () => {
    const target: NpTarget = { noun: noun('Joghurt'), num: 'sg', case: 'akk', det: 'def' };
    expect(gradeNp(target, 'das Joghurt').correct).toBe(true);
    expect(gradeNp(target, 'den Joghurt').correct).toBe(true);
  });

  it('accepts a contraction for preposition + article', () => {
    const target: NpTarget = { noun: noun('Kind'), num: 'sg', case: 'dat', det: 'def', prep: 'zu' };
    expect(gradeNp(target, 'zum Kind')).toMatchObject({ correct: true, expected: 'zum Kind' });
    expect(gradeNp(target, 'zu dem Kind').correct).toBe(true);
  });

  it('handles the bare indefinite plural', () => {
    const target: NpTarget = { noun: noun('Kind'), num: 'pl', case: 'dat', det: 'indef' };
    expect(gradeNp(target, 'Kindern')).toMatchObject({ correct: true, expected: 'Kindern' });
    expect(gradeNp(target, 'Kinder').errorClass).toBe('datpl_error');
  });

  it('grades adjectival nouns by determiner type', () => {
    const target: NpTarget = {
      noun: ANGESTELLTE,
      num: 'sg',
      case: 'nom',
      det: 'indef',
      gender: 'm',
    };
    expect(gradeNp(target, 'ein Angestellter').correct).toBe(true);
    expect(gradeNp(target, 'ein Angestellte').correct).toBe(false);
  });
});

describe('further classification', () => {
  it('resolves ambiguous by the follow-up answer', () => {
    const grade = gradeNp(nachbarDat, 'der Nachbarn');
    expect(grade.followUp).toEqual({ kind: 'gender', lemma: 'Nachbar', options: ['m', 'f', 'n'] });
    expect(resolveAmbiguous(grade, nachbarDat, 'm').errorClass).toBe('case_error');
    expect(resolveAmbiguous(grade, nachbarDat, 'f').errorClass).toBe('gender_error');
  });

  it('reports a weak error next to a case error', () => {
    const grade = gradeNp(nachbarDat, 'den Nachbar');
    expect(grade.errorClass).toBe('case_error');
    expect(grade.secondary).toEqual(['weak_error']);
  });

  it('does not double-count a noun that follows the chosen case', () => {
    const grade = gradeNp(kinderDat, 'die Kinder');
    expect(grade.errorClass).toBe('case_error');
    expect(grade.secondary).toEqual([]);
  });

  it('wrong word when the noun is not a form of the lemma', () => {
    expect(gradeNp(nachbarDat, 'dem Freund').errorClass).toBe('wrong_word');
    const seeDat: NpTarget = { noun: noun('See (der)'), num: 'sg', case: 'dat', det: 'def' };
    expect(gradeNp(seeDat, 'dem Seele').errorClass).toBe('wrong_word');
  });

  it('det_error when the determiner fits neither case nor gender', () => {
    expect(gradeNp(frauDat, 'des Frau').errorClass).toBe('det_error');
    expect(gradeNp(nachbarDat, 'einem Nachbarn').errorClass).toBe('det_error');
    expect(gradeNp(nachbarDat, 'Nachbarn').errorClass).toBe('det_error');
  });

  it('weak_error for a mixed noun missing -en', () => {
    const herzDat: NpTarget = { noun: noun('Herz'), num: 'sg', case: 'dat', det: 'def' };
    expect(gradeNp(herzDat, 'dem Herz').errorClass).toBe('weak_error');
  });

  it('plural_error for a singular or invented form in a plural context', () => {
    const muetterDat: NpTarget = { noun: noun('Mutter'), num: 'pl', case: 'dat', det: 'def' };
    expect(gradeNp(muetterDat, 'den Mutter').errorClass).toBe('plural_error');
    expect(gradeNp(muetterDat, 'den Mutters').errorClass).toBe('plural_error');
  });

  it('no typo tolerance when the typed word is another form: Mutter for Mütter', () => {
    // One substitution before the ending, but `die Mutter` is the singular:
    // a valid NP in the other number, so step 0 makes it a number error.
    const muetterNom: NpTarget = { noun: noun('Mutter'), num: 'pl', case: 'nom', det: 'def' };
    expect(gradeNp(muetterNom, 'die Mutter')).toMatchObject({
      correct: false,
      errorClass: 'number_error',
    });
  });

  it('ending_error for the archaic dative -e', () => {
    const kindDat: NpTarget = { noun: noun('Kind'), num: 'sg', case: 'dat', det: 'def' };
    expect(gradeNp(kindDat, 'dem Kinde').errorClass).toBe('ending_error');
  });

  it('a number error in the plural: den Kindern ← dem Kind', () => {
    expect(gradeNp(kinderDat, 'dem Kind').errorClass).toBe('number_error');
  });

  it('prep_error when the preposition is wrong, keeping the NP class', () => {
    const grade = gradeNp(mitKind, 'bei den Kind');
    expect(grade.errorClass).toBe('prep_error');
    expect(grade.secondary).toEqual(['det_error']);
  });

  it('no_answer for empty input', () => {
    expect(gradeNp(nachbarDat, '  ').errorClass).toBe('no_answer');
  });
});
