import { describe, expect, it } from 'vitest';
import type { StoredCard } from '@wortduell/core';
import { replayCard } from '@wortduell/core';
import { importContent } from '../src/content';
import { CONTENT, rightAnswer, testEnv } from './helpers';
import type { TestEnv } from './helpers';

const START = '2026-10-05T06:00:00.000Z';

async function get(env: TestEnv, user: string, url: string) {
  const res = await env.app.inject({
    method: 'GET',
    url,
    headers: { cookie: await env.cookie(user) },
  });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

async function post(env: TestEnv, user: string, url: string, payload: unknown) {
  const res = await env.app.inject({
    method: 'POST',
    url,
    headers: { cookie: await env.cookie(user) },
    payload: payload as Record<string, unknown>,
  });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

function nounGapSentence(env: TestEnv, pred: string): { id: number; lemma_id: number } {
  const row = env.db
    .prepare<[], { id: number; lemma_id: number }>(
      `SELECT s.id, s.lemma_id FROM sentence s JOIN noun n ON n.lemma_id = s.lemma_id
       WHERE s.exercise_types = '["kasus_luecke"]' AND ${pred} LIMIT 1`,
    )
    .get();
  if (!row) throw new Error(`no sentence for ${pred}`);
  return row;
}

describe('auth (spec §3)', () => {
  it('rejects anonymous requests and wrong passwords, rate-limits logins', async () => {
    const env = await testEnv(START);
    expect((await env.app.inject({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    for (let i = 0; i < 5; i++) {
      const res = await env.app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { name: 'marcel', password: 'falsch' },
      });
      expect(res.statusCode).toBe(401);
    }
    const blocked = await env.app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { name: 'marcel', password: 'geheim' },
    });
    expect(blocked.statusCode).toBe(429);
    env.clock.advance(16 * 60 * 1000);
    expect((await get(env, 'marcel', '/api/me')).body).toMatchObject({ name: 'marcel' });
  });

  it('sets an httpOnly, SameSite=Lax cookie', async () => {
    const env = await testEnv(START);
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { name: 'partnerin', password: 'geheim' },
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });
});

describe('content import', () => {
  it('is skipped when the version is unchanged and never touches user data', async () => {
    const env = await testEnv(START);
    expect(importContent(env.db, CONTENT).imported).toBe(false);
    const lemmas = env.db.prepare('SELECT COUNT(*) AS n FROM lemma').get() as { n: number };
    expect(lemmas.n).toBe(507);
  });
});

describe('attempts: grade → classify → rate → update → log', () => {
  it('a correct kasus_luecke answer rates every implicated facet Good and logs before/after', async () => {
    const env = await testEnv(START);
    const s = nounGapSentence(env, `json_extract(s.gap, '$.features.number') = 'sg'`);
    await post(env, 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
    const res = await post(env, 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer: rightAnswer(env.db, s.id).answer,
      latencyMs: 3000,
    });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    const ratings = res.body.ratings as { facet: string; rating: string }[];
    expect(ratings.length).toBeGreaterThan(0);
    expect(ratings.every((r) => r.rating === 'good')).toBe(true);
    const logs = env.db
      .prepare('SELECT card_before, card_after FROM review_log WHERE attempt_id = ?')
      .all(res.body.attemptId) as { card_before: string; card_after: string }[];
    expect(logs).toHaveLength(ratings.length);
    expect(logs[0]?.card_before).not.toBe(logs[0]?.card_after);
  });

  it('a case error blames the case skill, not the noun gender', async () => {
    const env = await testEnv(START);
    const s = nounGapSentence(
      env,
      `n.gender = 'm' AND n.weak = 0 AND n.mixed = 0 AND json_extract(s.gap, '$.features.case') = 'dat'
       AND json_extract(s.gap, '$.features.number') = 'sg' AND json_extract(s.gap, '$.features.det') = 'def'`,
    );
    await post(env, 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
    const right = rightAnswer(env.db, s.id).answer;
    const wrong = right.replace(/^[Dd]em /u, 'den ');
    const res = await post(env, 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer: wrong,
      latencyMs: 3000,
    });
    expect(res.body).toMatchObject({ correct: false, errorClass: 'case_error' });
    const facets = (res.body.ratings as { facet: string }[]).map((r) => r.facet);
    expect(facets).toContain('skill:case.dat.m');
    expect(facets).not.toContain(`lemma:${s.lemma_id}:gender`);
  });

  it('an ambiguous determiner waits for the gender follow-up', async () => {
    const env = await testEnv(START);
    const s = nounGapSentence(
      env,
      `n.gender = 'm' AND json_extract(s.gap, '$.features.case') = 'dat'
       AND json_extract(s.gap, '$.features.number') = 'sg' AND json_extract(s.gap, '$.features.det') = 'def'`,
    );
    await post(env, 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
    const wrong = rightAnswer(env.db, s.id).answer.replace(/^[Dd]em /u, 'der ');
    const res = await post(env, 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer: wrong,
      latencyMs: 3000,
    });
    expect(res.body).toMatchObject({ errorClass: 'ambiguous', ratings: [] });
    const follow = await post(
      env,
      'marcel',
      `/api/attempts/${String(res.body.attemptId)}/follow-up`,
      {
        gender: 'f',
      },
    );
    expect((follow.body.ratings as { facet: string }[]).map((r) => r.facet)).toContain(
      `lemma:${s.lemma_id}:gender`,
    );
  });

  it('refuses attempts on lemmas not introduced yet', async () => {
    const env = await testEnv(START);
    const s = nounGapSentence(env, '1 = 1');
    const res = await post(env, 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer: 'x',
      latencyMs: 1,
    });
    expect(res.status).toBe(409);
  });
});

describe('reporting voids attempts and rebuilds cards (spec §8.4)', () => {
  it('replays the remaining reviews for both users', async () => {
    const env = await testEnv(START);
    const lemma = env.db
      .prepare<[], { lemma_id: number }>(
        `SELECT lemma_id FROM sentence WHERE exercise_types = '["bedeutung"]'
         GROUP BY lemma_id HAVING COUNT(*) >= 2 LIMIT 1`,
      )
      .get()!.lemma_id;
    const [s1, s2] = env.db
      .prepare<[number], { id: number }>(
        `SELECT id FROM sentence WHERE lemma_id = ? AND exercise_types = '["bedeutung"]' ORDER BY id LIMIT 2`,
      )
      .all(lemma)
      .map((r) => r.id) as [number, number];
    for (const user of ['marcel', 'partnerin']) {
      await post(env, user, `/api/lemmas/${lemma}/intro`, {});
      await post(env, user, '/api/attempts', {
        sentenceId: s1,
        answer: rightAnswer(env.db, s1).answer,
        latencyMs: 2000,
      });
      env.clock.advance(2 * 86_400_000);
      await post(env, user, '/api/attempts', { sentenceId: s2, answer: 'wrong', latencyMs: 2000 });
      env.clock.advance(-2 * 86_400_000);
    }
    env.clock.advance(3 * 86_400_000);
    const res = await post(env, 'marcel', '/api/reports', {
      sentenceId: s1,
      reason: 'Übersetzung passt nicht',
    });
    expect(res.body.voidedAttempts).toBe(2);
    const key = `lemma:${lemma}:meaning_recv`;
    for (const userId of [1, 2]) {
      const card = JSON.parse(
        (
          env.db
            .prepare('SELECT fsrs FROM facet_card WHERE user_id = ? AND facet_key = ?')
            .get(userId, key) as {
            fsrs: string;
          }
        ).fsrs,
      ) as StoredCard;
      const intro = (
        env.db
          .prepare('SELECT introduced_at FROM facet_card WHERE user_id = ? AND facet_key = ?')
          .get(userId, key) as { introduced_at: string }
      ).introduced_at;
      const remaining = env.db
        .prepare(
          'SELECT rating, ts FROM review_log WHERE user_id = ? AND facet_key = ? AND voided = 0 ORDER BY ts',
        )
        .all(userId, key) as { rating: 'again'; ts: string }[];
      expect(remaining).toHaveLength(1);
      expect(card).toEqual(
        replayCard(
          new Date(intro),
          remaining.map((r) => ({ rating: r.rating, at: new Date(r.ts) })),
        ),
      );
    }
    const status = env.db.prepare('SELECT status FROM sentence WHERE id = ?').get(s1) as {
      status: string;
    };
    expect(status.status).toBe('reported');
  });
});

describe('placement (both users start at A2.1)', () => {
  it('grades typed meanings and introduces the block of each passed sample, once', async () => {
    const env = await testEnv(START);
    const sample = (await get(env, 'marcel', '/api/placement')).body.sample as {
      lemmaId: number;
    }[];
    expect(sample.length).toBeGreaterThan(50);
    const gloss = (id: number) =>
      (
        JSON.parse(
          (
            env.db.prepare('SELECT glosses_accepted FROM lemma WHERE id = ?').get(id) as {
              glosses_accepted: string;
            }
          ).glosses_accepted,
        ) as string[]
      )[0] ?? '';
    const answers = sample.map((s, i) => ({
      lemmaId: s.lemmaId,
      answer: i % 2 === 0 ? gloss(s.lemmaId) : 'no idea',
    }));
    const res = await post(env, 'marcel', '/api/placement', { answers });
    expect(res.body.passed).toBe(Math.ceil(sample.length / 2));
    expect(res.body.introduced).toBeGreaterThan(0);
    const again = await post(env, 'marcel', '/api/placement', { answers });
    expect(again.body.introduced).toBe(0);
    expect((await get(env, 'marcel', '/api/me')).body.placementDone).toBe(true);
    const today = (await get(env, 'marcel', '/api/today')).body;
    expect(today.newToday).toBe(0);
  });
});
