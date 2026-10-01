import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Declension, Marks, frameText } from '../src/components/parts';
import { MESSAGES, translate } from '../src/i18n';
import { insertAt, joinTokens } from '../src/text';

describe('i18n (spec §3)', () => {
  it('has every key in German and English', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.de).sort());
  });
  it('fills placeholders', () => {
    expect(translate('de', 'progress', { n: 2, total: 9 })).toBe('2 von 9');
  });
});

describe('umlaut row and sentence helpers', () => {
  it('inserts at the caret and replaces a selection', () => {
    expect(insertAt('Mtter', 1, 1, 'ü')).toEqual({ value: 'Mütter', caret: 2 });
    expect(insertAt('Strasse', 4, 6, 'ß')).toEqual({ value: 'Straße', caret: 5 });
  });
  it('joins tokens without spaces before punctuation', () => {
    expect(joinTokens(['Ich', 'helfe', 'ihm', '.'])).toBe('Ich helfe ihm.');
  });
});

describe('red-pen marks (spec §10)', () => {
  it('shows wrong characters struck in red and missing ones raised', () => {
    render(
      <Marks
        marks={[
          { text: 'de', status: 'ok' },
          { text: 'n', status: 'wrong' },
          { text: ' Kinder', status: 'ok' },
          { text: 'n', status: 'missing' },
        ]}
      />,
    );
    const el = screen.getByTestId('marks');
    expect(el.querySelectorAll('.mark-wrong')).toHaveLength(1);
    expect(el.querySelectorAll('.mark-missing')).toHaveLength(1);
    expect(el.textContent).toBe('den Kindern');
  });
});

describe('declension strip', () => {
  it('shows every case with the article, no colour coding', () => {
    render(
      <Declension
        forms={{
          sg: { nom: 'der Tisch', akk: 'den Tisch', dat: 'dem Tisch', gen: 'des Tisches' },
          pl: { nom: 'die Tische', akk: 'die Tische', dat: 'den Tischen', gen: 'der Tische' },
        }}
      />,
    );
    expect(screen.getByText('dem Tisch')).toBeTruthy();
    expect(screen.getByText('den Tischen')).toBeTruthy();
    expect(document.querySelectorAll('[style*="color"]')).toHaveLength(0);
  });
  it('writes verb frames the way a dictionary does', () => {
    expect(frameText({ objects: ['dat', 'akk'] })).toBe('jdm. (Dat.), jdn./etw. (Akk.)');
    expect(frameText({ objects: [], preps: [{ prep: 'auf', case: 'akk' }] })).toBe('auf + Akk.');
  });
});
