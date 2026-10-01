/**
 * Multiple-choice meanings (`bedeutung` and placement): the word's short
 * meanings plus three from other core words of the same part of speech and
 * similar frequency, with no word in common. Deterministic per seed, so the
 * grader rebuilds exactly the options the screen showed.
 */
import { meaningLabel, meaningWords, seededRng } from '@wortduell/core';
import type { Lemma, MeaningEntry, Repo } from './repo';

export const CHOICE_COUNT = 4;
/** Distractors come from this many core words nearest in frequency. */
const NEIGHBOURS = 40;

export interface MeaningChoice {
  options: string[];
  answer: string;
}

const byPos = new WeakMap<MeaningEntry[], Map<string, MeaningEntry[]>>();

/** Core words of the same part of speech nearest in frequency. */
function neighbours(repo: Repo, lemma: Lemma): MeaningEntry[] {
  const all = repo.meaningPool();
  let index = byPos.get(all);
  if (!index) {
    index = new Map();
    for (const e of all) index.set(e.pos, [...(index.get(e.pos) ?? []), e]);
    byPos.set(all, index);
  }
  const same = index.get(lemma.pos) ?? [];
  let at = same.findIndex((e) => e.freqRank >= (lemma.freqRank ?? 0));
  if (at < 0) at = same.length;
  const from = Math.max(0, Math.min(at - NEIGHBOURS / 2, same.length - NEIGHBOURS - 1));
  return same.slice(from, from + NEIGHBOURS + 1).filter((e) => e.id !== lemma.id);
}

export function meaningChoice(repo: Repo, lemma: Lemma, seed: number): MeaningChoice {
  const answer = meaningLabel(lemma.meanings);
  const taken = meaningWords(lemma.meanings);
  const pool = neighbours(repo, lemma);
  const rand = seededRng(seed);
  const options = [answer];
  while (pool.length > 0 && options.length < CHOICE_COUNT) {
    const [pick] = pool.splice(Math.floor(rand() * pool.length), 1) as [MeaningEntry];
    const label = meaningLabel(pick.meanings);
    const words = meaningWords(pick.meanings);
    if (options.includes(label) || [...words].some((w) => taken.has(w))) continue;
    for (const w of words) taken.add(w);
    options.push(label);
  }
  // Shuffle so the answer's position is no hint.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j] as string, options[i] as string];
  }
  return { options, answer };
}
