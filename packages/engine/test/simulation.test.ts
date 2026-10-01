/**
 * M2 acceptance: two synthetic users over 30 learning days with a fake clock,
 * crossing the autumn DST switch (2026-10-25).
 */
import { describe, expect, it } from 'vitest';
import { SESSION, addDays, dayKey } from '@wortduell/core';
import type { SessionItem, SessionPlan } from '../src/services/session';
import { berlinMorning, rightAnswer, rng, testEnv } from './helpers';

const FIRST_DAY = '2026-10-10';
const DAYS = 30;
const USERS = [
  { name: 'marcel', id: 1, accuracy: 0.85, seed: 7 },
  { name: 'partnerin', id: 2, accuracy: 0.7, seed: 11 },
];

function wrongAnswer(item: SessionItem & { kind: 'exercise' }, right: string, r: number): string {
  if (item.exerciseType === 'kasus_luecke') {
    // Half grammatical slips (another determiner), half unknown words.
    if (r < 0.5) {
      const [det, ...rest] = right.split(' ');
      const swap: Record<string, string> = {
        dem: 'den',
        den: 'dem',
        der: 'die',
        die: 'der',
        das: 'die',
      };
      return [swap[(det ?? '').toLowerCase()] ?? 'des', ...rest].join(' ');
    }
    return 'Quatsch';
  }
  return item.exerciseType === 'bedeutung' ? 'no idea' : 'falsch';
}

describe('30-day simulation (M2 acceptance)', () => {
  it('keeps every queue and FSRS invariant for two users', async () => {
    const env = await testEnv(berlinMorning(FIRST_DAY));
    const stats = new Map(
      USERS.map((u) => [u.name, { attempts: 0, correct: 0, intros: 0, ratings: 0 }]),
    );
    const seenDays = new Set<string>();
    const rand = new Map(USERS.map((u) => [u.name, rng(u.seed)]));

    for (let d = 0; d < DAYS; d++) {
      const day = addDays(FIRST_DAY, d);
      env.clock.set(berlinMorning(day));
      expect(dayKey(env.clock.now())).toBe(day);
      seenDays.add(day);

      for (const user of USERS) {
        const cookie = await env.cookie(user.name);
        const random = rand.get(user.name)!;
        const s = stats.get(user.name)!;
        const plan = (
          await env.app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })
        ).json<SessionPlan>();

        // Queue invariants (spec §8.2).
        for (let i = 1; i < plan.items.length; i++) {
          expect(plan.items[i]!.lemmaId, `same lemma twice in a row on ${day}`).not.toBe(
            plan.items[i - 1]!.lemmaId,
          );
        }
        const reviews = plan.items.filter((i) => i.kind === 'exercise' && !i.afterIntro);
        const cap = Math.max(
          2,
          Math.ceil(SESSION.MAX_EXERCISE_TYPE_SHARE * reviews.length + plan.deferred),
        );
        const perType = new Map<string, number>();
        for (const i of reviews)
          if (i.kind === 'exercise')
            perType.set(i.exerciseType, (perType.get(i.exerciseType) ?? 0) + 1);
        for (const n of perType.values()) expect(n).toBeLessThanOrEqual(cap);
        const intros = plan.items.filter((i) => i.kind === 'intro');
        expect(intros.length).toBeLessThanOrEqual(SESSION.NEW_PER_DAY);
        const fields = intros
          .map((i) =>
            i.kind === 'intro'
              ? (env.db
                  .prepare('SELECT semantic_field AS f FROM lemma WHERE id = ?')
                  .get(i.lemmaId) as { f: string | null })
              : null,
          )
          .map((r) => r?.f)
          .filter((f) => f);
        expect(new Set(fields).size, `two new words of one semantic field on ${day}`).toBe(
          fields.length,
        );

        for (const item of plan.items) {
          env.clock.advance(20_000);
          if (item.kind === 'intro') {
            const res = await env.app.inject({
              method: 'POST',
              url: `/api/lemmas/${item.lemmaId}/intro`,
              headers: { cookie },
            });
            expect(res.statusCode).toBe(200);
            s.intros += 1;
            continue;
          }
          const right = rightAnswer(env.db, item.sentenceId);
          const ok = random() < user.accuracy;
          const res = await env.app.inject({
            method: 'POST',
            url: '/api/attempts',
            headers: { cookie },
            payload: {
              sentenceId: item.sentenceId,
              answer: ok ? right.answer : wrongAnswer(item, right.answer, random()),
              ...(right.tappedIndex !== undefined ? { tappedIndex: right.tappedIndex } : {}),
              latencyMs: 2000 + Math.floor(random() * 9000),
            },
          });
          expect(res.statusCode, res.body).toBe(200);
          const fb = res.json<{
            attemptId: number;
            correct: boolean;
            errorClass: string | null;
            ratings: unknown[];
          }>();
          s.attempts += 1;
          if (fb.correct) s.correct += 1;
          if (ok)
            expect(fb.correct, `right answer graded wrong: ${JSON.stringify(item.prompt)}`).toBe(
              true,
            );
          if (fb.errorClass === 'ambiguous') {
            const f = await env.app.inject({
              method: 'POST',
              url: `/api/attempts/${fb.attemptId}/follow-up`,
              headers: { cookie },
              payload: { gender: random() < 0.5 ? 'm' : 'f' },
            });
            s.ratings += f.json<{ ratings: unknown[] }>().ratings.length;
          } else {
            s.ratings += fb.ratings.length;
          }
        }
        // Intros counted per learning day never exceed the cap, even across sessions.
        const perDay = env.db
          .prepare(
            "SELECT COUNT(*) AS n FROM lemma_intro WHERE user_id = ? AND day_key = ? AND source = 'session'",
          )
          .get(user.id, day) as { n: number };
        expect(perDay.n).toBeLessThanOrEqual(SESSION.NEW_PER_DAY);
      }
    }

    expect(seenDays.size).toBe(DAYS);
    for (const user of USERS) {
      const s = stats.get(user.name)!;
      // Every rating is one non-voided review_log row.
      const logged = env.db
        .prepare(
          "SELECT COUNT(*) AS n FROM review_log WHERE user_id = ? AND voided = 0 AND context = 'session'",
        )
        .get(user.id) as { n: number };
      expect(logged.n).toBe(s.ratings);
      // Five new words a day for 30 days.
      expect(s.intros).toBe(SESSION.NEW_PER_DAY * DAYS);
      // Receptive meaning stabilises: production unlocks for many words.
      const unlocked = env.db
        .prepare(
          "SELECT COUNT(*) AS n FROM facet_card WHERE user_id = ? AND facet_key LIKE '%:meaning_prod' AND unlocked = 1",
        )
        .get(user.id) as { n: number };
      expect(unlocked.n).toBeGreaterThan(20);
      // The stronger learner ends with more stable cards.
      console.log(user.name, s, 'meaning_prod unlocked', unlocked.n);
    }
    const avgStability = (id: number) =>
      (
        env.db
          .prepare(
            "SELECT AVG(json_extract(fsrs, '$.stability')) AS s FROM facet_card WHERE user_id = ? AND facet_key LIKE '%:meaning_recv'",
          )
          .get(id) as { s: number }
      ).s;
    expect(avgStability(1)).toBeGreaterThan(avgStability(2));

    // After a full day off, reviews are due again and the backlog flag is consistent.
    env.clock.set(berlinMorning(addDays(FIRST_DAY, DAYS + 1)));
    const today = (
      await env.app.inject({
        method: 'GET',
        url: '/api/today',
        headers: { cookie: await env.cookie('marcel') },
      })
    ).json<{ dueCount: number; backlog: boolean }>();
    expect(today.dueCount).toBeGreaterThan(0);
    expect(today.backlog).toBe(today.dueCount > SESSION.BACKLOG_THRESHOLD);
  }, 120_000);
});
