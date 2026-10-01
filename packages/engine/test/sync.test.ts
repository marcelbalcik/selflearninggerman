/**
 * Two phones, one per person, each with its own copy of the database. They
 * act independently and exchange their action logs late and in bursts (one
 * phone goes offline for days). In the end both databases must be identical,
 * and identical to one fresh replay of both logs.
 */
import { describe, expect, it } from 'vitest';
import { FakeClock, addDays } from '@wortduell/core';
import Database from 'better-sqlite3';
import type { Db } from '../src/db';
import { Store } from '../src/log';
import type { DbHost } from '../src/log';
import initSqlJs from 'sql.js';
import { sqlJsHost } from '../src/sqljs';
import { USERS, baseDb, morning, rightAnswer, rng } from './helpers';

const host: DbHost = {
  open: (bytes) => new Database(Buffer.from(bytes)),
  save: (db) => new Uint8Array((db as unknown as Database.Database).serialize()),
  close: (db) => (db as unknown as Database.Database).close(),
};

const TABLES = [
  'user',
  'lemma_intro',
  'facet_card',
  'attempt',
  'review_log',
  'report',
  'dispute',
  'accepted_extra',
  'komposition',
  'komposition_mark',
  'duel',
  'duel_result',
  'exam',
  'exam_result',
  'period_result',
  'star',
  'voucher',
  'day_activity',
  'coop_week',
  'reward_voucher',
  'redemption',
  'setting',
  'setting_value',
  'app_meta',
];

function dump(db: Db): string {
  const out: unknown[] = TABLES.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());
  out.push(
    db.prepare('SELECT user_id, day_key, round(b_value, 9) AS b FROM snapshot ORDER BY 1, 2').all(),
  );
  out.push(db.prepare("SELECT id FROM sentence WHERE status != 'ok' ORDER BY id").all());
  return JSON.stringify(out);
}

interface Phone {
  store: Store;
  user: number;
  clock: FakeClock;
  sent: number;
}

function phone(user: number, start: string, base: Uint8Array): Phone {
  const clock = new FakeClock(start);
  return { store: new Store({ host, base, users: USERS, clock }), user, clock, sent: 0 };
}

/** Deliver `from`'s actions not yet seen by `to`. */
function sync(from: Phone, to: Phone): boolean {
  const missing = from.store.all().filter((a) => a.user === from.user && !to.store.has(a.id));
  return to.store.receive(missing);
}

function day(p: Phone, date: string, random: () => number, accuracy: number): void {
  const u = p.user;
  const ok = <T>(r: { status: number; body: unknown }) => {
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body as T;
  };
  const today = ok<{ dueItems: number }>(p.store.read(u, '/api/today'));
  // Duel: answer every item (some right, some wrong).
  for (;;) {
    const v = ok<{ next?: { index: number; sentenceId: number } | null }>(
      p.store.read(u, '/api/duel'),
    );
    if (!v.next) break;
    p.clock.advance(5_000);
    const right = rightAnswer(p.store.db, v.next.sentenceId);
    ok(
      p.store.write(u, 'POST', '/api/duel/answer', {
        index: v.next.index,
        sentenceId: v.next.sentenceId,
        answer: random() < accuracy ? right.answer : 'falsch',
        tappedIndex: right.tappedIndex,
        latencyMs: 3000 + Math.floor(random() * 3000),
      }).response,
    );
  }
  const plan = ok<{
    items: ({ kind: 'intro'; lemmaId: number } | { kind: 'exercise'; sentenceId: number })[];
  }>(p.store.read(u, '/api/session'));
  for (const item of plan.items.slice(0, 30)) {
    p.clock.advance(10_000);
    if (item.kind === 'intro') {
      ok(p.store.write(u, 'POST', `/api/lemmas/${item.lemmaId}/intro`, {}).response);
      continue;
    }
    const right = rightAnswer(p.store.db, item.sentenceId);
    ok(
      p.store.write(u, 'POST', '/api/attempts', {
        sentenceId: item.sentenceId,
        answer: random() < accuracy ? right.answer : 'falsch',
        tappedIndex: right.tappedIndex,
        latencyMs: 4000,
      }).response,
    );
  }
  if (today.dueItems === 0) ok(p.store.write(u, 'POST', '/api/day/cleared', {}).response);
  void date;
}

describe('two phones, late and out-of-order sync (Pages mode)', () => {
  for (const [label, partnerOffsetH] of [
    ['partner plays in the evening', 11],
    ['both play at the same time', 0.05],
  ] as const)
    it(
      `converge to the same database as a single replay (${label})`,
      { timeout: 240_000 },
      async () => {
        const baseBytes = new Uint8Array(baseDb().serialize());
        const first = '2027-01-04';
        const a = phone(1, morning(first), baseBytes);
        const b = phone(2, new Date(Date.parse(morning(first)) + 600_000).toISOString(), baseBytes);
        const ra = rng(3);
        const rb = rng(5);

        // Both start with the same block of words (placement's effect), then skip placement.
        const block = (
          a.store.db
            .prepare("SELECT id FROM lemma WHERE pos = 'noun' ORDER BY freq_rank LIMIT 60")
            .all() as { id: number }[]
        ).map((r) => r.id);
        for (const p of [a, b]) {
          for (const id of block) {
            p.clock.advance(1000);
            p.store.write(p.user, 'POST', `/api/lemmas/${id}/intro`, {});
          }
          p.store.write(p.user, 'POST', '/api/placement/skip', {});
        }
        sync(a, b);
        sync(b, a);

        let rebuilds = 0;
        const DAYS = 12;
        for (let i = 1; i <= DAYS; i++) {
          const date = addDays(first, i);
          // Marcel plays in the morning, the partner in the evening.
          a.clock.set(morning(date));
          b.clock.set(
            new Date(Date.parse(morning(date)) + partnerOffsetH * 3_600_000).toISOString(),
          );
          // The partner's phone is offline on days 4–6: nothing arrives until day 7.
          const partnerOnline = i < 4 || i > 6;
          if (partnerOnline) rebuilds += Number(sync(b, a));
          day(a, date, ra, 0.85);
          if (partnerOnline) rebuilds += Number(sync(a, b));
          day(b, date, rb, 0.7);
          if (partnerOnline) {
            rebuilds += Number(sync(b, a));
            rebuilds += Number(sync(a, b));
          }
        }
        // Everyone online again; both look at the app the next morning.
        const end = morning(addDays(first, DAYS + 1));
        sync(a, b);
        sync(b, a);
        for (const p of [a, b]) {
          p.clock.set(end);
          p.store.read(p.user, '/api/home');
        }
        expect(rebuilds).toBeGreaterThan(0);
        const da = dump(a.store.db);
        expect(dump(b.store.db)).toBe(da);

        // The browser's SQLite (sql.js) replays both logs to the same state.
        if (partnerOffsetH === 11) {
          const SQL = await initSqlJs();
          const clock = new FakeClock(end);
          const web = new Store({ host: sqlJsHost(SQL), base: baseBytes, users: USERS, clock });
          const t0 = performance.now();
          web.receive([...a.store.all()]);
          web.read(1, '/api/home');
          const ms = performance.now() - t0;
          console.log(`sql.js replay of ${a.store.all().length} actions: ${Math.round(ms)} ms`);
          expect(dump(web.db)).toBe(da);
        }

        // A third device replaying both logs from scratch reaches the same state.
        const c = phone(1, end, baseBytes);
        c.store.receive([...a.store.all()]);
        c.store.read(1, '/api/home');
        expect(dump(c.store.db)).toBe(da);

        // Sanity: the competition actually happened.
        const results = a.store.db
          .prepare("SELECT COUNT(*) AS n FROM period_result WHERE kind = 'day'")
          .get() as { n: number };
        expect(results.n).toBeGreaterThan(5);
      },
    );
});
