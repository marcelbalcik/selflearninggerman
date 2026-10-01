/**
 * The shared state without a server: every write is an Action in its author's
 * log; each phone holds both logs and replays them, in one fixed order, onto
 * the base database (content only). Same actions → same database, on both
 * phones, whatever order they arrived in.
 *
 * - Order: by time, then author. An author's own actions have strictly
 *   increasing times.
 * - New actions later than everything applied (and later than the last read,
 *   whose settlement tick may already have settled a day) are applied in
 *   place. Anything earlier rebuilds from the newest checkpoint before it.
 * - A checkpoint is the database just before the first action of a learning
 *   day: everything before that day's start, plus settlements up to it.
 *
 * Storage and the network are the caller's (apps/web: IndexedDB and GitHub).
 */
import { dayKey, dayStart } from '@wortduell/core';
import type { Clock } from '@wortduell/core';
import type { Db } from './db';
import { Engine } from './router';
import type { Method, Response } from './router';

export interface Action {
  /** `${user}:${ts}` — unique, since an author's times strictly increase. */
  id: string;
  user: number;
  ts: string;
  method: Exclude<Method, 'GET'>;
  path: string;
  body: unknown;
}

/** Opens databases from bytes and exports them (better-sqlite3 or sql.js). */
export interface DbHost {
  open(bytes: Uint8Array): Db;
  save(db: Db): Uint8Array;
  close(db: Db): void;
}

export function compareActions(a: Action, b: Action): number {
  return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.user - b.user;
}

export interface Checkpoint {
  /** Day start (ISO); the state holds every action known before it… */
  at: string;
  /** …which were this many. A later-arriving earlier action makes it stale. */
  count: number;
  bytes: Uint8Array;
}

export interface StoreOptions {
  host: DbHost;
  base: Uint8Array;
  users: string[];
  clock: Clock;
  /** How many day checkpoints to keep (the newest ones). */
  keepCheckpoints?: number;
  /** The kept checkpoints changed (apps/web mirrors them to IndexedDB). */
  onCheckpoints?: (all: readonly Checkpoint[]) => void;
  /** Checkpoints taken earlier, to start from (newest used first). */
  checkpoints?: Checkpoint[];
}

export class Store {
  db!: Db;
  engine!: Engine;
  /** Every known action, in replay order. */
  private actions: Action[] = [];
  private readonly ids = new Set<string>();
  /** Actions applied to the current database (a prefix of `actions`). */
  private appliedCount = 0;
  /** Latest instant the current database reflects (last action or read). */
  private highWater = '';
  private checkpoints: Checkpoint[] = [];
  private lastOwn = new Map<number, number>();
  /** Replays since start (tests, diagnostics). */
  rebuilds = 0;

  constructor(private readonly o: StoreOptions) {
    this.checkpoints = [...(o.checkpoints ?? [])].sort((a, b) => a.at.localeCompare(b.at));
    this.load(null);
  }

  private load(from: Checkpoint | null): void {
    if (this.db) this.o.host.close(this.db);
    this.db = this.o.host.open(from ? from.bytes : this.o.base);
    this.engine = new Engine(this.db, this.o.clock);
    this.engine.seedUsers(this.o.users);
  }

  /** Known actions (for sync: which ids the other side still needs). */
  all(): readonly Action[] {
    return this.actions;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  /**
   * Add actions (from storage at start-up, or the other phone's log). Returns
   * whether the database had to be rebuilt.
   */
  receive(incoming: Action[]): boolean {
    const fresh = incoming.filter((a) => !this.ids.has(a.id)).sort(compareActions);
    if (fresh.length === 0) return false;
    for (const a of fresh) {
      this.ids.add(a.id);
      const t = Date.parse(a.ts);
      if (t > (this.lastOwn.get(a.user) ?? 0)) this.lastOwn.set(a.user, t);
    }
    const earliest = fresh[0] as Action;
    const inPlace = this.highWater !== '' && earliest.ts > this.highWater;
    this.actions = [...this.actions, ...fresh].sort(compareActions);
    if (inPlace) {
      this.applyPending();
      return false;
    }
    this.rebuild();
    return true;
  }

  /** A new action by `user` now: recorded and applied; returns the route's response. */
  write(
    user: number,
    method: Action['method'],
    path: string,
    body: unknown,
  ): { action: Action; response: Response } {
    const now = this.o.clock.now().getTime();
    const ts = new Date(Math.max(now, (this.lastOwn.get(user) ?? 0) + 1)).toISOString();
    const action: Action = { id: `${user}:${ts}`, user, ts, method, path, body };
    let response: Response | null = null;
    this.capture = (a, r) => {
      if (a.id === action.id) response = r;
    };
    try {
      this.receive([action]);
    } finally {
      this.capture = null;
    }
    return { action, response: response ?? { status: 500, body: { error: 'not applied' } } };
  }

  /** A read at the current time (runs the settlement tick). */
  read(user: number, path: string): Response {
    const now = this.o.clock.now();
    const res = this.engine.call(user, 'GET', path, undefined, now);
    const iso = now.toISOString();
    if (iso > this.highWater) this.highWater = iso;
    return res;
  }

  private capture: ((a: Action, r: Response) => void) | null = null;

  private applyPending(): void {
    while (this.appliedCount < this.actions.length) {
      const a = this.actions[this.appliedCount] as Action;
      const dayAt = dayStart(dayKey(new Date(a.ts))).toISOString();
      const last = this.checkpoints[this.checkpoints.length - 1];
      if ((!last || last.at < dayAt) && this.appliedCount > 0) this.checkpoint(dayAt);
      const res = this.engine.call(a.user, a.method, a.path, a.body, new Date(a.ts));
      this.capture?.(a, res);
      this.appliedCount += 1;
      if (a.ts > this.highWater) this.highWater = a.ts;
    }
  }

  private checkpoint(at: string): void {
    const c: Checkpoint = { at, count: this.appliedCount, bytes: this.o.host.save(this.db) };
    this.checkpoints.push(c);
    const keep = this.o.keepCheckpoints ?? 3;
    if (this.checkpoints.length > keep) this.checkpoints.splice(0, this.checkpoints.length - keep);
    this.o.onCheckpoints?.(this.checkpoints);
  }

  /** How many known actions come before an instant. */
  private countBefore(at: string): number {
    let n = 0;
    while (n < this.actions.length && (this.actions[n] as Action).ts < at) n += 1;
    return n;
  }

  /** Rebuild from the newest checkpoint still holding every earlier action (or from the base). */
  private rebuild(): void {
    this.rebuilds += 1;
    let from: Checkpoint | null = null;
    for (const c of [...this.checkpoints].reverse()) {
      if (c.count === this.countBefore(c.at)) {
        from = c;
        break;
      }
    }
    const kept = from ? this.checkpoints.filter((c) => c.at <= from.at) : [];
    if (kept.length !== this.checkpoints.length) {
      this.checkpoints = kept;
      this.o.onCheckpoints?.(this.checkpoints);
    }
    this.load(from);
    this.appliedCount = from ? from.count : 0;
    this.highWater = from ? from.at : '';
    this.applyPending();
  }

  /** The checkpoints currently kept (apps/web persists them). */
  kept(): readonly Checkpoint[] {
    return this.checkpoints;
  }
}
