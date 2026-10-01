/**
 * Deterministic ids for rows the app refers to later (attempts, disputes,
 * vouchers, …). Both phones replay the same actions, but not always in the
 * same order while a sync is under way; an id derived from the action that
 * created the row (its time and author) stays the same either way, so a later
 * action ("dispute attempt 123") means the same row on both phones.
 *
 * id = key × 1000 + n, where key = time in ms × 4 + author (1, 2; 3 for the
 * settlement at a day boundary) and n counts the rows the action creates.
 * Without a key (direct service calls in unit tests) SQLite assigns the id.
 */
export class Ids {
  private key = 0;
  private n = 0;

  /** Run `fn` with ids derived from `key`. */
  scope<T>(key: number, fn: () => T): T {
    const saved = { key: this.key, n: this.n };
    this.key = key;
    this.n = 0;
    try {
      return fn();
    } finally {
      this.key = saved.key;
      this.n = saved.n;
    }
  }

  next(): number | null {
    if (this.key === 0) return null;
    this.n += 1;
    if (this.n >= 1000) throw new Error('too many rows for one action');
    return this.key * 1000 + this.n;
  }
}

export function actionKey(at: Date, userId: number): number {
  return at.getTime() * 4 + userId;
}

export function boundaryKey(at: Date): number {
  return at.getTime() * 4 + 3;
}
