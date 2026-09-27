/**
 * The app's API without a network: `engine.call(user, method, path, body, now)`
 * runs a route in-process against the local database. The same routes serve the
 * browser (apps/web) and the tests. Writes are what the action log records and
 * replays (src/log.ts), so every write must depend only on its inputs, its
 * author, its time and the database, never on hidden randomness.
 */
import { DEFAULTS } from './services/settings';
import type { Clock } from '@wortduell/core';
import { EXAM, addDays, dayKey, monthKey } from '@wortduell/core';
import type { Db } from './db';
import { Ids, actionKey } from './ids';
import { Repo } from './repo';
import { AttemptError, Attempts } from './services/attempts';
import type { AttemptInput } from './services/attempts';
import { Cards } from './services/cards';
import { Chores } from './services/chores';
import type { Size } from './services/chores';
import { Competition } from './services/competition';
import { Komposition } from './services/komposition';
import { Learning } from './services/learning';
import { Review } from './services/review';
import { Rewards } from './services/rewards';
import type { RewardInput } from './services/rewards';
import { Rounds } from './services/rounds';
import type { RoundKind } from './services/rounds';
import { Sessions } from './services/session';
import { Settings } from './services/settings';
import type { SettingKey } from './services/settings';

export type Method = 'GET' | 'POST' | 'PUT';

export interface Response {
  status: number;
  body: unknown;
}

type Body = Record<string, unknown>;

interface Ctx {
  userId: number;
  now: Date;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Body;
}

type Handler = (c: Ctx) => unknown;

interface Route {
  method: Method;
  parts: string[];
  handler: Handler;
}

const num = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AttemptError(400, 'expected a number');
  return n;
};
const str = (v: unknown, max = 2000): string => {
  if (typeof v !== 'string' || v.length > max) throw new AttemptError(400, 'expected a string');
  return v;
};
const bool = (v: unknown): boolean => {
  if (typeof v !== 'boolean') throw new AttemptError(400, 'expected a boolean');
  return v;
};

export class Engine {
  readonly repo: Repo;
  readonly cards: Cards;
  readonly settings: Settings;
  readonly sessions: Sessions;
  readonly attempts: Attempts;
  readonly learning: Learning;
  readonly komposition: Komposition;
  readonly review: Review;
  readonly rounds: Rounds;
  readonly chores: Chores;
  readonly competition: Competition;
  readonly rewards: Rewards;
  readonly ids = new Ids();
  private readonly routes: Route[] = [];
  /** Last write time per user: two writes never share a millisecond (ids, log order). */
  private readonly lastWrite = new Map<number, number>();

  constructor(
    readonly db: Db,
    private readonly clock: Clock,
  ) {
    const ids = this.ids;
    this.repo = new Repo(db);
    this.cards = new Cards(db);
    this.settings = new Settings(db);
    this.sessions = new Sessions(db, this.repo, this.settings);
    this.attempts = new Attempts(db, this.repo, this.cards, ids);
    this.learning = new Learning(db, this.repo, this.cards, this.sessions, ids);
    this.komposition = new Komposition(db, this.repo, this.cards, ids);
    this.review = new Review(db, this.repo, this.cards, this.sessions, ids);
    this.rounds = new Rounds(db, this.repo, this.attempts, this.sessions);
    this.chores = new Chores(db, this.settings, ids);
    this.competition = new Competition(
      db,
      this.rounds,
      this.chores,
      this.settings,
      this.sessions,
      ids,
    );
    this.rewards = new Rewards(db, this.settings, ids);
    this.register();
  }

  /** Create or rename the two users (from the app config). Idempotent. */
  seedUsers(names: string[]): void {
    for (const [i, name] of names.entries()) {
      this.db
        .prepare(
          `INSERT INTO user (id, name, pw_hash) VALUES (?, ?, '') ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        )
        .run(i + 1, name);
    }
  }

  /**
   * Run one route as `userId` at `now` (default: the engine clock). The
   * settlement tick runs first, so results are current.
   */
  call(
    userId: number,
    method: Method,
    url: string,
    body: unknown = {},
    at = this.clock.now(),
  ): Response {
    let now = at;
    if (method !== 'GET') {
      const last = this.lastWrite.get(userId) ?? 0;
      if (now.getTime() <= last) now = new Date(last + 1);
      this.lastWrite.set(userId, now.getTime());
    }
    const [path = '', qs = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs));
    const parts = path.split('/').filter(Boolean);
    let matched = false;
    for (const r of this.routes) {
      if (r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      if (
        !r.parts.every((p, i) =>
          p.startsWith(':') ? ((params[p.slice(1)] = parts[i] as string), true) : p === parts[i],
        )
      )
        continue;
      matched = true;
      if (r.method !== method) continue;
      try {
        if (!this.db.prepare('SELECT 1 FROM user WHERE id = ?').get(userId))
          throw new AttemptError(401, 'unknown user');
        const run = () => {
          this.competition.tick(now);
          return r.handler({ userId, now, params, query, body: (body ?? {}) as Body });
        };
        // A write is one action: all of it or nothing (the log replays it the same way).
        const result =
          method === 'GET'
            ? run()
            : this.ids.scope(actionKey(now, userId), () => this.db.transaction(run)());
        return { status: 200, body: result };
      } catch (err) {
        if (err instanceof AttemptError)
          return { status: err.status, body: { error: err.message } };
        const message = err instanceof Error ? err.message : String(err);
        return { status: 500, body: { error: message } };
      }
    }
    return { status: matched ? 405 : 404, body: { error: 'not found' } };
  }

  private on(method: Method, path: string, handler: Handler): void {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
  }

  /** The round a user can play now: today's duel, or the exam in its window. */
  private currentRound(kind: RoundKind, now: Date) {
    const today = dayKey(now);
    if (kind === 'duel') return this.rounds.row('duel', today);
    if (Number(today.slice(8)) > EXAM.WINDOW_DAYS) return null;
    return this.rounds.row('exam', monthKey(addDays(`${today.slice(0, 7)}-01`, -1)));
  }

  private register(): void {
    const {
      db,
      learning,
      sessions,
      komposition,
      review,
      attempts,
      cards,
      repo,
      competition,
      rounds,
      chores,
      rewards,
      settings,
    } = this;

    // Me and the day -------------------------------------------------------------------
    this.on('GET', '/api/me', (c) => {
      const row = db
        .prepare<[number], { name: string; ui_lang: string; placement_done_at: string | null }>(
          'SELECT name, ui_lang, placement_done_at FROM user WHERE id = ?',
        )
        .get(c.userId);
      return {
        id: c.userId,
        name: row?.name ?? '',
        uiLang: row?.ui_lang ?? 'de',
        placementDone: typeof row?.placement_done_at === 'string',
        partner: competition.other(c.userId),
      };
    });
    this.on('PUT', '/api/me', (c) => {
      const lang = c.body.uiLang;
      if (lang !== 'de' && lang !== 'en') throw new AttemptError(400, 'uiLang');
      db.prepare('UPDATE user SET ui_lang = ? WHERE id = ?').run(lang, c.userId);
      return { ok: true };
    });
    this.on('GET', '/api/today', (c) => learning.today(c.userId, c.now));
    /** Heute saw an empty due queue: counts toward an active day (spec §8.3). */
    this.on('POST', '/api/day/cleared', (c) => {
      competition.markCleared(c.userId, c.now);
      return { ok: true };
    });
    this.on('GET', '/api/session', (c) => {
      const reviewsOnly = c.query.mode === 'reviews';
      const plan = sessions.build(c.userId, c.now, { reviewsOnly });
      return { ...plan, komposition: reviewsOnly ? null : komposition.task(c.userId, c.now) };
    });

    // Learning --------------------------------------------------------------------------
    this.on('POST', '/api/lemmas/:id/intro', (c) => {
      const lemma = repo.lemma(num(c.params.id));
      if (!lemma) throw new AttemptError(404, 'lemma not found');
      return { introduced: cards.introduce(c.userId, lemma, c.now, 'session') };
    });
    this.on('GET', '/api/lemmas/:id', (c) => {
      const d = learning.lemmaDetail(c.userId, num(c.params.id), c.now);
      if (!d) throw new AttemptError(404, 'lemma not found');
      return d;
    });
    this.on('POST', '/api/attempts', (c) => {
      const b = c.body;
      const input: AttemptInput = {
        sentenceId: num(b.sentenceId),
        answer: str(b.answer, 500),
        latencyMs: Math.max(0, num(b.latencyMs)),
        ...(b.tappedIndex !== undefined ? { tappedIndex: num(b.tappedIndex) } : {}),
        ...(b.hintUsed === true ? { hintUsed: true } : {}),
      };
      return attempts.submit(c.userId, input, c.now);
    });
    this.on('POST', '/api/attempts/:id/follow-up', (c) => {
      const g = c.body.gender;
      if (g !== 'm' && g !== 'f' && g !== 'n') throw new AttemptError(400, 'gender');
      return { ratings: attempts.followUp(c.userId, num(c.params.id), g, c.now) };
    });
    this.on('POST', '/api/reports', (c) => {
      const sentenceId = num(c.body.sentenceId);
      const result = learning.report(c.userId, sentenceId, str(c.body.reason ?? '', 1000), c.now);
      competition.resettleSentence(sentenceId, c.now);
      return result;
    });
    this.on('GET', '/api/placement', (c) => ({ sample: learning.placementSample(c.userId) }));
    this.on('POST', '/api/placement', (c) => {
      const answers = c.body.answers;
      if (!Array.isArray(answers)) throw new AttemptError(400, 'answers');
      return learning.placement(
        c.userId,
        answers.map((a: { lemmaId: unknown; answer: unknown }) => ({
          lemmaId: num(a.lemmaId),
          answer: str(a.answer, 200),
        })),
        c.now,
      );
    });
    this.on('POST', '/api/placement/skip', (c) => {
      learning.skipPlacement(c.userId, c.now);
      return { ok: true };
    });

    // Komposition, Prüfen ------------------------------------------------------------------
    this.on('POST', '/api/komposition', (c) => {
      const ids = c.body.lemmaIds;
      if (!Array.isArray(ids)) throw new AttemptError(400, 'lemmaIds');
      const rc = c.body.requiredCase === 'dat' ? 'dat' : null;
      return komposition.submit(
        c.userId,
        { lemmaIds: ids.map(num), requiredCase: rc, text: str(c.body.text, 2000) },
        c.now,
      );
    });
    this.on('POST', '/api/komposition/:id/review', (c) => {
      const marks = c.body.marks;
      if (!Array.isArray(marks)) throw new AttemptError(400, 'marks');
      return komposition.review(
        c.userId,
        num(c.params.id),
        marks.map((m: Body) => ({
          start: num(m.start),
          end: num(m.end),
          type: str(m.type, 20),
          correction: str(m.correction, 200),
        })),
        c.now,
      );
    });
    this.on('GET', '/api/review', (c) => review.list(c.userId));
    this.on('POST', '/api/disputes', (c) =>
      review.dispute(c.userId, num(c.body.attemptId), str(c.body.note ?? '', 500), c.now),
    );
    this.on('POST', '/api/disputes/:id/decision', (c) => {
      const id = num(c.params.id);
      const approve = bool(c.body.approve);
      const result = review.decideDispute(c.userId, id, approve, c.now);
      const a = db
        .prepare<[number], { attempt_id: number }>('SELECT attempt_id FROM dispute WHERE id = ?')
        .get(id);
      // A regraded duel or exam answer changes its round's result (§8.4).
      if (approve && a) competition.resettleAttempts([a.attempt_id], c.now);
      return result;
    });
    this.on('POST', '/api/reports/:id/decision', (c) => {
      const action = c.body.action;
      if (action !== 'reject' && action !== 'fixed') throw new AttemptError(400, 'action');
      return review.decideReport(num(c.params.id), action, c.now);
    });
    this.on('POST', '/api/frames/:id', (c) => {
      const status = c.body.status;
      if (status !== 'approved' && status !== 'rejected') throw new AttemptError(400, 'status');
      const frame = (c.body.frame ?? null) as {
        objects: string[];
        preps?: { prep: string; case: string }[];
      } | null;
      return review.decideFrame(c.userId, num(c.params.id), status, frame, c.now);
    });

    // Duel and exam -----------------------------------------------------------------------------
    for (const kind of ['duel', 'exam'] as const) {
      this.on('GET', `/api/${kind}`, (c) => {
        const round = this.currentRound(kind, c.now);
        const other = competition.other(c.userId);
        if (!round || round.items.length === 0 || !other) return { status: 'none' };
        return rounds.view(kind, round, c.userId, other.id, c.now);
      });
      this.on('POST', `/api/${kind}/answer`, (c) => {
        const round = this.currentRound(kind, c.now);
        if (!round || round.items.length === 0) throw new AttemptError(404, `no ${kind} to play`);
        const b = c.body;
        return rounds.answer(
          kind,
          round,
          c.userId,
          {
            index: num(b.index),
            answer: str(b.answer, 500),
            latencyMs: Math.max(0, num(b.latencyMs)),
            ...(b.tappedIndex !== undefined ? { tappedIndex: num(b.tappedIndex) } : {}),
            ...(b.sentenceId !== undefined ? { sentenceId: num(b.sentenceId) } : {}),
          },
          c.now,
        );
      });
    }

    this.on('GET', '/api/home', (c) => {
      const other = competition.other(c.userId);
      const status = (kind: RoundKind) => {
        const round = this.currentRound(kind, c.now);
        if (!round || round.items.length === 0 || !other) return null;
        const v = rounds.view(kind, round, c.userId, other.id, c.now);
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
        duel: status('duel'),
        exam: status('exam'),
        coop: competition.coopLive(c.now),
        balanceEur: rewards.konto().balanceEur,
        vouchers: {
          toDo: vouchers.filter(
            (v) =>
              (v.status === 'open' && v.loserId === c.userId) ||
              (v.status === 'choose' && v.winnerId === c.userId) ||
              (v.status === 'done' && v.winnerId === c.userId),
          ).length,
          overdue: vouchers.filter((v) => v.overdue).length,
          open: vouchers.length,
        },
        week: overview.liveWeek,
        stars: overview.stars,
        starsPerVoucher: overview.starsPerVoucher,
      };
    });
    this.on('GET', '/api/wettbewerb', (c) => competition.overview(c.now));

    // Chore vouchers ----------------------------------------------------------------------------
    this.on('GET', '/api/vouchers', (c) => ({
      vouchers: chores.list(c.now),
      chores: chores.chores(),
    }));
    this.on('POST', '/api/vouchers/:id/choose', (c) => {
      chores.choose(c.userId, num(c.params.id), num(c.body.choreId), c.now);
      return { ok: true };
    });
    this.on('POST', '/api/vouchers/:id/done', (c) => {
      chores.done(c.userId, num(c.params.id), c.now);
      return { ok: true };
    });
    this.on('POST', '/api/vouchers/:id/confirm', (c) => {
      chores.confirm(c.userId, num(c.params.id), c.now);
      return { ok: true };
    });
    const chore = (b: Body) => {
      const size = b.size;
      if (size !== 'S' && size !== 'M' && size !== 'L') throw new AttemptError(400, 'size');
      const sized: Size = size;
      return {
        size: sized,
        titleDe: str(b.titleDe, 200),
        sentenceDe: str(b.sentenceDe, 300),
        titleEn: str(b.titleEn, 200),
        noun: typeof b.noun === 'string' && b.noun ? b.noun : null,
        verb: typeof b.verb === 'string' && b.verb ? b.verb : null,
        active: b.active !== false,
      };
    };
    this.on('POST', '/api/chores', (c) => ({ id: chores.saveChore(null, chore(c.body)) }));
    this.on('PUT', '/api/chores/:id', (c) => ({
      id: chores.saveChore(num(c.params.id), chore(c.body)),
    }));

    // Wochenziel and rewards -------------------------------------------------------------------
    this.on('GET', '/api/wochenziel', (c) => ({
      coop: competition.coopLive(c.now),
      ...rewards.konto(),
      bands: settings.get('REWARD_BANDS', c.now),
    }));
    this.on('POST', '/api/redemptions', (c) => {
      const ids = c.body.voucherIds;
      if (!Array.isArray(ids) || ids.length === 0) throw new AttemptError(400, 'voucherIds');
      const band = c.body.band === null || c.body.band === undefined ? null : num(c.body.band);
      return rewards.start(c.userId, ids.map(num), band, c.now);
    });
    this.on('POST', '/api/redemptions/:id/confirm', (c) => {
      rewards.confirm(c.userId, num(c.params.id), c.now);
      return { ok: true };
    });
    this.on('POST', '/api/redemptions/:id/reroll', (c) =>
      rewards.reroll(c.userId, num(c.params.id), c.now),
    );
    this.on('POST', '/api/redemptions/:id/undo', (c) =>
      rewards.undo(c.userId, num(c.params.id), c.now),
    );
    this.on('POST', '/api/redemptions/:id/plan', (c) => {
      const date = str(c.body.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new AttemptError(400, 'date');
      rewards.plan(c.userId, num(c.params.id), date, c.now);
      return { ok: true };
    });
    this.on('POST', '/api/redemptions/:id/done', (c) => {
      rewards.done(c.userId, num(c.params.id), str(c.body.note ?? '', 1000), c.now);
      return { ok: true };
    });
    this.on('GET', '/api/rewards', () => ({ rewards: rewards.rewards() }));
    this.on('POST', '/api/rewards', (c) => {
      const b = c.body;
      const kind = b.kind === 'buy' ? 'buy' : 'together';
      const input: RewardInput = {
        budgetEur: num(b.budgetEur),
        kind,
        titleDe: str(b.titleDe, 200),
        titleEn: str(b.titleEn, 200),
        missionDe: str(b.missionDe ?? '', 300),
        season: b.season === 'outdoor' ? 'outdoor' : 'any',
        needsBabysitter: b.needsBabysitter === true,
        estCostNote: str(b.estCostNote ?? '', 100),
      };
      if (!input.titleDe.trim() || !input.titleEn.trim()) throw new AttemptError(400, 'title');
      return rewards.propose(c.userId, input, c.now);
    });
    this.on('POST', '/api/rewards/:id/decision', (c) => {
      rewards.decide(c.userId, num(c.params.id), bool(c.body.approve));
      return { ok: true };
    });
    this.on('POST', '/api/rewards/:id/active', (c) => {
      rewards.setActive(num(c.params.id), bool(c.body.active));
      return { ok: true };
    });

    // Settings ---------------------------------------------------------------------------------
    const isKey = (k: string | undefined): k is SettingKey =>
      k !== undefined && Object.hasOwn(DEFAULTS, k);
    this.on('GET', '/api/settings', (c) => ({ settings: settings.overview(c.now) }));
    this.on('POST', '/api/settings/:key', (c) => {
      const key = c.params.key;
      if (!isKey(key)) throw new AttemptError(404, 'unknown setting');
      if (key === 'BABYSITTER_AVAILABLE') settings.setNow(c.userId, key, c.body.value, c.now);
      else settings.propose(c.userId, key, c.body.value, c.now);
      return { ok: true };
    });
    this.on('POST', '/api/settings/:key/decision', (c) => {
      const key = c.params.key;
      if (!isKey(key)) throw new AttemptError(404, 'unknown setting');
      return settings.decide(c.userId, key, bool(c.body.approve), c.now);
    });
  }
}
