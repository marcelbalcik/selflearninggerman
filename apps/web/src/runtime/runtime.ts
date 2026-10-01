/**
 * The app without a server: the engine and SQLite (sql.js) run on the phone,
 * both people's action logs are kept in IndexedDB and synced through a private
 * GitHub repository (runtime/github.ts). The screens call `runtime.request`
 * exactly as they used to call the HTTP API.
 *
 * Start-up: config → base database → saved checkpoints and logs → replay →
 * password (to unlock the sync token) → "Wer bist du?" → the app.
 */
import { systemClock } from '@wortduell/core';
import { Store, compareActions } from '@wortduell/engine';
import type { Action, Checkpoint } from '@wortduell/engine';
import { sqlJsHost } from '@wortduell/engine/sqljs';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { open } from './crypto';
import type { Sealed } from './crypto';
import { Conflict, GitHub } from './github';
import type { SyncConfig } from './github';
import { idb } from './idb';

export interface AppConfig {
  users: string[];
  /**
   * Raise it to start over: every phone discards its progress and syncs into
   * a fresh folder of the data repository (the old logs are kept, unused).
   */
  generation?: number;
  sync?: SyncConfig & { token: Sealed };
}

export type Phase = 'loading' | 'locked' | 'choose' | 'ready' | 'failed';

export interface SyncState {
  enabled: boolean;
  lastSync: string | null;
  pending: number;
  error: string | null;
  busy: boolean;
}

export interface RuntimeState {
  phase: Phase;
  users: string[];
  me: number | null;
  sync: SyncState;
  /** Increases whenever the other phone's actions changed the data. */
  version: number;
  error: string | null;
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const LS_TOKEN = 'wortduell.token';
const LS_ME = 'wortduell.me';
/** Which shared space (data repository and names) this phone's data belongs to. */
const LS_SPACE = 'wortduell.space';
const POLL_MS = 60_000;
const PUSH_DELAY_MS = 3_000;

const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Private mode: the phone just asks again next time.
  }
};

const dayOf = (a: Action) => a.ts.slice(0, 10);
/** Log folder of a generation: `log/` for the first, `g2/log/` and so on after a restart. */
const folderOf = (generation: number) => (generation > 1 ? `g${generation}/log/` : 'log/');

function union(a: Action[], b: Action[]): Action[] {
  const seen = new Map<string, Action>();
  for (const x of [...a, ...b]) seen.set(x.id, x);
  return [...seen.values()].sort(compareActions);
}

class Runtime {
  private config: AppConfig = { users: ['Person 1', 'Person 2'] };
  private store: Store | null = null;
  private github: GitHub | null = null;
  private shas = new Map<string, string>();
  private dirty = new Set<string>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private syncing: Promise<void> | null = null;
  private s: RuntimeState = {
    phase: 'loading',
    users: [],
    me: null,
    sync: { enabled: false, lastSync: null, pending: 0, error: null, busy: false },
    version: 0,
    error: null,
  };

  state(): RuntimeState {
    return this.s;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<RuntimeState>): void {
    this.s = { ...this.s, ...patch };
    for (const fn of this.listeners) fn();
  }

  private setSync(patch: Partial<SyncState>): void {
    this.set({ sync: { ...this.s.sync, ...patch } });
  }

  private booting: Promise<void> | null = null;

  /** Start once (React may call it twice in development). */
  boot(): Promise<void> {
    this.booting ??= this.start();
    return this.booting;
  }

  private async start(): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL;
      const cfgRes = await fetch(`${base}wortduell.config.json`, { cache: 'no-store' });
      if (cfgRes.ok) this.config = (await cfgRes.json()) as AppConfig;
      // Data from another space (e.g. trying the app before sync was set up)
      // must not end up in the shared logs under a guessed name: start fresh
      // and ask who this is again.
      const space = JSON.stringify([
        this.config.sync ? `${this.config.sync.owner}/${this.config.sync.repo}` : 'local',
        this.config.users,
        this.config.generation ?? 1,
      ]);
      if (lsGet(LS_SPACE) !== space) {
        for (const prefix of ['log:', 'cp', 'dirty', 'shas']) {
          for (const k of await idb.keys(prefix)) await idb.del(k);
        }
        lsSet(LS_ME, null);
        lsSet(LS_TOKEN, null);
        lsSet(LS_SPACE, space);
      }
      const meta = (await (await fetch(`${base}data/base.json`, { cache: 'no-store' })).json()) as {
        file: string;
        version: string;
      };
      let baseBytes = await idb.get<Uint8Array>(`base:${meta.version}`);
      if (!baseBytes) {
        baseBytes = new Uint8Array(await (await fetch(`${base}data/${meta.file}`)).arrayBuffer());
        for (const k of await idb.keys('base:')) await idb.del(k);
        await idb.set(`base:${meta.version}`, baseBytes);
      }
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      // Checkpoints contain the content, so they only fit the same base.
      const saved =
        (await idb.get<string>('cpBase')) === meta.version ? await idb.get<Checkpoint[]>('cp') : [];
      this.store = new Store({
        host: sqlJsHost(SQL),
        base: baseBytes,
        users: this.config.users,
        clock: systemClock,
        checkpoints: saved ?? [],
        onCheckpoints: (all) => {
          void idb.set('cp', [...all]).then(() => idb.set('cpBase', meta.version));
        },
      });
      const all: Action[] = [];
      for (const k of await idb.keys('log:')) all.push(...((await idb.get<Action[]>(k)) ?? []));
      this.store.receive(all);
      this.shas = new Map(Object.entries((await idb.get<Record<string, string>>('shas')) ?? {}));
      this.dirty = new Set((await idb.get<string[]>('dirty')) ?? []);

      const me = Number(lsGet(LS_ME));
      this.set({
        users: this.config.users,
        me: me === 1 || me === 2 ? me : null,
        sync: { ...this.s.sync, enabled: Boolean(this.config.sync), pending: this.dirty.size },
      });
      if (this.config.sync) {
        const token = lsGet(LS_TOKEN);
        if (!token) return this.set({ phase: 'locked' });
        this.startSync(token);
      }
      this.set({ phase: this.s.me ? 'ready' : 'choose' });
    } catch (err) {
      this.set({ phase: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** The shared password unlocks the sync token; false when it is wrong. */
  async unlock(password: string): Promise<boolean> {
    if (!this.config.sync) return true;
    const token = await open(this.config.sync.token, password);
    if (!token) return false;
    lsSet(LS_TOKEN, token);
    this.startSync(token);
    this.set({ phase: this.s.me ? 'ready' : 'choose' });
    return true;
  }

  choose(user: number): void {
    lsSet(LS_ME, String(user));
    this.set({ me: user, phase: 'ready' });
  }

  /** "Person wechseln": ask again who uses this phone. */
  forgetUser(): void {
    lsSet(LS_ME, null);
    this.set({ me: null, phase: 'choose' });
  }

  /** The app's API, answered locally. Writes are recorded and synced. */
  request<T>(method: string, url: string, body?: unknown): T {
    const store = this.store;
    const me = this.s.me;
    if (!store || !me) throw new RequestError(401, 'not ready');
    if (method === 'GET') {
      const r = store.read(me, url);
      if (r.status !== 200)
        throw new RequestError(r.status, (r.body as { error?: string }).error ?? 'error');
      return r.body as T;
    }
    const { action, response } = store.write(me, method as Action['method'], url, body ?? {});
    void this.persistOwn(action);
    if (response.status !== 200)
      throw new RequestError(
        response.status,
        (response.body as { error?: string }).error ?? 'error',
      );
    return response.body as T;
  }

  private async persistOwn(a: Action): Promise<void> {
    const key = `log:${a.user}:${dayOf(a)}`;
    await idb.set(key, union((await idb.get<Action[]>(key)) ?? [], [a]));
    this.dirty.add(dayOf(a));
    await idb.set('dirty', [...this.dirty]);
    this.setSync({ pending: this.dirty.size });
    if (this.github) {
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => void this.syncNow(), PUSH_DELAY_MS);
    }
  }

  private startSync(token: string): void {
    if (!this.config.sync) return;
    this.github = new GitHub(this.config.sync, token);
    void this.syncNow();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, POLL_MS);
    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    });
  }

  /** Fetch the other phone's new actions, then send ours. */
  syncNow(): Promise<void> {
    this.syncing ??= this.sync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async sync(): Promise<void> {
    const gh = this.github;
    const store = this.store;
    if (!gh || !store) return;
    this.setSync({ busy: true });
    try {
      let changed = false;
      for (const f of await gh.list()) {
        if (this.shas.get(f.path) === f.sha) continue;
        const folder = folderOf(this.config.generation ?? 1);
        if (!f.path.startsWith(folder)) continue; // another generation
        const m = /^(\d)\/(\d{4}-\d{2}-\d{2})\.json$/u.exec(f.path.slice(folder.length));
        if (!m) continue;
        const remote = JSON.parse(await gh.read(f.sha)) as Action[];
        const key = `log:${m[1]}:${m[2]}`;
        await idb.set(key, union((await idb.get<Action[]>(key)) ?? [], remote));
        if (remote.some((a) => !store.has(a.id))) {
          store.receive(remote);
          changed = true;
        }
        this.shas.set(f.path, f.sha);
      }
      const me = this.s.me;
      for (const day of [...this.dirty]) {
        if (!me) break;
        const user = Number(me);
        const path = `${folderOf(this.config.generation ?? 1)}${user}/${day}.json`;
        const key = `log:${user}:${day}`;
        let local = (await idb.get<Action[]>(key)) ?? [];
        try {
          this.shas.set(
            path,
            await gh.write(path, JSON.stringify(local), this.shas.get(path) ?? null),
          );
        } catch (err) {
          if (!(err instanceof Conflict)) throw err;
          // The same person on another device wrote this day too: merge and retry.
          const remote = await gh.readPath(path);
          const theirs = remote ? (JSON.parse(remote.text) as Action[]) : [];
          if (theirs.some((a) => !store.has(a.id))) {
            store.receive(theirs);
            changed = true;
          }
          local = union(local, theirs);
          await idb.set(key, local);
          this.shas.set(path, await gh.write(path, JSON.stringify(local), remote?.sha ?? null));
        }
        this.dirty.delete(day);
      }
      await idb.set('shas', Object.fromEntries(this.shas));
      await idb.set('dirty', [...this.dirty]);
      this.setSync({ lastSync: new Date().toISOString(), pending: this.dirty.size, error: null });
      if (changed) this.set({ version: this.s.version + 1 });
    } catch (err) {
      this.setSync({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.setSync({ busy: false });
    }
  }
}

export const runtime = new Runtime();
