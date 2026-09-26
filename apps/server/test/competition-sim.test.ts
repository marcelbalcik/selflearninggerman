/**
 * M5 acceptance: two synthetic users with a fake clock.
 *
 * - A 90-day run (2027-02-01 → 2027-05-01) crosses the spring DST switch
 *   (2027-03-28) and two exam windows.
 * - A 30-day run (2026-10-12 → 2026-11-10) crosses the autumn switch
 *   (2026-10-25) and one exam window.
 *
 * Both cover forfeits, draws, report voiding with re-settlement, idempotent
 * re-runs of every settlement job, the chore voucher flow with its timers,
 * a dual-approval setting change, and (in the long run) reward voucher
 * combination with change, band fallback and undo.
 */
import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayStart, weekKey, weekStartDay } from '@wortduell/core';
import type { SessionPlan } from '../src/services/session';
import { morning, rightAnswer, rng, testEnv } from './helpers';
import type { TestEnv } from './helpers';

const USERS = [
  { name: 'marcel', id: 1, accuracy: 0.85, seed: 7, duelRate: 0.9 },
  { name: 'partnerin', id: 2, accuracy: 0.75, seed: 11, duelRate: 0.85 },
] as const;
type User = (typeof USERS)[number];

/** Items per session the synthetic users work through (keeps the run fast). */
const SESSION_CAP = 60;

interface DuelView {
  status: string;
  total?: number;
  next?: { index: number } | null;
  mine?: { correct: number } | null;
}

class Sim {
  readonly rand: Map<string, () => number>;
  constructor(readonly env: TestEnv) {
    this.rand = new Map(USERS.map((u) => [u.name, rng(u.seed)]));
  }

  async call<T>(
    user: string,
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; body: T }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.env.app.inject({
        method,
        url,
        headers: { cookie: await this.env.cookie(user) },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      });
      if (res.statusCode === 401 && attempt === 0) {
        this.env.forget(user); // the 30-day login expired
        continue;
      }
      return { status: res.statusCode, body: res.json<T>() };
    }
    throw new Error('unreachable');
  }

  async ok<T>(user: string, method: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const r = await this.call<T>(user, method, url, payload);
    expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(200);
    return r.body;
  }

  /** Play a round (duel or exam) to the end; `answer(i)` decides right/wrong and latency. */
  async playRound(
    user: User,
    kind: 'duel' | 'exam',
    answer: (i: number) => { right: boolean; latencyMs: number },
  ): Promise<number> {
    let played = 0;
    for (;;) {
      const v = await this.ok<DuelView & { next: { index: number; sentenceId?: number } | null }>(
        user.name,
        'GET',
        `/api/${kind}`,
      );
      if (!v.next) return played;
      const round = this.env.db
        .prepare(
          kind === 'duel'
            ? 'SELECT items FROM duel WHERE id = ?'
            : 'SELECT items FROM exam WHERE id = ?',
        )
        .get((v as unknown as { id: number }).id) as { items: string };
      const item = (JSON.parse(round.items) as { sentenceId: number }[])[v.next.index] as {
        sentenceId: number;
      };
      const right = rightAnswer(this.env.db, item.sentenceId);
      const a = answer(v.next.index);
      this.env.clock.advance(a.latencyMs);
      await this.ok(user.name, 'POST', `/api/${kind}/answer`, {
        index: v.next.index,
        answer: a.right ? right.answer : 'Quatsch',
        ...(right.tappedIndex !== undefined ? { tappedIndex: right.tappedIndex } : {}),
        latencyMs: a.latencyMs,
      });
      played += 1;
    }
  }

  /** A normal session (capped), then komposition when offered and wanted. */
  async session(user: User, writeKomposition: boolean): Promise<void> {
    const random = this.rand.get(user.name)!;
    const plan = await this.ok<
      SessionPlan & {
        komposition: { lemmas: { id: number; text: string }[]; requiredCase: string | null } | null;
      }
    >(user.name, 'GET', '/api/session');
    for (const item of plan.items.slice(0, SESSION_CAP)) {
      this.env.clock.advance(15_000);
      if (item.kind === 'intro') {
        await this.ok(user.name, 'POST', `/api/lemmas/${item.lemmaId}/intro`, {});
        continue;
      }
      const right = rightAnswer(this.env.db, item.sentenceId);
      const good = random() < user.accuracy;
      const fb = await this.ok<{ attemptId: number; errorClass: string | null }>(
        user.name,
        'POST',
        '/api/attempts',
        {
          sentenceId: item.sentenceId,
          answer: good ? right.answer : 'falsch',
          ...(right.tappedIndex !== undefined ? { tappedIndex: right.tappedIndex } : {}),
          latencyMs: 2000 + Math.floor(random() * 8000),
        },
      );
      if (fb.errorClass === 'ambiguous') {
        await this.ok(user.name, 'POST', `/api/attempts/${fb.attemptId}/follow-up`, {
          gender: 'm',
        });
      }
    }
    if (plan.komposition && writeKomposition) {
      const words = plan.komposition.lemmas.map((l) => l.text);
      await this.ok(user.name, 'POST', '/api/komposition', {
        lemmaIds: plan.komposition.lemmas.map((l) => l.id),
        requiredCase: plan.komposition.requiredCase,
        text: `Heute übe ich ${words.join(', ')}. Das ist gut.`,
      });
    }
    await this.ok(user.name, 'GET', '/api/today'); // marks the cleared queue
  }

  /** Settlement tables, for idempotency checks. */
  dump(): string {
    const tables = [
      'period_result',
      'star',
      'voucher',
      'snapshot',
      'coop_week',
      'reward_voucher',
      'duel',
      'duel_result',
      'exam',
      'exam_result',
    ];
    return JSON.stringify(
      tables.map((t) => this.env.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()),
    );
  }

  /** Re-run every settlement job from the epoch: nothing may change. */
  async assertIdempotent(): Promise<void> {
    const before = this.dump();
    this.env.db.prepare("DELETE FROM app_meta WHERE key = 'processed_through'").run();
    await this.ok('marcel', 'GET', '/api/today');
    await this.ok('partnerin', 'GET', '/api/home');
    expect(this.dump()).toBe(before);
  }

  /** Chore voucher behaviour: winners pick sometimes, losers do the chore sometimes. */
  async handleVouchers(user: User): Promise<void> {
    const random = this.rand.get(user.name)!;
    const { vouchers, chores } = await this.ok<{
      vouchers: { id: number; status: string; winnerId: number; loserId: number; size: string }[];
      chores: { id: number; size: string; active: boolean }[];
    }>(user.name, 'GET', '/api/vouchers');
    for (const v of vouchers) {
      if (v.status === 'choose' && v.winnerId === user.id && random() < 0.5) {
        const chore = chores.find((c) => c.size === v.size && c.active);
        if (chore)
          await this.ok(user.name, 'POST', `/api/vouchers/${v.id}/choose`, { choreId: chore.id });
      } else if (v.status === 'open' && v.loserId === user.id && random() < 0.6) {
        await this.ok(user.name, 'POST', `/api/vouchers/${v.id}/done`, {});
      } else if (v.status === 'done' && v.winnerId === user.id && random() < 0.5) {
        await this.ok(user.name, 'POST', `/api/vouchers/${v.id}/confirm`, {});
      }
    }
  }
}

interface Scenario {
  /** Day index → special duel behaviour. */
  drawDay: number;
  flipDay: number;
  /** Day index on which vs_expected is proposed and approved. */
  modeSwitchDay: number;
  /** Month whose exam marcel skips (forfeit). */
  skipExamMonth: string | null;
}

async function run(first: string, days: number, sc: Scenario) {
  const env = await testEnv(morning(first));
  const sim = new Sim(env);
  for (const u of USERS) await sim.ok(u.name, 'POST', '/api/placement/skip', {});

  const outcomes = {
    forfeitDays: 0,
    noResultDays: 0,
    flipChecked: false,
    drawSeen: false,
    exams: 0,
  };
  let flipSentence: number | null = null;

  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    env.clock.set(morning(day));
    expect(dayKey(env.clock.now())).toBe(day);

    // Morning: the tick settles yesterday; re-settlement scenario on the day after the flip day.
    await sim.ok('marcel', 'GET', '/api/today');
    if (flipSentence !== null) {
      const before = env.db
        .prepare("SELECT winner_user_id FROM period_result WHERE kind = 'day' AND period_key = ?")
        .get(addDays(day, -1)) as { winner_user_id: number | null };
      expect(before.winner_user_id).toBe(1);
      await sim.ok('marcel', 'POST', '/api/reports', { sentenceId: flipSentence, reason: 'Test' });
      const after = env.db
        .prepare(
          "SELECT winner_user_id, resettled_at FROM period_result WHERE kind = 'day' AND period_key = ?",
        )
        .get(addDays(day, -1)) as { winner_user_id: number | null; resettled_at: string | null };
      expect(after.winner_user_id).toBe(2);
      expect(after.resettled_at).not.toBeNull();
      const star = env.db
        .prepare('SELECT user_id, revoked FROM star WHERE period_key = ? ORDER BY user_id')
        .all(`day:${addDays(day, -1)}`) as { user_id: number; revoked: number }[];
      expect(star).toEqual([
        { user_id: 1, revoked: 1 },
        { user_id: 2, revoked: 0 },
      ]);
      outcomes.flipChecked = true;
      flipSentence = null;
    }

    if (i === sc.modeSwitchDay) {
      await sim.ok('marcel', 'POST', '/api/settings/DUEL_MODE', { value: 'vs_expected' });
      const own = await sim.call('marcel', 'POST', '/api/settings/DUEL_MODE/decision', {
        approve: true,
      });
      expect(own.status).toBe(403);
      await sim.ok('partnerin', 'POST', '/api/settings/DUEL_MODE/decision', { approve: true });
    }

    // Duel.
    const duel = env.db.prepare('SELECT id, items, mode FROM duel WHERE day_key = ?').get(day) as
      { id: number; items: string; mode: string } | undefined;
    expect(duel, `no duel row on ${day}`).toBeDefined();
    if (i === sc.modeSwitchDay + 1) expect(duel?.mode).toBe('vs_expected');
    if (i <= sc.modeSwitchDay) expect(duel?.mode).toBe('raw');
    const nItems = (JSON.parse(duel?.items ?? '[]') as unknown[]).length;
    const both = i % 13 === 5; // some days nobody plays
    for (const u of USERS) {
      const random = sim.rand.get(u.name)!;
      if (nItems === 0 || both) continue;
      if (i === sc.drawDay) {
        await sim.playRound(u, 'duel', () => ({ right: true, latencyMs: 3000 }));
        continue;
      }
      if (i === sc.flipDay) {
        await sim.playRound(u, 'duel', (idx) =>
          u.id === 1
            ? { right: true, latencyMs: 3000 }
            : { right: idx !== 0, latencyMs: idx === 0 ? 3000 : 2000 },
        );
        continue;
      }
      if (random() > u.duelRate) continue; // forfeit
      await sim.playRound(u, 'duel', () => ({
        right: random() < u.accuracy,
        latencyMs: 2000 + Math.floor(random() * 6000),
      }));
    }
    if (i === sc.flipDay && nItems >= 2) {
      const items = JSON.parse(duel?.items ?? '[]') as { sentenceId: number }[];
      flipSentence = items[0]?.sentenceId ?? null;
    }

    // Exam window (the first days of a month).
    const exam = env.db
      .prepare('SELECT id, month_key, items FROM exam WHERE opens_at <= ? AND closes_at > ?')
      .get(env.clock.now().toISOString(), env.clock.now().toISOString()) as
      { id: number; month_key: string; items: string } | undefined;
    if (exam && Number(day.slice(8)) === 2 && (JSON.parse(exam.items) as unknown[]).length > 0) {
      for (const u of USERS) {
        if (u.id === 1 && exam.month_key === sc.skipExamMonth) continue;
        const random = sim.rand.get(u.name)!;
        await sim.playRound(u, 'exam', () => ({
          right: random() < u.accuracy,
          latencyMs: 4000,
        }));
      }
      outcomes.exams += 1;
      // Results stay hidden from the partner until both finished: here both did (or the window closes).
    }

    // Sessions, komposition on most days, vouchers.
    for (const u of USERS) {
      env.clock.advance(60_000);
      await sim.session(u, i % 7 !== 3);
      await sim.handleVouchers(u);
    }

    if (i % 20 === 19) await sim.assertIdempotent();
  }

  // Close the last day.
  env.clock.set(morning(addDays(first, days)));
  await sim.ok('marcel', 'GET', '/api/today');
  await sim.assertIdempotent();

  // --- Invariants -------------------------------------------------------------------
  const db = env.db;
  const epoch = (
    db.prepare("SELECT value FROM app_meta WHERE key = 'epoch_day'").get() as { value: string }
  ).value;
  expect(epoch).toBe(first);
  // Every day with duel items has exactly one result.
  const duels = db
    .prepare('SELECT day_key, items, settled_at FROM duel WHERE day_key < ?')
    .all(addDays(first, days)) as {
    day_key: string;
    items: string;
    settled_at: string | null;
  }[];
  for (const d of duels) {
    const n = (JSON.parse(d.items) as unknown[]).length;
    const r = db
      .prepare(
        "SELECT winner_user_id, draw, details FROM period_result WHERE kind = 'day' AND period_key = ?",
      )
      .get(d.day_key) as
      { winner_user_id: number | null; draw: number; details: string } | undefined;
    if (n === 0) {
      expect(r).toBeUndefined();
      continue;
    }
    expect(d.settled_at, d.day_key).not.toBeNull();
    const results = db
      .prepare(
        'SELECT forfeit FROM duel_result WHERE duel_id = (SELECT id FROM duel WHERE day_key = ?)',
      )
      .all(d.day_key) as { forfeit: number }[];
    const forfeits = results.filter((x) => x.forfeit === 1).length;
    if (forfeits === 2) {
      expect(r?.winner_user_id ?? null).toBeNull();
      expect(r?.draw).toBe(0);
      outcomes.noResultDays += 1;
    } else {
      expect(r).toBeDefined();
      if (forfeits === 1) outcomes.forfeitDays += 1;
      if (r?.draw === 1) outcomes.drawSeen = true;
    }
  }
  // Stars match duel wins; S vouchers match full sets of stars.
  for (const u of USERS) {
    const wins = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM period_result WHERE kind = 'day' AND winner_user_id = ?",
        )
        .get(u.id) as { n: number }
    ).n;
    const stars = (
      db.prepare('SELECT COUNT(*) AS n FROM star WHERE user_id = ? AND revoked = 0').get(u.id) as {
        n: number;
      }
    ).n;
    expect(stars).toBe(wins);
    const sVouchers = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM voucher WHERE kind = 'day' AND winner_id = ? AND status != 'void'",
        )
        .get(u.id) as { n: number }
    ).n;
    expect(sVouchers).toBe(Math.floor(stars / 3));
    const consumed = (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM star WHERE user_id = ? AND revoked = 0 AND consumed_by_voucher_id IS NOT NULL',
        )
        .get(u.id) as { n: number }
    ).n;
    expect(consumed).toBe(sVouchers * 3);
  }
  // Every complete week has a result, a coop row and (when a tier was met) a banked voucher.
  const lastDay = addDays(first, days - 1);
  for (
    let monday = weekStartDay(first);
    addDays(monday, 6) <= lastDay;
    monday = addDays(monday, 7)
  ) {
    const wk = weekKey(monday);
    expect(
      db.prepare("SELECT 1 FROM period_result WHERE kind = 'week' AND period_key = ?").get(wk),
      wk,
    ).toBeDefined();
    const coop = db
      .prepare('SELECT tier_eur, voucher_id FROM coop_week WHERE week_key = ?')
      .get(wk) as { tier_eur: number | null; voucher_id: number | null };
    expect(coop, wk).toBeDefined();
    expect(coop.voucher_id === null).toBe(coop.tier_eur === null);
  }
  // Snapshots exist for every day since the epoch.
  for (const u of USERS) {
    const n = (
      db.prepare('SELECT COUNT(*) AS n FROM snapshot WHERE user_id = ?').get(u.id) as { n: number }
    ).n;
    expect(n).toBe(days);
  }
  // Voucher timers: nothing waits past its window.
  const now = env.clock.now().toISOString();
  expect(
    db.prepare("SELECT id FROM voucher WHERE status = 'choose' AND choose_by <= ?").all(now),
  ).toEqual([]);
  expect(
    db
      .prepare("SELECT id FROM voucher WHERE status = 'done' AND done_at <= ?")
      .all(new Date(env.clock.now().getTime() - 48 * 3_600_000).toISOString()),
  ).toEqual([]);
  expect(outcomes.forfeitDays).toBeGreaterThan(0);
  expect(outcomes.noResultDays).toBeGreaterThan(0);
  expect(outcomes.drawSeen).toBe(true);
  expect(outcomes.flipChecked).toBe(true);
  return { env, sim, outcomes };
}

describe('M5 simulation (acceptance)', () => {
  it(
    '90 days across the spring DST switch, with exams, re-settlement and redemptions',
    { timeout: 240_000 },
    async () => {
      const { env, sim, outcomes } = await run('2027-02-01', 90, {
        drawDay: 20,
        flipDay: 21,
        modeSwitchDay: 30,
        skipExamMonth: '2027-03',
      });
      const db = env.db;
      expect(outcomes.exams).toBe(2);
      const feb = db
        .prepare(
          "SELECT winner_user_id, draw FROM period_result WHERE kind = 'month' AND period_key = '2027-02'",
        )
        .get();
      expect(feb).toBeDefined();
      const mar = db
        .prepare(
          "SELECT winner_user_id FROM period_result WHERE kind = 'month' AND period_key = '2027-03'",
        )
        .get() as { winner_user_id: number };
      expect(mar.winner_user_id).toBe(2); // marcel skipped: forfeit
      expect(
        db.prepare("SELECT size FROM voucher WHERE from_period = 'month:2027-03'").get(),
      ).toEqual({ size: 'L' });
      // The spring switch: the day boundary stayed at 03:00 local.
      expect(dayStart('2027-03-27').toISOString()).toBe('2027-03-27T02:00:00.000Z');
      expect(dayStart('2027-03-28').toISOString()).toBe('2027-03-28T01:00:00.000Z');

      // --- Reward vouchers: combine with change, band fallback, undo -------------------
      const konto = await sim.ok<{
        balanceEur: number;
        vouchers: { id: number; valueEur: number; reserved: boolean }[];
      }>('marcel', 'GET', '/api/wochenziel');
      const banked = konto.vouchers.filter((v) => !v.reserved);
      const total = banked.reduce((s, v) => s + v.valueEur, 0);
      console.log(
        'banked reward vouchers',
        banked.map((v) => v.valueEur),
        'total',
        total,
      );
      expect(banked.length).toBeGreaterThanOrEqual(2);

      // No babysitter: the 30 € rewards all need one, so a 30 € redemption falls back to 20 €.
      await sim.ok('partnerin', 'POST', '/api/settings/BABYSITTER_AVAILABLE', { value: false });
      const pick: number[] = [];
      let sum = 0;
      for (const v of [...banked].sort((a, b) => b.valueEur - a.valueEur)) {
        if (sum >= 33) break;
        pick.push(v.id);
        sum += v.valueEur;
      }
      const band = sum >= 30 ? 30 : sum >= 20 ? 20 : sum >= 15 ? 15 : sum >= 10 ? 10 : 5;
      const red = await sim.ok<{ id: number }>('marcel', 'POST', '/api/redemptions', {
        voucherIds: pick,
        band,
      });
      expect((await sim.call('marcel', 'POST', `/api/redemptions/${red.id}/confirm`)).status).toBe(
        403,
      );
      await sim.ok('partnerin', 'POST', `/api/redemptions/${red.id}/confirm`);
      const row = db
        .prepare(
          'SELECT band_eur, drawn_band_eur, change_voucher_id, reward_id FROM redemption WHERE id = ?',
        )
        .get(red.id) as {
        band_eur: number;
        drawn_band_eur: number;
        change_voucher_id: number | null;
        reward_id: number;
      };
      const reward = db
        .prepare('SELECT budget_eur, needs_babysitter FROM reward WHERE id = ?')
        .get(row.reward_id) as { budget_eur: number; needs_babysitter: number };
      expect(reward.needs_babysitter).toBe(0);
      expect(reward.budget_eur).toBe(row.drawn_band_eur);
      if (band === 30) expect(row.drawn_band_eur).toBe(20); // fallback
      const change = sum - row.drawn_band_eur;
      if (change > 0) {
        const cv = db
          .prepare('SELECT value_eur, status, source FROM reward_voucher WHERE id = ?')
          .get(row.change_voucher_id) as {
          value_eur: number;
          status: string;
          source: string;
        };
        expect(cv).toEqual({ value_eur: change, status: 'banked', source: 'change' });
      }
      for (const id of pick)
        expect(
          (
            db.prepare('SELECT status FROM reward_voucher WHERE id = ?').get(id) as {
              status: string;
            }
          ).status,
        ).toBe('spent');
      // Undo needs both.
      expect(
        (await sim.ok<{ undone: boolean }>('marcel', 'POST', `/api/redemptions/${red.id}/undo`))
          .undone,
      ).toBe(false);
      expect(
        (await sim.ok<{ undone: boolean }>('partnerin', 'POST', `/api/redemptions/${red.id}/undo`))
          .undone,
      ).toBe(true);
      for (const id of pick)
        expect(
          db
            .prepare('SELECT status, redemption_id FROM reward_voucher WHERE id = ?')
            .get(id) as object,
        ).toEqual({ status: 'banked', redemption_id: null });
      if (row.change_voucher_id !== null)
        expect(
          db.prepare('SELECT 1 FROM reward_voucher WHERE id = ?').get(row.change_voucher_id),
        ).toBeUndefined();
      const after = await sim.ok<{ balanceEur: number }>('marcel', 'GET', '/api/wochenziel');
      expect(after.balanceEur).toBe(konto.balanceEur);
    },
  );

  it('30 days across the autumn DST switch', { timeout: 120_000 }, async () => {
    const { env, outcomes } = await run('2026-10-12', 30, {
      drawDay: 12,
      flipDay: 14, // 2026-10-26: the flip is re-settled on the first winter-time day
      modeSwitchDay: 22,
      skipExamMonth: null,
    });
    expect(outcomes.exams).toBe(1);
    expect(
      env.db
        .prepare("SELECT 1 FROM period_result WHERE kind = 'month' AND period_key = '2026-10'")
        .get(),
    ).toBeDefined();
    expect(dayStart('2026-10-24').toISOString()).toBe('2026-10-24T01:00:00.000Z');
    expect(dayStart('2026-10-25').toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });
});
