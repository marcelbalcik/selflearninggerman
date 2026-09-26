import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { Clock, Gender } from '@wortduell/core';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LoginLimiter, SESSION_COOKIE, login, logout, sessionUser } from './auth';
import type { Db } from './db';
import { Repo } from './repo';
import { AttemptError, Attempts } from './services/attempts';
import type { AttemptInput } from './services/attempts';
import { Cards } from './services/cards';
import { Komposition, languageToolClient } from './services/komposition';
import type { LanguageTool } from './services/komposition';
import { Learning } from './services/learning';
import { Review } from './services/review';
import { Rewards } from './services/rewards';
import { Rounds } from './services/rounds';
import { Sessions } from './services/session';
import { Settings } from './services/settings';
import { Chores } from './services/chores';
import { Competition } from './services/competition';
import { competitionRoutes } from './routes-competition';

export interface AppOptions {
  db: Db;
  clock: Clock;
  /** Secure cookies need HTTPS; off only for local development and tests. */
  secureCookies?: boolean;
  logger?: boolean;
  /** Directory of the built web app to serve (apps/web/dist). */
  webDist?: string;
  /** LanguageTool client for komposition feedback (default: none). */
  languageTool?: LanguageTool;
  /** Seed source for reward draws (default: crypto random). */
  seed?: () => number;
  /** Run the settlement tick on a timer (production); off in tests. */
  tickEveryMs?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: number; name: string; uiLang: string } | null;
  }
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const { db, clock } = opts;
  const app = Fastify({ logger: opts.logger ?? false });
  const repo = new Repo(db);
  const cards = new Cards(db);
  const settings = new Settings(db);
  const sessions = new Sessions(db, repo, settings);
  const attempts = new Attempts(db, repo, cards);
  const learning = new Learning(db, repo, cards, sessions);
  const komposition = new Komposition(
    db,
    repo,
    cards,
    opts.languageTool ?? languageToolClient(undefined),
  );
  const review = new Review(db, repo, cards, sessions);
  const rounds = new Rounds(db, repo, attempts, sessions);
  const chores = new Chores(db, settings);
  const competition = new Competition(db, rounds, chores, settings, sessions);
  const rewards = new Rewards(db, settings, opts.seed ?? (() => randomInt(2 ** 31 - 1)));
  if (opts.tickEveryMs) {
    const timer = setInterval(() => {
      try {
        competition.tick(clock.now());
      } catch (err) {
        app.log.error(err, 'settlement tick failed');
      }
    }, opts.tickEveryMs);
    app.addHook('onClose', (_app, done) => {
      clearInterval(timer);
      done();
    });
  }
  const limiter = new LoginLimiter();

  void app.register(cookie);
  app.decorateRequest('user', null);
  app.addHook('preHandler', (req, _reply, done) => {
    req.user = sessionUser(db, req.cookies[SESSION_COOKIE], clock.now());
    done();
  });

  const auth = (req: FastifyRequest, reply: FastifyReply): { id: number } | null => {
    if (!req.user) {
      void reply.code(401).send({ error: 'not logged in' });
      return null;
    }
    return req.user;
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AttemptError) return reply.code(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'error';
    return reply.code(status).send({ error: status === 500 ? 'internal error' : message });
  });

  app.post<{ Body: { name: string; password: string } }>(
    '/api/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'password'],
          properties: { name: { type: 'string' }, password: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const now = clock.now();
      const keys = [`name:${req.body.name}`, `ip:${req.ip}`];
      if (limiter.blocked(keys, now)) return reply.code(429).send({ error: 'too many attempts' });
      const result = await login(db, req.body.name, req.body.password, now);
      if (!result) {
        limiter.fail(keys, now);
        return reply.code(401).send({ error: 'wrong name or password' });
      }
      limiter.clear(keys);
      void reply.setCookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        secure: opts.secureCookies ?? true,
        sameSite: 'lax',
        path: '/',
        expires: result.expires,
      });
      return { ok: true };
    },
  );

  app.post('/api/logout', (req, reply) => {
    logout(db, req.cookies[SESSION_COOKIE]);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const row = db
      .prepare<[number], { placement_done_at: string | null }>(
        'SELECT placement_done_at FROM user WHERE id = ?',
      )
      .get(user.id);
    return {
      ...req.user,
      placementDone: typeof row?.placement_done_at === 'string',
      partner: competition.other(user.id),
    };
  });

  app.put<{ Body: { uiLang: 'de' | 'en' } }>(
    '/api/me',
    {
      schema: {
        body: {
          type: 'object',
          required: ['uiLang'],
          properties: { uiLang: { enum: ['de', 'en'] } },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      db.prepare('UPDATE user SET ui_lang = ? WHERE id = ?').run(req.body.uiLang, user.id);
      return { ok: true };
    },
  );

  app.get('/api/today', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const now = clock.now();
    competition.tick(now);
    const today = learning.today(user.id, now);
    // An empty due queue counts toward an active day (spec §8.3).
    if (today.dueItems === 0) competition.markCleared(user.id, now);
    return today;
  });

  app.get<{ Querystring: { mode?: string } }>('/api/session', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const reviewsOnly = req.query.mode === 'reviews';
    const plan = sessions.build(user.id, clock.now(), { reviewsOnly });
    return { ...plan, komposition: reviewsOnly ? null : komposition.task(user.id, clock.now()) };
  });

  app.post<{ Body: { lemmaIds: number[]; requiredCase: 'dat' | null; text: string } }>(
    '/api/komposition',
    {
      schema: {
        body: {
          type: 'object',
          required: ['lemmaIds', 'text'],
          properties: {
            lemmaIds: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 5 },
            requiredCase: { enum: ['dat', null] },
            text: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return komposition.submit(
        user.id,
        {
          lemmaIds: req.body.lemmaIds,
          requiredCase: req.body.requiredCase ?? null,
          text: req.body.text,
        },
        clock.now(),
      );
    },
  );

  app.post<{
    Params: { id: string };
    Body: { marks: { start: number; end: number; type: string; correction: string }[] };
  }>(
    '/api/komposition/:id/review',
    {
      schema: {
        body: {
          type: 'object',
          required: ['marks'],
          properties: {
            marks: {
              type: 'array',
              maxItems: 50,
              items: {
                type: 'object',
                required: ['start', 'end', 'type', 'correction'],
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' },
                  type: { enum: ['gender', 'case', 'frame', 'ending', 'other'] },
                  correction: { type: 'string', maxLength: 200 },
                },
              },
            },
          },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return komposition.review(user.id, Number(req.params.id), req.body.marks, clock.now());
    },
  );

  app.get('/api/review', (req, reply) => {
    const user = auth(req, reply);
    return user ? review.list(user.id) : undefined;
  });

  app.post<{ Body: { attemptId: number; note?: string } }>(
    '/api/disputes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['attemptId'],
          properties: { attemptId: { type: 'number' }, note: { type: 'string', maxLength: 500 } },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return review.dispute(user.id, req.body.attemptId, req.body.note ?? '', clock.now());
    },
  );

  app.post<{ Params: { id: string }; Body: { approve: boolean } }>(
    '/api/disputes/:id/decision',
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
      const user = auth(req, reply);
      if (!user) return;
      const now = clock.now();
      const result = review.decideDispute(user.id, Number(req.params.id), req.body.approve, now);
      const attempt = db
        .prepare<[number], { attempt_id: number }>('SELECT attempt_id FROM dispute WHERE id = ?')
        .get(Number(req.params.id));
      // A regraded duel or exam answer changes its round's result (spec §6 disputes, §8.4).
      if (req.body.approve && attempt) competition.resettleAttempts([attempt.attempt_id], now);
      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: { action: 'reject' | 'fixed' } }>(
    '/api/reports/:id/decision',
    {
      schema: {
        body: {
          type: 'object',
          required: ['action'],
          properties: { action: { enum: ['reject', 'fixed'] } },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return review.decideReport(Number(req.params.id), req.body.action, clock.now());
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      status: 'approved' | 'rejected';
      frame?: { objects: string[]; preps?: { prep: string; case: string }[] };
    };
  }>(
    '/api/frames/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { enum: ['approved', 'rejected'] },
            frame: {
              type: 'object',
              required: ['objects'],
              properties: {
                objects: { type: 'array', items: { enum: ['akk', 'dat'] } },
                preps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['prep', 'case'],
                    properties: { prep: { type: 'string' }, case: { enum: ['akk', 'dat'] } },
                  },
                },
              },
            },
          },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return review.decideFrame(
        user.id,
        Number(req.params.id),
        req.body.status,
        req.body.frame ?? null,
        clock.now(),
      );
    },
  );

  app.post<{ Params: { id: string } }>('/api/lemmas/:id/intro', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const lemma = repo.lemma(Number(req.params.id));
    if (!lemma) return reply.code(404).send({ error: 'lemma not found' });
    return { introduced: cards.introduce(user.id, lemma, clock.now(), 'session') };
  });

  app.get<{ Params: { id: string } }>('/api/lemmas/:id', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const detail = learning.lemmaDetail(user.id, Number(req.params.id), clock.now());
    return detail ?? reply.code(404).send({ error: 'lemma not found' });
  });

  app.post<{ Body: AttemptInput }>(
    '/api/attempts',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sentenceId', 'answer', 'latencyMs'],
          properties: {
            sentenceId: { type: 'number' },
            answer: { type: 'string', maxLength: 500 },
            tappedIndex: { type: 'number' },
            latencyMs: { type: 'number', minimum: 0 },
            hintUsed: { type: 'boolean' },
          },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return attempts.submit(user.id, req.body, clock.now());
    },
  );

  app.post<{ Params: { id: string }; Body: { gender: Gender } }>(
    '/api/attempts/:id/follow-up',
    {
      schema: {
        body: {
          type: 'object',
          required: ['gender'],
          properties: { gender: { enum: ['m', 'f', 'n'] } },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return {
        ratings: attempts.followUp(user.id, Number(req.params.id), req.body.gender, clock.now()),
      };
    },
  );

  app.post<{ Body: { sentenceId: number; reason?: string } }>(
    '/api/reports',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sentenceId'],
          properties: {
            sentenceId: { type: 'number' },
            reason: { type: 'string', maxLength: 1000 },
          },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      const now = clock.now();
      const result = learning.report(user.id, req.body.sentenceId, req.body.reason ?? '', now);
      competition.resettleSentence(req.body.sentenceId, now);
      return result;
    },
  );

  app.get('/api/placement', (req, reply) => {
    const user = auth(req, reply);
    return user ? { sample: learning.placementSample(user.id) } : undefined;
  });

  app.post<{ Body: { answers: { lemmaId: number; answer: string }[] } }>(
    '/api/placement',
    {
      schema: {
        body: {
          type: 'object',
          required: ['answers'],
          properties: {
            answers: {
              type: 'array',
              maxItems: 1000,
              items: {
                type: 'object',
                required: ['lemmaId', 'answer'],
                properties: {
                  lemmaId: { type: 'number' },
                  answer: { type: 'string', maxLength: 200 },
                },
              },
            },
          },
        },
      },
    },
    (req, reply) => {
      const user = auth(req, reply);
      if (!user) return;
      return learning.placement(user.id, req.body.answers, clock.now());
    },
  );

  app.post('/api/placement/skip', (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    learning.skipPlacement(user.id, clock.now());
    return { ok: true };
  });

  competitionRoutes(app, { db, clock, rounds, competition, chores, rewards, settings, auth });

  if (opts.webDist && existsSync(opts.webDist)) {
    // The built PWA and its audio, with a fallback to index.html for app routes.
    void app.register(fastifyStatic, { root: opts.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
