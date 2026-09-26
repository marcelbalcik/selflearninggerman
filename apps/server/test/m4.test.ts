import { describe, expect, it } from 'vitest';
import { rightAnswer, testEnv } from './helpers';
import type { TestEnv } from './helpers';
import type { LtMatch } from '../src/services/komposition';

const START = '2026-10-05T06:00:00.000Z';

async function call(
  env: TestEnv,
  method: 'GET' | 'POST',
  user: string,
  url: string,
  payload?: unknown,
) {
  const res = await env.app.inject({
    method,
    url,
    headers: { cookie: await env.cookie(user) },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

function sentenceOfType(env: TestEnv, type: string, offset = 0): { id: number; lemma_id: number } {
  const row = env.db
    .prepare<[string, number], { id: number; lemma_id: number }>(
      `SELECT id, lemma_id FROM sentence WHERE exercise_types = json_array(?) AND status = 'ok'
       ORDER BY id LIMIT 1 OFFSET ?`,
    )
    .get(type, offset);
  if (!row) throw new Error(`no ${type} sentence`);
  return row;
}

function lemmaId(env: TestEnv, text: string, pos: string): number {
  const row = env.db
    .prepare<[string, string], { id: number }>('SELECT id FROM lemma WHERE text = ? AND pos = ?')
    .get(text, pos);
  if (!row) throw new Error(`no lemma ${text}`);
  return row.id;
}

describe('M4 exercise types (spec §6)', () => {
  for (const type of ['en_de_chunk', 'umformen', 'satzbau', 'wer_tut_was', 'diktat']) {
    it(`${type}: the stored answer is right, nonsense is wrong`, async () => {
      const env = await testEnv(START);
      const s = sentenceOfType(env, type);
      await call(env, 'POST', 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
      const plan = await call(env, 'GET', 'marcel', '/api/session');
      expect(plan.status).toBe(200);
      const right = await call(env, 'POST', 'marcel', '/api/attempts', {
        sentenceId: s.id,
        answer: rightAnswer(env.db, s.id).answer,
        latencyMs: 4000,
      });
      expect(right.body).toMatchObject({ correct: true });
      const s2 = sentenceOfType(env, type, 1);
      await call(env, 'POST', 'marcel', `/api/lemmas/${s2.lemma_id}/intro`, {});
      // en_de_chunk trains production, which unlocks later (FSRS.PROD_UNLOCK_STABILITY_DAYS).
      env.db
        .prepare("UPDATE facet_card SET unlocked = 1 WHERE facet_key LIKE '%:meaning_prod'")
        .run();
      const wrong = await call(env, 'POST', 'marcel', '/api/attempts', {
        sentenceId: s2.id,
        answer: type === 'wer_tut_was' ? '9' : 'Quatsch mit Soße',
        latencyMs: 4000,
      });
      expect(wrong.body).toMatchObject({ correct: false });
      expect((wrong.body.ratings as { rating: string }[]).some((r) => r.rating === 'again')).toBe(
        true,
      );
    });
  }
});

describe('disputes are decided by the other person', () => {
  it('an approved dispute accepts the answer from then on and regrades the attempt', async () => {
    const env = await testEnv(START);
    const s = sentenceOfType(env, 'umformen');
    await call(env, 'POST', 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
    const answer = `${rightAnswer(env.db, s.id).answer} halt`;
    const attempt = await call(env, 'POST', 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer,
      latencyMs: 4000,
    });
    expect(attempt.body.correct).toBe(false);
    const d = await call(env, 'POST', 'marcel', '/api/disputes', {
      attemptId: attempt.body.attemptId,
      note: 'Passt doch',
    });
    expect(d.status).toBe(200);
    const again = await call(env, 'POST', 'marcel', '/api/disputes', {
      attemptId: attempt.body.attemptId,
    });
    expect(again.status).toBe(409);
    const own = await call(env, 'GET', 'marcel', '/api/review');
    expect(own.body.disputes).toEqual([]);
    expect(own.body.myDisputes).toMatchObject([{ status: 'open', answer_raw: answer }]);
    expect(
      (
        await call(env, 'POST', 'marcel', `/api/disputes/${String(d.body.id)}/decision`, {
          approve: true,
        })
      ).status,
    ).toBe(403);
    const other = await call(env, 'GET', 'partnerin', '/api/review');
    expect(other.body.disputes).toMatchObject([{ id: d.body.id, by: 'marcel', answer }]);
    const decided = await call(
      env,
      'POST',
      'partnerin',
      `/api/disputes/${String(d.body.id)}/decision`,
      { approve: true },
    );
    expect(decided.body).toEqual({ status: 'approved' });
    const row = env.db
      .prepare('SELECT correct FROM attempt WHERE id = ?')
      .get(attempt.body.attemptId) as { correct: number };
    expect(row.correct).toBe(1);
    const logs = env.db
      .prepare('SELECT rating FROM review_log WHERE attempt_id = ? AND voided = 0')
      .all(attempt.body.attemptId) as { rating: string }[];
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.rating === 'good')).toBe(true);
    // The partner now gets the same answer accepted.
    await call(env, 'POST', 'partnerin', `/api/lemmas/${s.lemma_id}/intro`, {});
    const partner = await call(env, 'POST', 'partnerin', '/api/attempts', {
      sentenceId: s.id,
      answer,
      latencyMs: 4000,
    });
    expect(partner.body.correct).toBe(true);
  });

  it('a rejected dispute changes nothing', async () => {
    const env = await testEnv(START);
    const s = sentenceOfType(env, 'en_de_chunk');
    await call(env, 'POST', 'marcel', `/api/lemmas/${s.lemma_id}/intro`, {});
    const attempt = await call(env, 'POST', 'marcel', '/api/attempts', {
      sentenceId: s.id,
      answer: 'falsch',
      latencyMs: 4000,
    });
    const d = await call(env, 'POST', 'marcel', '/api/disputes', {
      attemptId: attempt.body.attemptId,
    });
    await call(env, 'POST', 'partnerin', `/api/disputes/${String(d.body.id)}/decision`, {
      approve: false,
    });
    const extra = env.db.prepare('SELECT COUNT(*) AS n FROM accepted_extra').get() as { n: number };
    expect(extra.n).toBe(0);
    const row = env.db
      .prepare('SELECT correct FROM attempt WHERE id = ?')
      .get(attempt.body.attemptId) as { correct: number };
    expect(row.correct).toBe(0);
  });
});

describe('komposition (spec §6.8)', () => {
  it('checks targets and dative, rates facets, and the partner reviews it', async () => {
    const lt: LtMatch[] = [];
    const env = await testEnv(START, { languageTool: () => Promise.resolve(lt) });
    const ids = [
      lemmaId(env, 'Mann', 'noun'),
      lemmaId(env, 'helfen', 'verb'),
      lemmaId(env, 'gut', 'adj'),
    ];
    for (const id of ids) await call(env, 'POST', 'marcel', `/api/lemmas/${id}/intro`, {});
    const plan = await call(env, 'GET', 'marcel', '/api/session');
    const task = plan.body.komposition as { lemmas: { id: number }[]; requiredCase: string };
    expect(task.lemmas.map((l) => l.id).sort()).toEqual([...ids].sort());
    expect(task.requiredCase).toBe('dat');

    const text = 'Ich helfe dem Mann. Das ist gut.';
    lt.push({
      offset: text.indexOf('Das'),
      length: 3,
      message: 'Test',
      replacements: ['Dies'],
      ruleId: 'TEST_RULE',
      category: 'STYLE',
    });
    const res = await call(env, 'POST', 'marcel', '/api/komposition', {
      lemmaIds: ids,
      requiredCase: 'dat',
      text,
    });
    expect(res.status).toBe(200);
    const checks = res.body.checks as { lemmaId: number; found: boolean; dative: boolean }[];
    expect(checks.every((c) => c.found)).toBe(true);
    expect(checks.find((c) => c.lemmaId === ids[0])?.dative).toBe(true);
    expect(res.body.languageTool).toHaveLength(1);
    expect((res.body.ratings as { rating: string }[]).every((r) => r.rating === 'good')).toBe(true);
    // Once a day.
    expect((await call(env, 'GET', 'marcel', '/api/session')).body.komposition).toBeNull();
    const twice = await call(env, 'POST', 'marcel', '/api/komposition', {
      lemmaIds: ids,
      requiredCase: 'dat',
      text,
    });
    expect(twice.status).toBe(409);

    // Only the partner reviews; a mark on a target word rates that word.
    const kid = res.body.id as number;
    expect((await call(env, 'GET', 'marcel', '/api/review')).body.kompositions).toEqual([]);
    const own = await call(env, 'POST', 'marcel', `/api/komposition/${kid}/review`, { marks: [] });
    expect(own.status).toBe(403);
    const list = await call(env, 'GET', 'partnerin', '/api/review');
    expect(list.body.kompositions).toMatchObject([{ id: kid, by: 'marcel', text }]);
    const start = text.indexOf('Mann');
    const reviewed = await call(env, 'POST', 'partnerin', `/api/komposition/${kid}/review`, {
      marks: [{ start, end: start + 4, type: 'gender', correction: 'Mann' }],
    });
    expect(reviewed.body.ratings).toEqual([{ facet: `lemma:${ids[0]}:gender`, rating: 'again' }]);
    const logs = env.db
      .prepare('SELECT COUNT(*) AS n FROM review_log WHERE komposition_id = ?')
      .get(kid) as { n: number };
    expect(logs.n).toBe(4);
    expect((await call(env, 'GET', 'partnerin', '/api/review')).body.kompositions).toEqual([]);
  });

  it('flags a missing target and a missing dative', async () => {
    const env = await testEnv(START);
    const ids = [
      lemmaId(env, 'Mann', 'noun'),
      lemmaId(env, 'helfen', 'verb'),
      lemmaId(env, 'gut', 'adj'),
    ];
    for (const id of ids) await call(env, 'POST', 'marcel', `/api/lemmas/${id}/intro`, {});
    const res = await call(env, 'POST', 'marcel', '/api/komposition', {
      lemmaIds: ids,
      requiredCase: 'dat',
      text: 'Der Mann ist gut.',
    });
    const checks = res.body.checks as { lemmaId: number; found: boolean }[];
    expect(checks.find((c) => c.lemmaId === ids[1])?.found).toBe(false);
    expect(res.body.languageTool).toBeNull();
    const facets = (res.body.ratings as { facet: string; rating: string }[])
      .filter((r) => r.rating === 'again')
      .map((r) => r.facet);
    expect(facets).toContain(`lemma:${ids[1]}:meaning_recv`);
    expect(facets).toContain('skill:case.dat.m');
  });
});

describe('Prüfen: frames and reports', () => {
  it('approving a frame gives learners the frame card', async () => {
    const env = await testEnv(START);
    const before = await call(env, 'GET', 'marcel', '/api/review');
    const frames = before.body.frames as {
      lemmaId: number;
      proposal: { objects: string[] } | null;
    }[];
    const f = frames.find((x) => x.proposal && x.proposal.objects.length > 0);
    if (!f) throw new Error('no frame to review');
    await call(env, 'POST', 'marcel', `/api/lemmas/${f.lemmaId}/intro`, {});
    const res = await call(env, 'POST', 'partnerin', `/api/frames/${f.lemmaId}`, {
      status: 'approved',
    });
    expect(res.body).toEqual({ addedCards: 1 });
    const after = await call(env, 'GET', 'marcel', '/api/review');
    expect((after.body.frames as { lemmaId: number }[]).some((x) => x.lemmaId === f.lemmaId)).toBe(
      false,
    );
    const lemma = await call(env, 'GET', 'marcel', `/api/lemmas/${f.lemmaId}`);
    expect((lemma.body.verb as { frameStatus: string }).frameStatus).toBe('approved');
  });

  it('a rejected report brings the sentence back', async () => {
    const env = await testEnv(START);
    const s = sentenceOfType(env, 'kasus_luecke');
    await call(env, 'POST', 'marcel', '/api/reports', { sentenceId: s.id, reason: 'komisch' });
    const list = await call(env, 'GET', 'partnerin', '/api/review');
    const report = (list.body.reports as { id: number; sentence_id: number }[]).find(
      (r) => r.sentence_id === s.id,
    );
    if (!report) throw new Error('report not listed');
    await call(env, 'POST', 'partnerin', `/api/reports/${report.id}/decision`, {
      action: 'reject',
    });
    const row = env.db.prepare('SELECT status FROM sentence WHERE id = ?').get(s.id) as {
      status: string;
    };
    expect(row.status).toBe('ok');
  });
});
