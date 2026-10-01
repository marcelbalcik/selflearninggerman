/**
 * Verb helpers (spec §4.3): prefix classes, zu-infinitive and plausibility
 * checks on stored verb data. Like the declension engine, these cross-check
 * Wiktionary data; they never supply forms on their own.
 */

/** Always-separable prefixes, longest first so `zurück` wins over `zu`. */
export const SEPARABLE_PREFIXES: readonly string[] = [
  'zusammen',
  'weiter',
  'zurück',
  'heraus',
  'herein',
  'hinaus',
  'hinein',
  'herum',
  'herunter',
  'hinunter',
  'herauf',
  'hinauf',
  'vorbei',
  'fort',
  'fest',
  'nach',
  'auf',
  'aus',
  'bei',
  'ein',
  'her',
  'hin',
  'los',
  'mit',
  'weg',
  'vor',
  'ab',
  'an',
  'zu',
];

export const INSEPARABLE_PREFIXES: readonly string[] = [
  'miss',
  'emp',
  'ent',
  'zer',
  'be',
  'er',
  'ge',
  'ver',
];

/** Separability depends on sense and stress (`übersetzen`). */
export const DUAL_PREFIXES: readonly string[] = [
  'wieder',
  'hinter',
  'durch',
  'wider',
  'unter',
  'über',
  'voll',
  'um',
];

export type Aux = 'haben' | 'sein' | 'both';

/** Stored verb data (spec §4.1 `verb`), as the helpers consume it. */
export interface VerbInput {
  infinitive: string;
  /** Separable prefix, e.g. `an` for `anrufen`; null when not separable. */
  prefix: string | null;
  separable: boolean;
  partizip2: string;
  zuInfinitive?: string | null;
}

/** `anzurufen` for separable verbs, `zu besuchen` otherwise. */
export function zuInfinitive(verb: Pick<VerbInput, 'infinitive' | 'prefix' | 'separable'>): string {
  if (verb.separable && verb.prefix !== null && verb.infinitive.startsWith(verb.prefix)) {
    return `${verb.prefix}zu${verb.infinitive.slice(verb.prefix.length)}`;
  }
  return `zu ${verb.infinitive}`;
}

export type VerbIssue =
  | 'separable_without_prefix'
  | 'prefix_not_at_start'
  | 'partizip2_separable_shape'
  | 'partizip2_unexpected_ge'
  | 'zu_infinitive_mismatch';

/**
 * Plausibility of stored verb data against the §4.3 rules. Any issue sends
 * the lemma to review.
 */
export function checkVerb(verb: VerbInput): VerbIssue[] {
  const issues: VerbIssue[] = [];
  const { infinitive, prefix, partizip2 } = verb;
  if (verb.separable) {
    if (prefix === null) return ['separable_without_prefix'];
    if (!infinitive.startsWith(prefix)) return ['prefix_not_at_start'];
    // Separable: prefix + ge + stem (angerufen), except when the base verb
    // itself takes no ge- (einstudiert, abbestellt, vorbereitet).
    const rest = partizip2.slice(prefix.length);
    const base = infinitive.slice(prefix.length);
    const baseTakesNoGe = base.endsWith('ieren') || hasInseparablePrefix(base);
    if (!partizip2.startsWith(prefix) || (!baseTakesNoGe && !rest.startsWith('ge'))) {
      issues.push('partizip2_separable_shape');
    }
  } else if (
    (hasInseparablePrefix(infinitive) || infinitive.endsWith('ieren')) &&
    partizip2.startsWith('ge') &&
    !infinitive.startsWith('ge')
  ) {
    issues.push('partizip2_unexpected_ge');
  }
  if (
    verb.zuInfinitive !== undefined &&
    verb.zuInfinitive !== null &&
    verb.zuInfinitive !== zuInfinitive(verb)
  ) {
    issues.push('zu_infinitive_mismatch');
  }
  return issues;
}

function hasInseparablePrefix(word: string): boolean {
  // A prefix only counts when a stem follows (`erben` is not er- + ben).
  return INSEPARABLE_PREFIXES.some((p) => word.startsWith(p) && word.length - p.length >= 4);
}
