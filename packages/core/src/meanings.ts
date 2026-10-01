/**
 * Short English meanings for display and multiple choice, taken from the
 * Wiktionary glosses. Grammar notes ("as a copulative verb", "used for
 * emphasis"), definitions in prose and other non-translations are dropped, so
 * `sein` shows "to be" rather than its dictionary entry.
 */

const NOTE =
  /\bverb\b|form of|\bused\b|indicates|\betc\b|expletive|translated|\bsentence\b|\bstatement\b|emphasis|particle|auxiliary|["()[\]]| {2}|abbreviation|clipping|ellipsis|plural of|diminutive|\bsomething\b|\bsomeone\b|^as an? /iu;
const MODAL = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']);
const STOP = new Set(['a', 'an', 'and', 'at', 'in', 'of', 'on', 'or', 'the', 'to']);
const MAX_WORDS = 4;
const MAX_CHARS = 28;
const MAX_MEANINGS = 3;

const usable = (s: string) =>
  s !== '' && !NOTE.test(s) && s.split(/\s+/u).length <= MAX_WORDS && s.length <= MAX_CHARS;

function shape(pos: string, text: string): string {
  let s = text.trim().replace(/^(a|an|the)\s+/iu, '');
  if (pos === 'verb') {
    s = s.replace(/^to\s+/iu, '');
    const first = s.split(/\s+/u)[0]?.toLowerCase() ?? '';
    if (!MODAL.has(first) && first !== 'not') s = `to ${s}`;
  }
  return s;
}

/**
 * Up to three short meanings, most common first. Falls back to the first
 * usable accepted gloss, then to the first gloss as written.
 */
export function shortMeanings(pos: string, gloss: string, accepted: readonly string[]): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const m = shape(pos, s);
    if (!out.some((o) => o.toLowerCase() === m.toLowerCase())) out.push(m);
  };
  for (const seg of gloss.split(/[;,]/u)) if (usable(seg.trim())) add(seg);
  if (out.length === 0) {
    const first = accepted.find((a) => usable(a.trim()));
    if (first) add(first);
  }
  if (out.length === 0) {
    const raw = gloss.split(';')[0]?.trim() ?? '';
    if (raw) out.push(raw);
  }
  return out.slice(0, MAX_MEANINGS);
}

/** One answer option: the first two meanings ("to stand, to be"). */
export function meaningLabel(meanings: readonly string[]): string {
  return meanings.slice(0, 2).join(', ');
}

/** The words of a meaning list, to keep distractors from overlapping the answer. */
export function meaningWords(meanings: readonly string[]): Set<string> {
  const words = new Set<string>();
  for (const m of meanings) {
    for (const w of m.toLowerCase().split(/[^\p{L}]+/u)) {
      if (w !== '' && !STOP.has(w)) words.add(w);
    }
  }
  return words;
}
