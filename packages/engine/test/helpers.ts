import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeClock, dayStart } from '@wortduell/core';
import Database from 'better-sqlite3';
import { importContent } from '../src/content';
import { migrate } from '../src/db';
import type { Db } from '../src/db';
import type { Gap } from '../src/repo';
import { Engine } from '../src/router';
import type { Method } from '../src/router';

export const CONTENT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'content',
  'content.sqlite',
);

/** What the old HTTP tests used: `app.inject` with a "cookie" naming the user. */
export interface Injected {
  statusCode: number;
  body: string;
  json: <T = Record<string, unknown>>() => T;
}

export interface TestEnv {
  app: {
    inject: (req: {
      method: string;
      url: string;
      headers?: { cookie?: string };
      payload?: unknown;
    }) => Promise<Injected>;
  };
  engine: Engine;
  db: Db & Database.Database;
  clock: FakeClock;
  /** The user handle the tests pass as a cookie (there are no logins any more). */
  cookie: (name: string) => Promise<string>;
  forget: (name: string) => void;
}

let base: Buffer | null = null;

/** A migrated database with the content imported, built once per test file. */
export function baseDb(): Database.Database {
  if (!base) {
    const db = new Database(':memory:');
    migrate(db);
    const content = new Database(CONTENT, { readonly: true });
    importContent(db, content);
    content.close();
    base = db.serialize();
    db.close();
  }
  const db = new Database(base);
  db.pragma('foreign_keys = ON');
  return db;
}

export const USERS = ['marcel', 'partnerin'];

export function testEnv(start: string): Promise<TestEnv> {
  const db = baseDb();
  const clock = new FakeClock(start);
  const engine = new Engine(db, clock);
  engine.seedUsers(USERS);
  const inject: TestEnv['app']['inject'] = (req) => {
    const user = USERS.indexOf((req.headers?.cookie ?? '').replace(/^user=/u, '')) + 1;
    const res = engine.call(user, req.method as Method, req.url, req.payload ?? {});
    const body = JSON.stringify(res.body ?? null);
    return Promise.resolve({
      statusCode: res.status === 200 ? 200 : res.status,
      body,
      json: <T>() => JSON.parse(body) as T,
    });
  };
  return Promise.resolve({
    app: { inject },
    engine,
    db,
    clock,
    cookie: (name) => Promise.resolve(`user=${name}`),
    forget: () => undefined,
  });
}

export interface SentenceOracle {
  id: number;
  lemma_id: number;
  exercise_types: string;
  gap: string;
  accepted: string;
  de: string;
}

/** The right answer for a sentence, read straight from the content tables. */
export function rightAnswer(db: Db, sentenceId: number): { answer: string; tappedIndex?: number } {
  const s = db
    .prepare<[number], SentenceOracle>('SELECT * FROM sentence WHERE id = ?')
    .get(sentenceId);
  if (!s) throw new Error(`no sentence ${sentenceId}`);
  const type = (JSON.parse(s.exercise_types) as string[])[0];
  const gap = JSON.parse(s.gap) as Gap;
  const accepted = JSON.parse(s.accepted) as string[];
  if (type === 'fehlersuche')
    return { answer: String(gap.correct ?? ''), tappedIndex: gap.error_index ?? 0 };
  if (type === 'diktat') return { answer: s.de };
  return { answer: accepted[0] ?? '' };
}

/** 08:00 Berlin time on a learning day, for any date (DST-safe). */
export function morning(day: string): string {
  return new Date(dayStart(day).getTime() + 5 * 3_600_000).toISOString();
}

export function berlinMorning(day: string): string {
  // 08:00 local = 06:00Z in summer time, 07:00Z in winter time (Oct 25 switch).
  return day < '2026-10-25' ? `${day}T06:00:00.000Z` : `${day}T07:00:00.000Z`;
}

/** Small deterministic RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
