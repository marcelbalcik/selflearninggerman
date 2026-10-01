import { addDays } from '@wortduell/core';
import { describe, expect, it } from 'vitest';
import { morning, rightAnswer, testEnv } from './helpers';
import type { TestEnv } from './helpers';

const DAY = '2027-01-11'; // a Monday in winter

async function call<T = Record<string, unknown>>(
  env: TestEnv,
  user: string,
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await env.app.inject({
    method,
    url,
    headers: { cookie: await env.cookie(user) },
    ...(payload === undefined ? {} : { payload: payload }),
  });
  return { status: res.statusCode, body: res.json<T>() };
}

/** Both users know the same lemmas, then finish placement (the competition starts). */
async function sharedStart(env: TestEnv, lemmas = 15): Promise<void> {
  const ids = env.db
    .prepare<[number], { lemma_id: number }>(
      `SELECT DISTINCT s.lemma_id FROM sentence s JOIN lemma l ON l.id = s.lemma_id
       WHERE json_extract(s.exercise_types, '$[0]') IN ('kasus_luecke', 'fehlersuche', 'wer_tut_was')
         AND s.status = 'ok' ORDER BY l.freq_rank LIMIT ?`,
    )
    .all(lemmas)
    .map((r) => r.lemma_id);
  for (const u of ['marcel', 'partnerin']) {
    for (const id of ids) await call(env, u, 'POST', `/api/lemmas/${id}/intro`, {});
    await call(env, u, 'POST', '/api/placement/skip', {});
  }
}

describe('dual-approval settings (spec §10)', () => {
  it('a change needs the other user and takes effect at the next day boundary', async () => {
    const env = await testEnv(morning(DAY));
    expect(
      (await call(env, 'marcel', 'POST', '/api/settings/NEW_PER_DAY', { value: 99 })).status,
    ).toBe(400);
    await call(env, 'marcel', 'POST', '/api/settings/NEW_PER_DAY', { value: 3 });
    expect(
      (await call(env, 'marcel', 'POST', '/api/settings/NEW_PER_DAY/decision', { approve: true }))
        .status,
    ).toBe(403);
    const ok = await call<{ effectiveFrom: string }>(
      env,
      'partnerin',
      'POST',
      '/api/settings/NEW_PER_DAY/decision',
      {
        approve: true,
      },
    );
    expect(ok.body.effectiveFrom).toBe('2027-01-12T02:00:00.000Z');
    expect(
      (await call<{ newRemaining: number }>(env, 'marcel', 'GET', '/api/today')).body.newRemaining,
    ).toBe(5);
    env.clock.set(morning('2027-01-12'));
    expect(
      (await call<{ newRemaining: number }>(env, 'marcel', 'GET', '/api/today')).body.newRemaining,
    ).toBe(3);
  });
});

describe('duel (spec §9.1)', () => {
  it('identical items, answered in order, results hidden until both finished', async () => {
    // Duel items come from words both have known for more than a day.
    const env = await testEnv(morning(addDays(DAY, -2)));
    await sharedStart(env);
    env.clock.set(morning(DAY));
    const first = await call<{ status: string; total: number; next: { index: number } }>(
      env,
      'marcel',
      'GET',
      '/api/duel',
    );
    expect(first.body.status).toBe('ready');
    expect(first.body.total).toBeGreaterThan(0);
    const other = await call<{ total: number; next: { index: number } }>(
      env,
      'partnerin',
      'GET',
      '/api/duel',
    );
    expect(other.body.total).toBe(first.body.total);
    const items = JSON.parse(
      (env.db.prepare('SELECT items FROM duel').get() as { items: string }).items,
    ) as { sentenceId: number }[];
    expect(
      (
        await call(env, 'marcel', 'POST', '/api/duel/answer', {
          index: 1,
          answer: 'x',
          latencyMs: 1000,
        })
      ).status,
    ).toBe(409);
    const play = async (user: string) => {
      for (const [i, it] of items.entries()) {
        const r = rightAnswer(env.db, it.sentenceId);
        const res = await call<Record<string, unknown>>(env, user, 'POST', '/api/duel/answer', {
          index: i,
          answer: r.answer,
          tappedIndex: r.tappedIndex,
          latencyMs: 2000,
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        // No feedback between items.
        expect(res.body).not.toHaveProperty('correct');
      }
    };
    await play('marcel');
    const hidden = await call<{
      status: string;
      mine: { correct: number };
      other: Record<string, unknown>;
      feedback: unknown[];
    }>(env, 'marcel', 'GET', '/api/duel');
    expect(hidden.body.status).toBe('finished');
    expect(hidden.body.mine.correct).toBe(items.length);
    expect(hidden.body.feedback).toHaveLength(items.length);
    expect(hidden.body.other).toEqual({ userId: 2, finished: false });
    await play('partnerin');
    const shown = await call<{ other: { correct: number } }>(env, 'marcel', 'GET', '/api/duel');
    expect(shown.body.other.correct).toBe(items.length);
    // Duel attempts are normal reviews.
    const logs = env.db
      .prepare("SELECT COUNT(*) AS n FROM review_log WHERE context = 'duel'")
      .get() as { n: number };
    expect(logs.n).toBeGreaterThan(0);
    // Settled at the boundary: equal score and time is a draw.
    env.clock.set(morning('2027-01-12'));
    await call(env, 'marcel', 'GET', '/api/today');
    const r = env.db
      .prepare("SELECT draw FROM period_result WHERE kind = 'day' AND period_key = ?")
      .get(DAY) as { draw: number };
    expect(r.draw).toBe(1);
  });
});

describe('chore vouchers (spec §9.4)', () => {
  it('winner chooses, loser does it, winner confirms; the chore shows split and strip', async () => {
    const env = await testEnv(morning(DAY));
    const now = env.clock.now().toISOString();
    env.db
      .prepare(
        "INSERT INTO voucher (kind, from_period, winner_id, loser_id, size, status, choose_by, created_at, updated_at) VALUES ('week', 'week:test', 1, 2, 'S', 'choose', ?, ?, ?)",
      )
      .run(new Date(env.clock.now().getTime() + 86_400_000).toISOString(), now, now);
    const list = await call<{
      vouchers: { id: number }[];
      chores: {
        id: number;
        size: string;
        titleDe: string;
        verbSplit: string | null;
        nounForms: { gender: string } | null;
      }[];
    }>(env, 'marcel', 'GET', '/api/vouchers');
    const muell = list.body.chores.find((c) => c.titleDe === 'Müll rausbringen');
    expect(muell?.verbSplit).toBe('raus|bringen');
    expect(muell?.nounForms?.gender).toBe('m');
    const bad = list.body.chores.find((c) => c.size === 'M') as { id: number };
    const id = list.body.vouchers[0]?.id as number;
    expect(
      (await call(env, 'partnerin', 'POST', `/api/vouchers/${id}/choose`, { choreId: muell?.id }))
        .status,
    ).toBe(403);
    expect(
      (await call(env, 'marcel', 'POST', `/api/vouchers/${id}/choose`, { choreId: bad.id })).status,
    ).toBe(400);
    expect(
      (await call(env, 'marcel', 'POST', `/api/vouchers/${id}/choose`, { choreId: muell?.id }))
        .status,
    ).toBe(200);
    expect((await call(env, 'marcel', 'POST', `/api/vouchers/${id}/done`, {})).status).toBe(403);
    expect((await call(env, 'partnerin', 'POST', `/api/vouchers/${id}/done`, {})).status).toBe(200);
    expect((await call(env, 'partnerin', 'POST', `/api/vouchers/${id}/confirm`, {})).status).toBe(
      403,
    );
    expect((await call(env, 'marcel', 'POST', `/api/vouchers/${id}/confirm`, {})).status).toBe(200);
    const v = env.db.prepare('SELECT status, deadline FROM voucher WHERE id = ?').get(id) as {
      status: string;
      deadline: string;
    };
    expect(v.status).toBe('confirmed');
    // Writes in the same millisecond are nudged apart by 1 ms each.
    const due = new Date(v.deadline).getTime() - env.clock.now().getTime();
    expect(due).toBeGreaterThanOrEqual(48 * 3_600_000);
    expect(due).toBeLessThan(48 * 3_600_000 + 10);
  });
});

describe('reward vouchers (spec §9.5)', () => {
  const bank = (env: TestEnv, values: number[]) =>
    values.map((v) =>
      Number(
        env.db
          .prepare(
            "INSERT INTO reward_voucher (value_eur, source, status, created_at) VALUES (?, 'week', 'banked', ?)",
          )
          .run(v, env.clock.now().toISOString()).lastInsertRowid,
      ),
    );

  it('5 + 5 + 3 redeems at 10 € with 3 € change; one reroll needs both; undo ends at planned', async () => {
    const env = await testEnv(morning(DAY));
    const ids = bank(env, [5, 5, 3]);
    const red = await call<{ id: number }>(env, 'marcel', 'POST', '/api/redemptions', {
      voucherIds: ids,
    });
    expect(
      (await call(env, 'partnerin', 'POST', '/api/redemptions', { voucherIds: [ids[0]] })).status,
    ).toBe(409);
    await call(env, 'partnerin', 'POST', `/api/redemptions/${red.body.id}/confirm`);
    const k = await call<{
      balanceEur: number;
      redemptions: {
        id: number;
        bandEur: number;
        drawnBandEur: number;
        changeEur: number;
        reward: { id: number; budgetEur: number };
      }[];
    }>(env, 'marcel', 'GET', '/api/wochenziel');
    const r = k.body.redemptions[0]!;
    expect(r).toMatchObject({ bandEur: 10, drawnBandEur: 10, changeEur: 3 });
    expect(r.reward.budgetEur).toBe(10);
    expect(k.body.balanceEur).toBe(3);
    // The draw is reproducible from the stored seed: the same rewards, seed and time give the same pick.
    expect(
      (await call<{ rerolled: boolean }>(env, 'marcel', 'POST', `/api/redemptions/${r.id}/reroll`))
        .body.rerolled,
    ).toBe(false);
    expect(
      (
        await call<{ rerolled: boolean }>(
          env,
          'partnerin',
          'POST',
          `/api/redemptions/${r.id}/reroll`,
        )
      ).body.rerolled,
    ).toBe(true);
    const after = (
      await call<{ redemptions: { reward: { id: number }; rerollsLeft: number }[] }>(
        env,
        'marcel',
        'GET',
        '/api/wochenziel',
      )
    ).body.redemptions[0]!;
    expect(after.reward.id).not.toBe(r.reward.id);
    expect(after.rerollsLeft).toBe(0);
    expect((await call(env, 'marcel', 'POST', `/api/redemptions/${r.id}/reroll`)).status).toBe(409);
    await call(env, 'marcel', 'POST', `/api/redemptions/${r.id}/plan`, { date: '2027-01-16' });
    expect((await call(env, 'marcel', 'POST', `/api/redemptions/${r.id}/undo`)).status).toBe(409);
    await call(env, 'partnerin', 'POST', `/api/redemptions/${r.id}/done`, { note: 'Lecker!' });
    const done = env.db.prepare('SELECT status, note FROM redemption WHERE id = ?').get(r.id);
    expect(done).toEqual({ status: 'done', note: 'Lecker!' });
  });

  it('proposed rewards enter the pool only after the other user approves', async () => {
    const env = await testEnv(morning(DAY));
    const p = await call<{ id: number }>(env, 'partnerin', 'POST', '/api/rewards', {
      budgetEur: 3,
      kind: 'together',
      titleDe: 'Hörspielabend',
      titleEn: 'Radio play evening',
      missionDe: 'Ihr erzählt die Geschichte nach.',
    });
    const pending = (
      await call<{ rewards: { id: number; active: boolean; pending: boolean }[] }>(
        env,
        'marcel',
        'GET',
        '/api/rewards',
      )
    ).body.rewards.find((r) => r.id === p.body.id);
    expect(pending).toMatchObject({ active: false, pending: true });
    expect(
      (
        await call(env, 'partnerin', 'POST', `/api/rewards/${p.body.id}/decision`, {
          approve: true,
        })
      ).status,
    ).toBe(403);
    await call(env, 'marcel', 'POST', `/api/rewards/${p.body.id}/decision`, { approve: true });
    const active = env.db.prepare('SELECT active FROM reward WHERE id = ?').get(p.body.id) as {
      active: number;
    };
    expect(active.active).toBe(1);
    expect(
      (
        await call(env, 'marcel', 'POST', '/api/rewards', {
          budgetEur: 4,
          kind: 'buy',
          titleDe: 'x',
          titleEn: 'x',
        })
      ).status,
    ).toBe(400);
  });
});
