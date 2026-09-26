/**
 * Which FSRS cards a lemma gets (spec §5.1) and which facets an exercise
 * sentence exercises. Facets that no available exercise type can train yet
 * still get cards, but the queue leaves them out until one exists.
 */
import type { ExerciseType, LexicalFacet, SkillId } from './types';

export interface LemmaFacts {
  pos: 'noun' | 'verb' | 'adj' | 'adv' | 'other';
  noun?: { weak: boolean; mixed: boolean; pluralOnly: boolean; noPlural: boolean };
  verb?: {
    separable: boolean;
    dualPrefix: boolean;
    stemChange: boolean | null;
    /** Only an approved, non-empty frame gets a facet. */
    frame: { objects: string[]; preps?: unknown[] } | null;
    frameApproved: boolean;
  };
}

export interface FacetSpec {
  facet: LexicalFacet;
  /** `meaning_prod` unlocks later (FSRS.PROD_UNLOCK_STABILITY_DAYS). */
  unlocked: boolean;
}

export function lexicalFacets(l: LemmaFacts): FacetSpec[] {
  const out: FacetSpec[] = [
    { facet: 'meaning_recv', unlocked: true },
    { facet: 'meaning_prod', unlocked: false },
  ];
  if (l.pos === 'noun' && l.noun) {
    if (!l.noun.pluralOnly) out.push({ facet: 'gender', unlocked: true });
    if (!l.noun.noPlural && !l.noun.pluralOnly) out.push({ facet: 'plural', unlocked: true });
    if (l.noun.weak || l.noun.mixed) out.push({ facet: 'weak', unlocked: true });
  }
  if (l.pos === 'verb' && l.verb) {
    const f = l.verb.frame;
    const hasFrame = f !== null && (f.objects.length > 0 || (f.preps?.length ?? 0) > 0);
    if (hasFrame && l.verb.frameApproved) out.push({ facet: 'frame', unlocked: true });
    if (l.verb.separable || l.verb.dualPrefix) out.push({ facet: 'separable', unlocked: true });
    out.push({ facet: 'pp_aux', unlocked: true });
    if (l.verb.stemChange === true) out.push({ facet: 'stem_change', unlocked: true });
  }
  return out;
}

/** What one exercise sentence can rate, besides its own target facet. */
export interface SentenceFacets {
  lexical: { lemmaId: number; facet: LexicalFacet }[];
  skills: SkillId[];
}

export interface SentenceInfo {
  lemmaId: number;
  targetFacet: LexicalFacet;
  exerciseType: ExerciseType;
  skillIds: SkillId[];
  /** kasus_luecke / fehlersuche: the gap's features. */
  features?: { case: string; number: string } | null;
  governor?: { type: string; lemma_id?: number | null } | null;
  nounIsWeak?: boolean;
}

/** Facets a sentence implicates (spec §6), whether or not the user has cards for them. */
export function sentenceFacets(s: SentenceInfo): SentenceFacets {
  const lexical: SentenceFacets['lexical'] = [{ lemmaId: s.lemmaId, facet: s.targetFacet }];
  if (s.exerciseType === 'kasus_luecke' || s.exerciseType === 'fehlersuche') {
    const f = s.features;
    if (s.nounIsWeak && f?.number === 'sg' && f.case !== 'nom') {
      lexical.push({ lemmaId: s.lemmaId, facet: 'weak' });
    }
    if (s.exerciseType === 'kasus_luecke' && s.governor?.type === 'verb' && s.governor.lemma_id) {
      lexical.push({ lemmaId: s.governor.lemma_id, facet: 'frame' });
    }
  }
  return { lexical, skills: s.exerciseType === 'bedeutung' ? [] : s.skillIds };
}
