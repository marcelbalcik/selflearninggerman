/**
 * Reward vouchers and redemptions (spec §9.5): banked vouchers are combined,
 * the other user confirms with "Einlösen", one reward is drawn at the chosen
 * band (falling back to a lower band, the change goes back into the
 * Gutschein-Konto), one reroll if both tap "Neu würfeln", and both together
 * can undo until the redemption is planned. Rewards are proposed by one user
 * and enter the pool once the other approves.
 */
import { dayKey, defaultBand, drawReward } from '@wortduell/core';
import type { RewardCandidate } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { AttemptError } from './attempts';
import type { Settings } from './settings';

interface RedemptionRow {
  id: number;
  voucher_ids: string;
  total_eur: number;
  band_eur: number;
  drawn_band_eur: number | null;
  change_voucher_id: number | null;
  reward_id: number | null;
  rng_seed: number;
  rerolls_used: number;
  reroll_requests: string;
  undo_requests: string;
  prev_drawn_at: string | null;
  started_by: number;
  confirmed_by: number | null;
  status: string;
  planned_for: string | null;
  note: string | null;
  created_at: string;
}

interface RewardRow {
  id: number;
  budget_eur: number;
  kind: string;
  title_de: string;
  title_en: string;
  german_mission_de: string;
  season: 'any' | 'outdoor';
  needs_babysitter: number;
  est_cost_note: string;
  active: number;
  last_drawn_at: string | null;
  proposed_by: number | null;
  approved_by: number | null;
}

export interface RewardInput {
  budgetEur: number;
  kind: 'together' | 'buy';
  titleDe: string;
  titleEn: string;
  missionDe: string;
  season: 'any' | 'outdoor';
  needsBabysitter: boolean;
  estCostNote: string;
}

const REROLLS = 1;

export class Rewards {
  constructor(
    private readonly db: Db,
    private readonly settings: Settings,
    /** Seed source for draws (crypto in production, fixed in tests). */
    private readonly seed: () => number,
  ) {}

  private redemption(id: number): RedemptionRow {
    const r = this.db
      .prepare<[number], RedemptionRow>('SELECT * FROM redemption WHERE id = ?')
      .get(id);
    if (!r) throw new AttemptError(404, 'redemption not found');
    return r;
  }

  private userCount(): number {
    return this.db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM user').get()?.n ?? 0;
  }

  /** Step 1: one user selects banked vouchers and a band. */
  start(userId: number, voucherIds: number[], band: number | null, now: Date): { id: number } {
    const ids = [...new Set(voucherIds)];
    if (ids.length === 0) throw new AttemptError(400, 'select at least one voucher');
    const marks = ids.map(() => '?').join(', ');
    const vouchers = this.db
      .prepare<number[], { id: number; value_eur: number }>(
        `SELECT id, value_eur FROM reward_voucher WHERE id IN (${marks}) AND status = 'banked' AND redemption_id IS NULL`,
      )
      .all(...ids);
    if (vouchers.length !== ids.length) throw new AttemptError(409, 'voucher not available');
    const total = vouchers.reduce((s, v) => s + v.value_eur, 0);
    const bands = this.settings.get('REWARD_BANDS', now);
    const chosen = band ?? defaultBand(total, bands);
    if (chosen === null || !bands.includes(chosen) || chosen > total)
      throw new AttemptError(400, 'no band fits these vouchers');
    return this.db.transaction(() => {
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO redemption (voucher_ids, total_eur, band_eur, rng_seed, started_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
          )
          .run(
            JSON.stringify(ids),
            total,
            chosen,
            this.seed(),
            userId,
            now.toISOString(),
            now.toISOString(),
          ).lastInsertRowid,
      );
      this.db
        .prepare(`UPDATE reward_voucher SET redemption_id = ? WHERE id IN (${marks})`)
        .run(id, ...ids);
      return { id };
    })();
  }

  private candidates(): RewardCandidate[] {
    return this.db
      .prepare<[], RewardRow>('SELECT * FROM reward WHERE active = 1')
      .all()
      .map((r) => ({
        id: r.id,
        budgetEur: r.budget_eur,
        season: r.season,
        needsBabysitter: r.needs_babysitter === 1,
        lastDrawnAt: r.last_drawn_at,
      }));
  }

  private drawOptions(now: Date, excludeIds: number[] = []) {
    return {
      now,
      month: Number(dayKey(now).slice(5, 7)),
      babysitterAvailable: this.settings.get('BABYSITTER_AVAILABLE', now),
      excludeIds,
    };
  }

  /** Step 2: the other user confirms ("Einlösen"); the draw happens now. */
  confirm(userId: number, id: number, now: Date): void {
    const r = this.redemption(id);
    if (r.status !== 'pending') throw new AttemptError(409, 'not pending');
    if (r.started_by === userId && this.userCount() > 1)
      throw new AttemptError(403, 'the other user confirms');
    const bands = this.settings.get('REWARD_BANDS', now);
    const draw = drawReward(
      this.candidates(),
      r.total_eur,
      r.band_eur,
      r.rng_seed,
      this.drawOptions(now),
      bands,
    );
    if (!draw) throw new AttemptError(409, 'no reward available at or below this band');
    this.db.transaction(() => {
      const ids = json<number[]>(r.voucher_ids) ?? [];
      const marks = ids.map(() => '?').join(', ');
      this.db
        .prepare(`UPDATE reward_voucher SET status = 'spent' WHERE id IN (${marks})`)
        .run(...ids);
      let changeId: number | null = null;
      if (draw.change > 0) {
        changeId = Number(
          this.db
            .prepare(
              "INSERT INTO reward_voucher (value_eur, source, status, change_of, created_at) VALUES (?, 'change', 'banked', ?, ?)",
            )
            .run(draw.change, id, now.toISOString()).lastInsertRowid,
        );
      }
      const prev = this.db
        .prepare<[number], { last_drawn_at: string | null }>(
          'SELECT last_drawn_at FROM reward WHERE id = ?',
        )
        .get(draw.rewardId);
      this.db
        .prepare('UPDATE reward SET last_drawn_at = ? WHERE id = ?')
        .run(now.toISOString(), draw.rewardId);
      this.db
        .prepare(
          `UPDATE redemption SET status = 'drawn', confirmed_by = ?, reward_id = ?, drawn_band_eur = ?,
             change_voucher_id = ?, prev_drawn_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          userId,
          draw.rewardId,
          draw.band,
          changeId,
          prev?.last_drawn_at ?? null,
          now.toISOString(),
          id,
        );
    })();
  }

  /** "Neu würfeln": once per redemption, and only when both users asked. */
  reroll(userId: number, id: number, now: Date): { rerolled: boolean } {
    const r = this.redemption(id);
    if (r.status !== 'drawn') throw new AttemptError(409, 'nothing to reroll');
    if (r.rerolls_used >= REROLLS) throw new AttemptError(409, 'reroll already used');
    const requests = new Set(json<number[]>(r.reroll_requests) ?? []);
    requests.add(userId);
    if (requests.size < Math.min(2, this.userCount())) {
      this.db
        .prepare('UPDATE redemption SET reroll_requests = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify([...requests]), now.toISOString(), id);
      return { rerolled: false };
    }
    const band = r.drawn_band_eur as number;
    // Same band, another reward; the change stays as it is.
    const draw = drawReward(
      this.candidates(),
      band,
      band,
      r.rng_seed + 1,
      this.drawOptions(now, [r.reward_id as number]),
      [band],
    );
    if (!draw) throw new AttemptError(409, 'no other reward at this band');
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE reward SET last_drawn_at = ? WHERE id = ?')
        .run(r.prev_drawn_at, r.reward_id);
      const prev = this.db
        .prepare<[number], { last_drawn_at: string | null }>(
          'SELECT last_drawn_at FROM reward WHERE id = ?',
        )
        .get(draw.rewardId);
      this.db
        .prepare('UPDATE reward SET last_drawn_at = ? WHERE id = ?')
        .run(now.toISOString(), draw.rewardId);
      this.db
        .prepare(
          `UPDATE redemption SET reward_id = ?, prev_drawn_at = ?, rerolls_used = rerolls_used + 1,
             reroll_requests = '[]', updated_at = ? WHERE id = ?`,
        )
        .run(draw.rewardId, prev?.last_drawn_at ?? null, now.toISOString(), id);
    })();
    return { rerolled: true };
  }

  plan(userId: number, id: number, date: string, now: Date): void {
    const r = this.redemption(id);
    if (r.status !== 'drawn' && r.status !== 'planned') throw new AttemptError(409, 'not drawn');
    void userId;
    this.db
      .prepare(
        "UPDATE redemption SET status = 'planned', planned_for = ?, updated_at = ? WHERE id = ?",
      )
      .run(date, now.toISOString(), id);
  }

  done(userId: number, id: number, note: string, now: Date): void {
    const r = this.redemption(id);
    if (r.status !== 'planned') throw new AttemptError(409, 'plan it first');
    void userId;
    this.db
      .prepare("UPDATE redemption SET status = 'done', note = ?, updated_at = ? WHERE id = ?")
      .run(note, now.toISOString(), id);
  }

  /**
   * Undo (both users, until planned): the vouchers go back to the bank and
   * the change voucher disappears. The starter can withdraw a pending
   * redemption alone, since nothing was drawn yet.
   */
  undo(userId: number, id: number, now: Date): { undone: boolean } {
    const r = this.redemption(id);
    if (r.status !== 'pending' && r.status !== 'drawn')
      throw new AttemptError(409, 'too late to undo');
    const requests = new Set(json<number[]>(r.undo_requests) ?? []);
    requests.add(userId);
    const alone = r.status === 'pending' && userId === r.started_by;
    if (!alone && requests.size < Math.min(2, this.userCount())) {
      this.db
        .prepare('UPDATE redemption SET undo_requests = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify([...requests]), now.toISOString(), id);
      return { undone: false };
    }
    this.db.transaction(() => {
      if (r.change_voucher_id !== null) {
        const change = this.db
          .prepare<[number], { status: string; redemption_id: number | null }>(
            'SELECT status, redemption_id FROM reward_voucher WHERE id = ?',
          )
          .get(r.change_voucher_id);
        if (change && (change.status !== 'banked' || change.redemption_id !== null))
          throw new AttemptError(409, 'the change voucher is already in use');
        this.db.prepare('DELETE FROM reward_voucher WHERE id = ?').run(r.change_voucher_id);
      }
      const ids = json<number[]>(r.voucher_ids) ?? [];
      const marks = ids.map(() => '?').join(', ');
      this.db
        .prepare(
          `UPDATE reward_voucher SET status = 'banked', redemption_id = NULL WHERE id IN (${marks})`,
        )
        .run(...ids);
      if (r.reward_id !== null)
        this.db
          .prepare('UPDATE reward SET last_drawn_at = ? WHERE id = ?')
          .run(r.prev_drawn_at, r.reward_id);
      this.db
        .prepare(
          `UPDATE redemption SET status = 'undone', change_voucher_id = NULL, undo_requests = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify([...requests]), now.toISOString(), id);
    })();
    return { undone: true };
  }

  // Catalog ---------------------------------------------------------------------

  propose(userId: number, r: RewardInput, now: Date): { id: number } {
    const bands = this.settings.get('REWARD_BANDS', now);
    if (!bands.includes(r.budgetEur)) throw new AttemptError(400, 'budget must be a reward band');
    const info = this.db
      .prepare(
        `INSERT INTO reward (budget_eur, kind, title_de, title_en, german_mission_de, season, needs_babysitter,
           est_cost_note, active, proposed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        r.budgetEur,
        r.kind,
        r.titleDe,
        r.titleEn,
        r.missionDe,
        r.season,
        r.needsBabysitter ? 1 : 0,
        r.estCostNote,
        userId,
        now.toISOString(),
      );
    return { id: Number(info.lastInsertRowid) };
  }

  /** The other user approves a proposal (it enters the pool) or rejects it (deleted). */
  decide(userId: number, id: number, approve: boolean): void {
    const r = this.db.prepare<[number], RewardRow>('SELECT * FROM reward WHERE id = ?').get(id);
    if (!r || r.proposed_by === null || r.approved_by !== null)
      throw new AttemptError(404, 'no open proposal');
    if (r.proposed_by === userId) throw new AttemptError(403, 'the other user approves');
    if (approve)
      this.db.prepare('UPDATE reward SET active = 1, approved_by = ? WHERE id = ?').run(userId, id);
    else this.db.prepare('DELETE FROM reward WHERE id = ?').run(id);
  }

  /** Take an approved reward out of the pool or back in. */
  setActive(id: number, active: boolean): void {
    const r = this.db.prepare<[number], RewardRow>('SELECT * FROM reward WHERE id = ?').get(id);
    if (!r || (r.proposed_by !== null && r.approved_by === null))
      throw new AttemptError(404, 'reward not found');
    this.db.prepare('UPDATE reward SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  }

  rewards() {
    return this.db
      .prepare<[], RewardRow>('SELECT * FROM reward ORDER BY budget_eur, id')
      .all()
      .map((r) => this.rewardView(r));
  }

  private rewardView(r: RewardRow) {
    return {
      id: r.id,
      budgetEur: r.budget_eur,
      kind: r.kind,
      titleDe: r.title_de,
      titleEn: r.title_en,
      missionDe: r.german_mission_de,
      season: r.season,
      needsBabysitter: r.needs_babysitter === 1,
      estCostNote: r.est_cost_note,
      active: r.active === 1,
      proposedBy: r.proposed_by,
      pending: r.proposed_by !== null && r.approved_by === null,
      lastDrawnAt: r.last_drawn_at,
    };
  }

  /** The Gutschein-Konto and the redemption history. */
  konto() {
    const vouchers = this.db
      .prepare<
        [],
        {
          id: number;
          value_eur: number;
          source: string;
          week_key: string | null;
          redemption_id: number | null;
          created_at: string;
        }
      >(
        "SELECT id, value_eur, source, week_key, redemption_id, created_at FROM reward_voucher WHERE status = 'banked' ORDER BY id",
      )
      .all()
      .map((v) => ({
        id: v.id,
        valueEur: v.value_eur,
        source: v.source,
        weekKey: v.week_key,
        reserved: v.redemption_id !== null,
        createdAt: v.created_at,
      }));
    const redemptions = this.db
      .prepare<[], RedemptionRow>('SELECT * FROM redemption ORDER BY id DESC LIMIT 30')
      .all()
      .map((r) => {
        const reward = r.reward_id
          ? this.db
              .prepare<[number], RewardRow>('SELECT * FROM reward WHERE id = ?')
              .get(r.reward_id)
          : undefined;
        const change = r.change_voucher_id
          ? this.db
              .prepare<[number], { value_eur: number }>(
                'SELECT value_eur FROM reward_voucher WHERE id = ?',
              )
              .get(r.change_voucher_id)
          : undefined;
        return {
          id: r.id,
          status: r.status,
          totalEur: r.total_eur,
          bandEur: r.band_eur,
          drawnBandEur: r.drawn_band_eur,
          changeEur: change?.value_eur ?? 0,
          startedBy: r.started_by,
          rerollsLeft: REROLLS - r.rerolls_used,
          rerollRequests: json<number[]>(r.reroll_requests) ?? [],
          undoRequests: json<number[]>(r.undo_requests) ?? [],
          plannedFor: r.planned_for,
          note: r.note,
          createdAt: r.created_at,
          reward: reward ? this.rewardView(reward) : null,
        };
      });
    return {
      balanceEur: vouchers.filter((v) => !v.reserved).reduce((s, v) => s + v.valueEur, 0),
      vouchers,
      redemptions,
    };
  }
}
