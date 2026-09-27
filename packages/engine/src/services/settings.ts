/**
 * Settings that need both users (spec §10): one user proposes, the other
 * approves, and the value takes effect at the next day boundary. The
 * babysitter switch (reward draw exclusions) is a plain shared setting.
 */
import { COOP, DUEL, SESSION, addDays, dayKey, dayStart } from '@wortduell/core';
import type { CoopTier, DuelMode } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { AttemptError } from './attempts';

export interface SettingValues {
  NEW_PER_DAY: number;
  DUEL_MODE: DuelMode;
  STARS_PER_S_VOUCHER: number;
  COOP_TIERS: CoopTier[];
  REWARD_BANDS: number[];
  BABYSITTER_AVAILABLE: boolean;
}
export type SettingKey = keyof SettingValues;

export const DUAL_APPROVAL: SettingKey[] = [
  'NEW_PER_DAY',
  'DUEL_MODE',
  'STARS_PER_S_VOUCHER',
  'COOP_TIERS',
  'REWARD_BANDS',
];

export const DEFAULTS: SettingValues = {
  NEW_PER_DAY: SESSION.NEW_PER_DAY,
  DUEL_MODE: DUEL.MODE,
  STARS_PER_S_VOUCHER: DUEL.STARS_PER_S_VOUCHER,
  COOP_TIERS: COOP.TIERS.map((t) => ({ ...t })),
  REWARD_BANDS: [...COOP.REWARD_BANDS],
  BABYSITTER_AVAILABLE: true,
};

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Validate a proposed value; throws a 400 on nonsense. */
export function validateSetting<K extends SettingKey>(key: K, value: unknown): SettingValues[K] {
  const ok = (() => {
    switch (key) {
      case 'NEW_PER_DAY':
        return isInt(value, 0, 30);
      case 'STARS_PER_S_VOUCHER':
        return isInt(value, 1, 20);
      case 'DUEL_MODE':
        return value === 'raw' || value === 'vs_expected';
      case 'BABYSITTER_AVAILABLE':
        return typeof value === 'boolean';
      case 'REWARD_BANDS':
        return (
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((b, i) => isInt(b, 1, 1000) && (i === 0 || b > (value[i - 1] as number)))
        );
      case 'COOP_TIERS':
        return (
          Array.isArray(value) &&
          value.length > 0 &&
          value.every(
            (t: unknown) =>
              typeof t === 'object' &&
              t !== null &&
              isInt((t as CoopTier).valueEur, 1, COOP.MAX_WEEKLY_VOUCHER_EUR) &&
              isInt((t as CoopTier).minActiveDays, 0, 7) &&
              isInt((t as CoopTier).minKomposition, 0, 7),
          )
        );
      default:
        return false;
    }
  })();
  if (!ok) throw new AttemptError(400, `invalid value for ${key}`);
  return value as SettingValues[K];
}

export class Settings {
  constructor(private readonly db: Db) {}

  /** The value in effect at an instant. */
  get<K extends SettingKey>(key: K, at: Date): SettingValues[K] {
    const row = this.db
      .prepare<[string, string], { value: string }>(
        'SELECT value FROM setting_value WHERE key = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      )
      .get(key, at.toISOString());
    return row ? (json<SettingValues[K]>(row.value) as SettingValues[K]) : DEFAULTS[key];
  }

  propose(userId: number, key: SettingKey, value: unknown, now: Date): void {
    if (!DUAL_APPROVAL.includes(key)) throw new AttemptError(400, 'not a dual-approval setting');
    const v = validateSetting(key, value);
    this.db
      .prepare(
        `INSERT INTO setting (key, pending_value, proposed_by, proposed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET pending_value = excluded.pending_value,
           proposed_by = excluded.proposed_by, proposed_at = excluded.proposed_at`,
      )
      .run(key, JSON.stringify(v), userId, now.toISOString());
  }

  /** The other user approves (effective at the next day boundary) or rejects. */
  decide(
    userId: number,
    key: SettingKey,
    approve: boolean,
    now: Date,
  ): { effectiveFrom: string | null } {
    const p = this.db
      .prepare<[string], { pending_value: string; proposed_by: number }>(
        'SELECT pending_value, proposed_by FROM setting WHERE key = ?',
      )
      .get(key);
    if (!p) throw new AttemptError(404, 'no pending change');
    if (p.proposed_by === userId) throw new AttemptError(403, 'the other user approves a change');
    const effectiveFrom = dayStart(addDays(dayKey(now), 1)).toISOString();
    this.db.transaction(() => {
      if (approve) {
        this.db
          .prepare(
            `INSERT INTO setting_value (key, value, effective_from, proposed_by, approved_by) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(key, effective_from) DO UPDATE SET value = excluded.value,
               proposed_by = excluded.proposed_by, approved_by = excluded.approved_by`,
          )
          .run(key, p.pending_value, effectiveFrom, p.proposed_by, userId);
      }
      this.db.prepare('DELETE FROM setting WHERE key = ?').run(key);
    })();
    return { effectiveFrom: approve ? effectiveFrom : null };
  }

  /** Shared switches without approval (babysitter availability). */
  setNow(userId: number, key: 'BABYSITTER_AVAILABLE', value: unknown, now: Date): void {
    const v = validateSetting(key, value);
    this.db
      .prepare(
        `INSERT INTO setting_value (key, value, effective_from, proposed_by, approved_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key, effective_from) DO UPDATE SET value = excluded.value`,
      )
      .run(key, JSON.stringify(v), now.toISOString(), userId, userId);
  }

  /** Current values, pending proposals and changes scheduled for the next boundary. */
  overview(now: Date): {
    key: SettingKey;
    value: unknown;
    dualApproval: boolean;
    pending: { value: unknown; proposedBy: number } | null;
    scheduled: { value: unknown; effectiveFrom: string } | null;
  }[] {
    return (Object.keys(DEFAULTS) as SettingKey[]).map((key) => {
      const p = this.db
        .prepare<[string], { pending_value: string; proposed_by: number }>(
          'SELECT pending_value, proposed_by FROM setting WHERE key = ?',
        )
        .get(key);
      const s = this.db
        .prepare<[string, string], { value: string; effective_from: string }>(
          'SELECT value, effective_from FROM setting_value WHERE key = ? AND effective_from > ? ORDER BY effective_from LIMIT 1',
        )
        .get(key, now.toISOString());
      return {
        key,
        value: this.get(key, now),
        dualApproval: DUAL_APPROVAL.includes(key),
        pending: p ? { value: json(p.pending_value), proposedBy: p.proposed_by } : null,
        scheduled: s ? { value: json(s.value), effectiveFrom: s.effective_from } : null,
      };
    });
  }
}
