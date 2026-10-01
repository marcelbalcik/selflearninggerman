/**
 * From a graded attempt to FSRS ratings (spec §5.3, §7.3).
 *
 * Correct: every implicated facet gets Good, or Hard when the answer was slow,
 * needed typo tolerance or used a hint. Wrong: only the facets the error class
 * blames get Again; the other implicated facets are left unrated, so they stay
 * due and come back (agreed default, docs/DECISIONS.md).
 */
import { RATING } from './config';
import type { NpErrorClass, NpGrade } from './grading';
import type {
  Case,
  CaseSkill,
  ExerciseType,
  FacetKey,
  Gender,
  GramNumber,
  PrepSkill,
  Rating,
} from './types';
import { lemmaFacetKey, skillFacetKey } from './types';

/** The case skill (spec §5.2) exercised by a target cell, if there is one. */
export function caseSkillFor(num: GramNumber, kase: Case, gender: Gender | null): CaseSkill | null {
  if (kase === 'dat') {
    if (num === 'pl') return 'case.dat.pl';
    if (gender !== null) return `case.dat.${gender}`;
    return null;
  }
  if (kase === 'akk' && num === 'sg' && gender === 'm') return 'case.akk.m';
  return null;
}

export interface NpRatingContext {
  /** The noun lemma of the gap. */
  lemmaId: number;
  num: GramNumber;
  case: Case;
  gender: Gender | null;
  /** The facet the item was generated for (`sentence.target_facet`). */
  primary: FacetKey;
  /** The meaning facet the exercise exercises. */
  meaning: FacetKey;
  /** What governs the gap: a verb (its `frame` facet) or a preposition skill. */
  governor: { kind: 'verb'; lemmaId: number } | { kind: 'prep'; skill: PrepSkill } | null;
  /** Every facet and skill the exercise implicates (spec §6). */
  implicated: FacetKey[];
}

function governorFacet(ctx: NpRatingContext): FacetKey | null {
  if (ctx.governor === null) return null;
  return ctx.governor.kind === 'verb'
    ? lemmaFacetKey(ctx.governor.lemmaId, 'frame')
    : skillFacetKey(ctx.governor.skill);
}

/** Facets that get Again for one error class (spec §7.3). */
export function blamedFacets(errorClass: NpErrorClass, ctx: NpRatingContext): FacetKey[] {
  const caseSkill = caseSkillFor(ctx.num, ctx.case, ctx.gender);
  const caseFacet = caseSkill === null ? null : skillFacetKey(caseSkill);
  const governor = governorFacet(ctx);
  const keys: (FacetKey | null)[] = (() => {
    switch (errorClass) {
      case 'number_error':
      case 'ending_error':
      case 'extra_words':
      case 'no_answer':
        return [ctx.primary];
      case 'wrong_word':
        return [ctx.meaning];
      case 'case_error':
        return [caseFacet, governor];
      case 'gender_error':
        return [lemmaFacetKey(ctx.lemmaId, 'gender')];
      case 'det_error':
        return [caseFacet];
      case 'weak_error':
        return [lemmaFacetKey(ctx.lemmaId, 'weak'), skillFacetKey('case.weak_noun')];
      case 'datpl_error':
        return [skillFacetKey('case.dat.pl')];
      case 'plural_error':
        return [lemmaFacetKey(ctx.lemmaId, 'plural')];
      case 'prep_error':
        return [ctx.governor?.kind === 'prep' ? governor : ctx.primary];
      case 'ambiguous':
        // Nothing until the one-tap gender follow-up settles it.
        return [];
    }
  })();
  return [...new Set(keys.filter((k): k is FacetKey => k !== null))];
}

export interface SpeedInfo {
  latencyMs: number;
  /** The user's rolling median latency for this exercise type (`medianLatencyMs`). */
  medianLatencyMs: number;
  hintUsed: boolean;
}

/** Good, or Hard when slow, typo-tolerated or hinted. */
export function successRating(speed: SpeedInfo, typoTolerated: boolean): Rating {
  const slow = speed.latencyMs > RATING.SLOW_FACTOR * speed.medianLatencyMs;
  return slow || typoTolerated || speed.hintUsed ? 'hard' : 'good';
}

/**
 * Median latency over the user's last LATENCY_WINDOW attempts of this type,
 * oldest first; the config default below LATENCY_MIN_SAMPLES attempts.
 */
export function medianLatencyMs(recentLatenciesMs: readonly number[], type: ExerciseType): number {
  const window = recentLatenciesMs.slice(-RATING.LATENCY_WINDOW);
  if (window.length < RATING.LATENCY_MIN_SAMPLES) return RATING.DEFAULT_MEDIAN_LATENCY_MS[type];
  const sorted = [...window].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export interface FacetRating {
  facet: FacetKey;
  rating: Rating;
}

/** FSRS ratings for a graded noun-phrase attempt. */
export function rateNpAttempt(
  grade: NpGrade,
  ctx: NpRatingContext,
  speed: SpeedInfo,
): FacetRating[] {
  if (grade.correct) {
    const rating = successRating(speed, grade.typoTolerated);
    return [...new Set(ctx.implicated)].map((facet) => ({ facet, rating }));
  }
  const classes =
    grade.errorClass === null ? grade.secondary : [grade.errorClass, ...grade.secondary];
  const blamed = new Set(classes.flatMap((c) => blamedFacets(c, ctx)));
  return [...blamed].map((facet) => ({ facet, rating: 'again' as const }));
}
