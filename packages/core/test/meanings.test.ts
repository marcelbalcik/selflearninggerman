import { describe, expect, it } from 'vitest';
import { meaningLabel, meaningWords, shortMeanings } from '../src/meanings';

describe('short meanings', () => {
  it('drops grammar notes and keeps translations', () => {
    expect(
      shortMeanings('verb', 'As a copulative verb; As an intransitive verb', [
        'as a copulative verb',
        'be',
        'times of day',
        'exist',
      ]),
    ).toEqual(['to be']);
    expect(shortMeanings('verb', 'to have; to have, get', ['have'])).toEqual(['to have', 'to get']);
    expect(shortMeanings('adv', 'after all; used for emphasis', [])).toEqual(['after all']);
    expect(shortMeanings('noun', 'house, building; home', [])).toEqual([
      'house',
      'building',
      'home',
    ]);
  });

  it('does not put "to" before modals, and keeps prose glosses as a last resort', () => {
    expect(shortMeanings('verb', 'can; may', [])).toEqual(['can', 'may']);
    expect(shortMeanings('verb', 'to think; not to forget', [])).toEqual([
      'to think',
      'not to forget',
    ]);
    expect(shortMeanings('verb', 'to continue with something', [])).toEqual([
      'to continue with something',
    ]);
  });

  it('labels with at most two meanings', () => {
    expect(meaningLabel(['to stand', 'to be', 'to be written'])).toBe('to stand, to be');
    expect([...meaningWords(['to stand', 'to be'])]).toEqual(['stand', 'be']);
  });
});
