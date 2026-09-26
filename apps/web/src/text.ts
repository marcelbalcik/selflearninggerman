/** Insert text at the caret of an input value (the umlaut row, spec §6). */
export function insertAt(
  value: string,
  start: number,
  end: number,
  text: string,
): { value: string; caret: number } {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/** Join tokens into a sentence: no space before punctuation. */
export function joinTokens(tokens: string[]): string {
  return tokens.reduce(
    (out, t, i) => (i === 0 || /^[.,!?;:)»“]/u.test(t) ? out + t : `${out} ${t}`),
    '',
  );
}
