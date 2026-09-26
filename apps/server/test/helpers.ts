import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { FakeClock } from '@wortduell/core';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { seedUsers } from '../src/auth';
import { importContent } from '../src/content';
import { migrate } from '../src/db';
import type { Db } from '../src/db';
import type { Gap } from '../src/repo';

export const CONTENT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'content',
  'content.sqlite',
);

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  clock: FakeClock;
  cookie: (name: string) => Promise<string>;
}

let cachedHash: string | null = null;

export async function testEnv(start: string): Promise<TestEnv> {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  importContent(db, CONTENT);
  cachedHash ??= await hash('geheim');
  seedUsers(db, [
    { name: 'marcel', passwordHash: cachedHash },
    { name: 'partnerin', passwordHash: cachedHash },
  ]);
  const clock = new FakeClock(start);
  const app = buildApp({ db, clock, secureCookies: false });
  await app.ready();
  const cookies = new Map<string, string>();
  const cookie = async (name: string): Promise<string> => {
    const hit = cookies.get(name);
    if (hit) return hit;
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { name, password: 'geheim' },
    });
    const set = res.headers['set-cookie'];
    const raw = Array.isArray(set) ? set[0] : set;
    if (!raw) throw new Error(`login failed: ${res.body}`);
    const value = raw.split(';')[0] as string;
    cookies.set(name, value);
    return value;
  };
  return { app, db, clock, cookie };
}

export interface SentenceOracle {
  id: number;
  lemma_id: number;
  exercise_types: string;
  gap: string;
  accepted: string;
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
    return { answer: gap.correct ?? '', tappedIndex: gap.error_index ?? 0 };
  return { answer: accepted[0] ?? '' };
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
