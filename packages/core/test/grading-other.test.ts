import { describe, expect, it } from 'vitest';
import { lexicalFacets, sentenceFacets } from '../src/facets';
import { gradeFehlersuche, gradeGloss, normalizeGloss } from '../src/grading-other';

describe('bedeutung grading', () => {
  const accepted = ['table', 'desk', 'dining table'];
  it('accepts any gloss, ignoring case, articles and to', () => {
    expect(gradeGloss(accepted, 'The Table').correct).toBe(true);
    expect(gradeGloss(['to help', 'assist'], 'to help').correct).toBe(true);
    expect(gradeGloss(['help'], 'to help').correct).toBe(true);
  });
  it('folds British spelling', () => {
    expect(normalizeGloss('colour')).toBe(normalizeGloss('color'));
    expect(gradeGloss(['center'], 'centre').correct).toBe(true);
  });
  it('tolerates a stem typo with a note', () => {
    expect(gradeGloss(['colleague'], 'coleague')).toMatchObject({
      correct: true,
      typoTolerated: true,
    });
  });
  it('rejects wrong or empty answers', () => {
    expect(gradeGloss(accepted, 'chair').correct).toBe(false);
    expect(gradeGloss(accepted, '').correct).toBe(false);
  });
});

describe('fehlersuche grading', () => {
  const gap = {
    tokens: ['Danke', 'für', 'dein', 'Antwort', '.'],
    error_index: 2,
    wrong: 'dein',
    correct: 'deine',
  };
  it('needs the right token and the exact correction', () => {
    expect(gradeFehlersuche(gap, 2, 'deine').correct).toBe(true);
    expect(gradeFehlersuche(gap, 2, 'Deine').correct).toBe(true);
    expect(gradeFehlersuche(gap, 2, 'deinen')).toMatchObject({ correct: false, foundError: true });
    expect(gradeFehlersuche(gap, 3, 'deine')).toMatchObject({ correct: false, foundError: false });
  });
});

describe('facets (spec §5.1)', () => {
  it('nouns: meaning, gender, plural, weak', () => {
    const f = lexicalFacets({
      pos: 'noun',
      noun: { weak: true, mixed: false, pluralOnly: false, noPlural: false },
    });
    expect(f.map((x) => x.facet)).toEqual([
      'meaning_recv',
      'meaning_prod',
      'gender',
      'plural',
      'weak',
    ]);
    expect(f.find((x) => x.facet === 'meaning_prod')?.unlocked).toBe(false);
  });
  it('verbs: frame only when approved and non-empty', () => {
    const base = { separable: true, dualPrefix: false, stemChange: false, frameApproved: true };
    const withFrame = lexicalFacets({
      pos: 'verb',
      verb: { ...base, frame: { objects: ['akk'] } },
    });
    const noFrame = lexicalFacets({ pos: 'verb', verb: { ...base, frame: { objects: [] } } });
    expect(withFrame.map((x) => x.facet)).toContain('frame');
    expect(noFrame.map((x) => x.facet)).not.toContain('frame');
    expect(withFrame.map((x) => x.facet)).toContain('separable');
  });
  it('a kasus_luecke gap implicates weak and the governing verb frame', () => {
    const s = sentenceFacets({
      lemmaId: 1,
      targetFacet: 'gender',
      exerciseType: 'kasus_luecke',
      skillIds: ['case.dat.m'],
      features: { case: 'dat', number: 'sg' },
      governor: { type: 'verb', lemma_id: 2 },
      nounIsWeak: true,
    });
    expect(s.lexical).toEqual([
      { lemmaId: 1, facet: 'gender' },
      { lemmaId: 1, facet: 'weak' },
      { lemmaId: 2, facet: 'frame' },
    ]);
    expect(s.skills).toEqual(['case.dat.m']);
  });
});

describe('M4 graders', () => {
  it('closed answers: exact endings, stem typos tolerated', async () => {
    const { gradeClosed } = await import('../src/grading-other');
    expect(gradeClosed(['den Tischen'], 'den Tischen').correct).toBe(true);
    expect(gradeClosed(['den Tischen'], 'den Tische').correct).toBe(false);
    expect(gradeClosed(['er ist geblieben'], 'Er ist geblieben.').correct).toBe(true);
    expect(gradeClosed(['helfen'], 'hlefen')).toMatchObject({ correct: true, typoTolerated: true });
  });
  it('satzbau: variants, optional commas and stops', async () => {
    const { gradeSentence } = await import('../src/grading-other');
    const accepted = ['Ich rufe ihn heute an', 'Heute rufe ich ihn an'];
    expect(gradeSentence(accepted, 'heute rufe ich ihn an.').correct).toBe(true);
    expect(gradeSentence(accepted, 'Ich rufe heute ihn an').correct).toBe(false);
    expect(
      gradeSentence(['weil ich ihn heute anrufe'], '…, weil ich ihn heute anrufe').correct,
    ).toBe(true);
    expect(
      gradeSentence(
        ['Ich vergesse nicht, ihn heute anzurufen'],
        'Ich vergesse nicht ihn heute anzurufen',
      ).correct,
    ).toBe(true);
  });
  it('diktat: exact target word, small slips elsewhere pass', async () => {
    const { gradeDiktat } = await import('../src/grading-other');
    const s = 'Wo ist der Eingang des Museums?';
    expect(gradeDiktat(s, 'Eingang', 'wo ist der Eingang des Museums').correct).toBe(true);
    expect(gradeDiktat(s, 'Eingang', 'Wo ist der Eingang des Musems').correct).toBe(true);
    expect(gradeDiktat(s, 'Eingang', 'Wo ist der Eingag des Museums').correct).toBe(false);
    expect(gradeDiktat(s, 'Eingang', 'Wo ist Eingang').correct).toBe(false);
  });
});
