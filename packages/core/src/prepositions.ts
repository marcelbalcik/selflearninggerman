/**
 * Preposition classes behind the preposition skills (spec §5.2).
 */
import type { Case, PrepSkill } from './types';

export const DATIVE_PREPOSITIONS: readonly string[] = [
  'aus',
  'außer',
  'bei',
  'mit',
  'nach',
  'seit',
  'von',
  'zu',
  'gegenüber',
];
export const ACCUSATIVE_PREPOSITIONS: readonly string[] = [
  'bis',
  'durch',
  'für',
  'gegen',
  'ohne',
  'um',
];
/** Two-way prepositions: dative for location, accusative for direction. */
export const TWO_WAY_PREPOSITIONS: readonly string[] = [
  'an',
  'auf',
  'hinter',
  'in',
  'neben',
  'über',
  'unter',
  'vor',
  'zwischen',
];

/** The skill a preposition with this case exercises, or null if it is none of the above. */
export function prepSkillFor(prep: string, kase: Case): PrepSkill | null {
  const p = prep.toLowerCase();
  if (TWO_WAY_PREPOSITIONS.includes(p)) {
    if (kase === 'dat') return 'prep.wechsel.loc';
    if (kase === 'akk') return 'prep.wechsel.dir';
    return null;
  }
  if (DATIVE_PREPOSITIONS.includes(p) && kase === 'dat') return 'prep.dat';
  if (ACCUSATIVE_PREPOSITIONS.includes(p) && kase === 'akk') return 'prep.akk';
  return null;
}
