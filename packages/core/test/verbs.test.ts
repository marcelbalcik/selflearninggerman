import { describe, expect, it } from 'vitest';
import { checkVerb, zuInfinitive } from '../src/verbs';

describe('verb helpers (spec §4.3)', () => {
  it('zu-infinitive: inside for separable verbs, before otherwise', () => {
    expect(zuInfinitive({ infinitive: 'anrufen', prefix: 'an', separable: true })).toBe(
      'anzurufen',
    );
    expect(zuInfinitive({ infinitive: 'besuchen', prefix: null, separable: false })).toBe(
      'zu besuchen',
    );
    expect(zuInfinitive({ infinitive: 'übersetzen', prefix: 'über', separable: true })).toBe(
      'überzusetzen',
    );
  });

  it('accepts well-formed participles', () => {
    const ok = [
      { infinitive: 'anrufen', prefix: 'an', separable: true, partizip2: 'angerufen' },
      { infinitive: 'einkaufen', prefix: 'ein', separable: true, partizip2: 'eingekauft' },
      { infinitive: 'besuchen', prefix: null, separable: false, partizip2: 'besucht' },
      { infinitive: 'verstehen', prefix: null, separable: false, partizip2: 'verstanden' },
      { infinitive: 'studieren', prefix: null, separable: false, partizip2: 'studiert' },
      { infinitive: 'übersetzen', prefix: null, separable: false, partizip2: 'übersetzt' },
      { infinitive: 'übersetzen', prefix: 'über', separable: true, partizip2: 'übergesetzt' },
      { infinitive: 'vorbereiten', prefix: 'vor', separable: true, partizip2: 'vorbereitet' },
    ];
    for (const v of ok) expect(checkVerb(v), v.infinitive).toEqual([]);
  });

  it('flags participles that break the rules', () => {
    expect(
      checkVerb({ infinitive: 'besuchen', prefix: null, separable: false, partizip2: 'gebesucht' }),
    ).toEqual(['partizip2_unexpected_ge']);
    expect(
      checkVerb({ infinitive: 'anrufen', prefix: 'an', separable: true, partizip2: 'anrufen' }),
    ).toEqual(['partizip2_separable_shape']);
  });
});
