/**
 * HTTP routes for M5: duel, exam, Wettbewerb, chore vouchers, Wochenziel with
 * reward redemptions, the reward and chore catalogs, and dual-approval
 * settings. Every read runs the settlement tick first, so results are current
 * even if the timer has not fired yet.
 */
import { EXAM, addDays, dayKey, monthKey } from '@wortduell/core';
import type { Clock } from '@wortduell/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db';
import { AttemptError } from './services/attempts';
import type { Chores, Size } from './services/chores';
import type { Competition } from './services/competition';
import type { RewardInput, Rewards } from './services/rewards';
import type { RoundKind, Rounds } from './services/rounds';
import type { SettingKey, Settings } from './services/settings';
import { DEFAULTS } from './services/settings';

export interface CompetitionDeps {
  db: Db;
  clock: Clock;
  rounds: Rounds;
  competition: Competition;
  chores: Chores;
  rewards: Rewards;
  settings: Settings;
  auth: (req: FastifyRequest, reply: FastifyReply) => { id: number } | null;
}

const answerSchema = {
  body: {
    type: 'object',
    required: ['index', 'answer', 'latencyMs'],
    properties: {
      index: { type: 'number' },
      answer: { type: 'string', maxLength: 500 },
      tappedIndex: { type: 'number' },
      latencyMs: { type: 'number', minimum: 0 },
    },
  },
};

const rewardSchema = {
  body: {
    type: 'object',
    required: ['budgetEur', 'kind', 'titleDe', 'titleEn'],
    properties: {
      budgetEur: { type: 'number' },
      kind: { enum: ['together', 'buy'] },
      titleDe: { type: 'string', minLength: 1, maxLength: 200 },
      titleEn: { type: 'string', minLength: 1, maxLength: 200 },
      missionDe: { type: 'string', maxLength: 300 },
      season: { enum: ['any', 'outdoor'] },
      needsBabysitter: { type: 'boolean' },
      estCostNote: { type: 'string', maxLength: 100 },
    },
  },
};

const choreSchema = {
  body: {
    type: 'object',
    required: ['size', 'titleDe', 'sentenceDe', 'titleEn'],
    properties: {
      size: { enum: ['S', 'M', 'L'] },
      titleDe: { type: 'string', minLength: 1, maxLength: 200 },
      sentenceDe: { type: 'string', minLength: 1, maxLength: 300 },
      titleEn: { type: 'string', minLength: 1, maxLength: 200 },
      noun: { type: ['string', 'null'], maxLength: 60 },
      verb: { type: ['string', 'null'], maxLength: 60 },
      active: { type: 'boolean' },
    },
  },
};

interface ChoreBody {
  size: Size;
  titleDe: string;
  sentenceDe: string;
  titleEn: string;
  noun?: string | null;
  verb?: string | null;
  active?: boolean;
}

export function competitionRoutes(app: FastifyInstance, d: CompetitionDeps): void {
  const { clock, rounds, competition, chores, rewards, settings, auth } = d;

  /** Authenticated user plus the other player; runs the tick. */
  const ctx = (req: FastifyRequest, reply: FastifyReply) => {
    const user = auth(req, reply);
    if (!user) return null;
    const now = clock.now();
    competition.tick(now);
    return { user, now, other: competition.other(user.id) };
  };

  /** The round a user can play now: today's duel, or the exam in its window. */
  const currentRound = (kind: RoundKind, now: Date) => {
    const today = dayKey(now);
    if (kind === 'duel') return rounds.row('duel', today);
    if (Number(today.slice(8)) > EXAM.WINDOW_DAYS) return null;
    return rounds.row('exam', monthKey(addDays(`${today.slice(0, 7)}-01`, -1)));
  };

  const roundView = (kind: RoundKind) => (req: FastifyRequest, reply: FastifyReply) => {
    const c = ctx(req, reply);
    if (!c) return;
    const round = currentRound(kind, c.now);
    if (!round || round.items.length === 0 || !c.other) return { status: 'none' };
    return rounds.view(kind, round, c.user.id, c.other.id, c.now);
  };

  const roundAnswer =
    (kind: RoundKind) =>
    (
      req: FastifyRequest<{
        Body: { index: number; answer: string; tappedIndex?: number; latencyMs: number };
      }>,
      reply: FastifyReply,
    ) => {
      const c = ctx(req, reply);
      if (!c) return;
      const round = currentRound(kind, c.now);
      if (!round || round.items.length === 0) throw new AttemptError(404, `no ${kind} to play`);
      return rounds.answer(kind, round, c.user.id, req.body, c.now);
    };

  app.get('/api/duel', roundView('duel'));
  app.post('/api/duel/answer', { schema: answerSchema }, roundAnswer('duel'));
  app.get('/api/exam', roundView('exam'));
  app.post('/api/exam/answer', { schema: answerSchema }, roundAnswer('exam'));

  /** Heute: duel card, joint goal, open vouchers, week standing. */
  app.get('/api/home', (req, reply) => {
    const c = ctx(req, reply);
    if (!c) return;
    const duel = currentRound('duel', c.now);
    const exam = currentRound('exam', c.now);
    const status = (kind: RoundKind, round: typeof duel) => {
      if (!round || round.items.length === 0 || !c.other) return null;
      const v = rounds.view(kind, round, c.user.id, c.other.id, c.now);
      return {
        status: v.status,
        total: v.total,
        answered: v.answered,
        mine: v.mine,
        other: v.other,
        closesAt: v.closesAt,
      };
    };
    const vouchers = chores
      .list(c.now)
      .filter((v) => ['choose', 'open', 'done'].includes(v.status));
    const overview = competition.overview(c.now);
    return {
      duel: status('duel', duel),
      exam: status('exam', exam),
      coop: competition.coopLive(c.now),
      balanceEur: rewards.konto().balanceEur,
      vouchers: {
        toDo: vouchers.filter(
          (v) =>
            (v.status === 'open' && v.loserId === c.user.id) ||
            (v.status === 'choose' && v.winnerId === c.user.id) ||
            (v.status === 'done' && v.winnerId === c.user.id),
        ).length,
        overdue: vouchers.filter((v) => v.overdue).length,
        open: vouchers.length,
      },
      week: overview.liveWeek,
      stars: overview.stars,
      starsPerVoucher: overview.starsPerVoucher,
    };
  });

  app.get('/api/wettbewerb', (req, reply) => {
    const c = ctx(req, reply);
    return c ? competition.overview(c.now) : undefined;
  });

  // Chore vouchers -------------------------------------------------------------------

  app.get('/api/vouchers', (req, reply) => {
    const c = ctx(req, reply);
    return c ? { vouchers: chores.list(c.now), chores: chores.chores() } : undefined;
  });

  app.post<{ Params: { id: string }; Body: { choreId: number } }>(
    '/api/vouchers/:id/choose',
    {
      schema: {
        body: {
          type: 'object',
          required: ['choreId'],
          properties: { choreId: { type: 'number' } },
        },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      chores.choose(c.user.id, Number(req.params.id), req.body.choreId, c.now);
      return { ok: true };
    },
  );

  for (const action of ['done', 'confirm'] as const) {
    app.post<{ Params: { id: string } }>(`/api/vouchers/:id/${action}`, (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      chores[action](c.user.id, Number(req.params.id), c.now);
      return { ok: true };
    });
  }

  app.post<{ Body: ChoreBody }>('/api/chores', { schema: choreSchema }, (req, reply) => {
    const c = ctx(req, reply);
    if (!c) return;
    return {
      id: chores.saveChore(null, {
        ...req.body,
        noun: req.body.noun ?? null,
        verb: req.body.verb ?? null,
        active: req.body.active ?? true,
      }),
    };
  });

  app.put<{ Params: { id: string }; Body: ChoreBody }>(
    '/api/chores/:id',
    { schema: choreSchema },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      return {
        id: chores.saveChore(Number(req.params.id), {
          ...req.body,
          noun: req.body.noun ?? null,
          verb: req.body.verb ?? null,
          active: req.body.active ?? true,
        }),
      };
    },
  );

  // Wochenziel and rewards --------------------------------------------------------------

  app.get('/api/wochenziel', (req, reply) => {
    const c = ctx(req, reply);
    if (!c) return;
    return {
      coop: competition.coopLive(c.now),
      ...rewards.konto(),
      bands: settings.get('REWARD_BANDS', c.now),
    };
  });

  app.post<{ Body: { voucherIds: number[]; band?: number | null } }>(
    '/api/redemptions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['voucherIds'],
          properties: {
            voucherIds: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 50 },
            band: { type: ['number', 'null'] },
          },
        },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      return rewards.start(c.user.id, req.body.voucherIds, req.body.band ?? null, c.now);
    },
  );

  app.post<{ Params: { id: string } }>('/api/redemptions/:id/confirm', (req, reply) => {
    const c = ctx(req, reply);
    if (!c) return;
    rewards.confirm(c.user.id, Number(req.params.id), c.now);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/redemptions/:id/reroll', (req, reply) => {
    const c = ctx(req, reply);
    return c ? rewards.reroll(c.user.id, Number(req.params.id), c.now) : undefined;
  });

  app.post<{ Params: { id: string } }>('/api/redemptions/:id/undo', (req, reply) => {
    const c = ctx(req, reply);
    return c ? rewards.undo(c.user.id, Number(req.params.id), c.now) : undefined;
  });

  app.post<{ Params: { id: string }; Body: { date: string } }>(
    '/api/redemptions/:id/plan',
    {
      schema: {
        body: {
          type: 'object',
          required: ['date'],
          properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      rewards.plan(c.user.id, Number(req.params.id), req.body.date, c.now);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/api/redemptions/:id/done',
    {
      schema: {
        body: { type: 'object', properties: { note: { type: 'string', maxLength: 1000 } } },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      rewards.done(c.user.id, Number(req.params.id), req.body.note ?? '', c.now);
      return { ok: true };
    },
  );

  app.get('/api/rewards', (req, reply) => {
    const c = ctx(req, reply);
    return c ? { rewards: rewards.rewards() } : undefined;
  });

  app.post<{
    Body: Partial<RewardInput> & Pick<RewardInput, 'budgetEur' | 'kind' | 'titleDe' | 'titleEn'>;
  }>('/api/rewards', { schema: rewardSchema }, (req, reply) => {
    const c = ctx(req, reply);
    if (!c) return;
    const b = req.body;
    return rewards.propose(
      c.user.id,
      {
        budgetEur: b.budgetEur,
        kind: b.kind,
        titleDe: b.titleDe,
        titleEn: b.titleEn,
        missionDe: b.missionDe ?? '',
        season: b.season ?? 'any',
        needsBabysitter: b.needsBabysitter ?? false,
        estCostNote: b.estCostNote ?? '',
      },
      c.now,
    );
  });

  app.post<{ Params: { id: string }; Body: { approve: boolean } }>(
    '/api/rewards/:id/decision',
    {
      schema: {
        body: {
          type: 'object',
          required: ['approve'],
          properties: { approve: { type: 'boolean' } },
        },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      rewards.decide(c.user.id, Number(req.params.id), req.body.approve);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { active: boolean } }>(
    '/api/rewards/:id/active',
    {
      schema: {
        body: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } } },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      rewards.setActive(Number(req.params.id), req.body.active);
      return { ok: true };
    },
  );

  // Settings -------------------------------------------------------------------------------

  const isKey = (k: string): k is SettingKey => Object.hasOwn(DEFAULTS, k);

  app.get('/api/settings', (req, reply) => {
    const c = ctx(req, reply);
    return c ? { settings: settings.overview(c.now) } : undefined;
  });

  app.post<{ Params: { key: string }; Body: { value: unknown } }>(
    '/api/settings/:key',
    { schema: { body: { type: 'object', required: ['value'], properties: { value: {} } } } },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      const key = req.params.key;
      if (!isKey(key)) throw new AttemptError(404, 'unknown setting');
      if (key === 'BABYSITTER_AVAILABLE') settings.setNow(c.user.id, key, req.body.value, c.now);
      else settings.propose(c.user.id, key, req.body.value, c.now);
      return { ok: true };
    },
  );

  app.post<{ Params: { key: string }; Body: { approve: boolean } }>(
    '/api/settings/:key/decision',
    {
      schema: {
        body: {
          type: 'object',
          required: ['approve'],
          properties: { approve: { type: 'boolean' } },
        },
      },
    },
    (req, reply) => {
      const c = ctx(req, reply);
      if (!c) return;
      const key = req.params.key;
      if (!isKey(key)) throw new AttemptError(404, 'unknown setting');
      return settings.decide(c.user.id, key, req.body.approve, c.now);
    },
  );
}
