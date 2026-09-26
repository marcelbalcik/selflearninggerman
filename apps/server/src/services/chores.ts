/**
 * Chore vouchers and duel stars (spec §9.4): settlement creates a voucher in
 * `choose`; the winner picks a chore of its size within 24 h (else the server
 * picks one); the loser marks it done; the winner confirms (else it
 * auto-confirms after 48 h). Stars turn into S vouchers every
 * STARS_PER_S_VOUCHER wins.
 */
import { CHORES, dayKey, displayTable, monthKey, seededRng } from '@wortduell/core';
import type { Declension, Gender, NounInput } from '@wortduell/core';
import { json } from '../db';
import type { Db } from '../db';
import { AttemptError } from './attempts';
import type { Settings } from './settings';

export type Size = 'S' | 'M' | 'L';

interface VoucherRow {
  id: number;
  kind: string;
  from_period: string;
  winner_id: number;
  loser_id: number;
  size: Size;
  chore_id: number | null;
  status: string;
  choose_by: string;
  deadline: string | null;
  done_at: string | null;
  confirmed_at: string | null;
  auto: string | null;
  created_at: string;
}

interface ChoreRow {
  id: number;
  size: Size;
  title_de: string;
  sentence_de: string;
  title_en: string;
  noun: string | null;
  verb: string | null;
  active: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class Chores {
  constructor(
    private readonly db: Db,
    private readonly settings: Settings,
  ) {}

  private voucher(id: number): VoucherRow {
    const v = this.db.prepare<[number], VoucherRow>('SELECT * FROM voucher WHERE id = ?').get(id);
    if (!v) throw new AttemptError(404, 'voucher not found');
    return v;
  }

  /** A new voucher in `choose` (idempotent per source period). */
  create(
    kind: string,
    fromPeriod: string,
    winner: number,
    loser: number,
    size: Size,
    at: Date,
  ): number {
    const existing = this.db
      .prepare<[string], { id: number }>(
        "SELECT id FROM voucher WHERE from_period = ? AND status != 'void'",
      )
      .get(fromPeriod);
    if (existing) return existing.id;
    const info = this.db
      .prepare(
        `INSERT INTO voucher (kind, from_period, winner_id, loser_id, size, status, choose_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'choose', ?, ?, ?)`,
      )
      .run(
        kind,
        fromPeriod,
        winner,
        loser,
        size,
        iso(at.getTime() + CHORES.CHOOSE_WINDOW_MS),
        at.toISOString(),
        at.toISOString(),
      );
    return Number(info.lastInsertRowid);
  }

  /** Void a voucher that nobody has worked on yet; returns false when it is too late. */
  voidIfOpen(id: number, at: Date): boolean {
    const v = this.voucher(id);
    if (v.status !== 'choose' && v.status !== 'open') return false;
    this.db
      .prepare("UPDATE voucher SET status = 'void', updated_at = ? WHERE id = ?")
      .run(at.toISOString(), id);
    this.db
      .prepare('UPDATE star SET consumed_by_voucher_id = NULL WHERE consumed_by_voucher_id = ?')
      .run(id);
    return true;
  }

  // Stars -----------------------------------------------------------------

  /** A duel win: one star, then S vouchers for every full set of stars. */
  awardStar(userId: number, loserId: number, periodKey: string, at: Date): void {
    this.db
      .prepare(
        `INSERT INTO star (user_id, period_key, created_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, period_key) DO UPDATE SET revoked = 0`,
      )
      .run(userId, periodKey, at.toISOString());
    this.issueStarVouchers(userId, loserId, at);
  }

  /** Re-settlement took a win away: revoke its star and any voucher it paid for, if still untouched. */
  revokeStar(userId: number, loserId: number, periodKey: string, at: Date): void {
    const star = this.db
      .prepare<[number, string], { id: number; consumed_by_voucher_id: number | null }>(
        'SELECT id, consumed_by_voucher_id FROM star WHERE user_id = ? AND period_key = ? AND revoked = 0',
      )
      .get(userId, periodKey);
    if (!star) return;
    if (star.consumed_by_voucher_id !== null) {
      // A chore already done stays done; the star stays spent.
      if (!this.voidIfOpen(star.consumed_by_voucher_id, at)) {
        this.db.prepare('UPDATE star SET revoked = 1 WHERE id = ?').run(star.id);
        return;
      }
    }
    this.db
      .prepare('UPDATE star SET revoked = 1, consumed_by_voucher_id = NULL WHERE id = ?')
      .run(star.id);
    this.issueStarVouchers(userId, loserId, at);
  }

  issueStarVouchers(userId: number, loserId: number, at: Date): void {
    const n = this.settings.get('STARS_PER_S_VOUCHER', at);
    for (;;) {
      const free = this.db
        .prepare<[number], { id: number; period_key: string }>(
          'SELECT id, period_key FROM star WHERE user_id = ? AND revoked = 0 AND consumed_by_voucher_id IS NULL ORDER BY period_key, id',
        )
        .all(userId);
      if (free.length < n) return;
      const used = free.slice(0, n);
      const last = used[used.length - 1] as { period_key: string };
      const id = this.create('day', `stars:${userId}:${last.period_key}`, userId, loserId, 'S', at);
      const marks = used.map(() => '?').join(', ');
      this.db
        .prepare(`UPDATE star SET consumed_by_voucher_id = ? WHERE id IN (${marks})`)
        .run(id, ...used.map((s) => s.id));
    }
  }

  stars(userId: number): { total: number; free: number } {
    const r = this.db
      .prepare<[number], { total: number; free: number }>(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN consumed_by_voucher_id IS NULL THEN 1 ELSE 0 END) AS free
         FROM star WHERE user_id = ? AND revoked = 0`,
      )
      .get(userId);
    return { total: r?.total ?? 0, free: r?.free ?? 0 };
  }

  // Voucher flow -------------------------------------------------------------

  choose(userId: number, id: number, choreId: number, now: Date): void {
    const v = this.voucher(id);
    if (v.winner_id !== userId) throw new AttemptError(403, 'the winner chooses the chore');
    if (v.status !== 'choose') throw new AttemptError(409, 'chore already chosen');
    const chore = this.db
      .prepare<[number], ChoreRow>('SELECT * FROM chore WHERE id = ? AND active = 1')
      .get(choreId);
    if (!chore || chore.size !== v.size)
      throw new AttemptError(400, 'pick an active chore of this size');
    this.open(v, chore.id, now, null);
  }

  private open(v: VoucherRow, choreId: number, at: Date, auto: string | null): void {
    this.db
      .prepare(
        "UPDATE voucher SET chore_id = ?, status = 'open', deadline = ?, auto = ?, updated_at = ? WHERE id = ?",
      )
      .run(choreId, iso(at.getTime() + CHORES.DEADLINE_MS[v.size]), auto, at.toISOString(), v.id);
  }

  done(userId: number, id: number, now: Date): void {
    const v = this.voucher(id);
    if (v.loser_id !== userId) throw new AttemptError(403, 'the loser marks the chore done');
    if (v.status !== 'open') throw new AttemptError(409, 'voucher is not open');
    this.db
      .prepare("UPDATE voucher SET status = 'done', done_at = ?, updated_at = ? WHERE id = ?")
      .run(now.toISOString(), now.toISOString(), id);
  }

  confirm(userId: number, id: number, now: Date): void {
    const v = this.voucher(id);
    if (v.winner_id !== userId) throw new AttemptError(403, 'the winner confirms');
    if (v.status !== 'done') throw new AttemptError(409, 'voucher is not done');
    this.db
      .prepare(
        "UPDATE voucher SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now.toISOString(), now.toISOString(), id);
  }

  /** Server-side timers: random pick after 24 h, auto-confirm 48 h after `done`. */
  timers(now: Date): void {
    const due = this.db
      .prepare<[string], VoucherRow>(
        "SELECT * FROM voucher WHERE status = 'choose' AND choose_by <= ? ORDER BY id",
      )
      .all(now.toISOString());
    for (const v of due) {
      const chores = this.db
        .prepare<[string], { id: number }>(
          'SELECT id FROM chore WHERE size = ? AND active = 1 ORDER BY id',
        )
        .all(v.size);
      if (chores.length === 0) continue;
      const pick = chores[Math.floor(seededRng(v.id)() * chores.length)] as { id: number };
      this.open(v, pick.id, new Date(v.choose_by), 'picked');
    }
    const confirmAfter = iso(now.getTime() - CHORES.AUTO_CONFIRM_MS);
    for (const v of this.db
      .prepare<[string], VoucherRow>("SELECT * FROM voucher WHERE status = 'done' AND done_at <= ?")
      .all(confirmAfter)) {
      const at = iso(new Date(v.done_at as string).getTime() + CHORES.AUTO_CONFIRM_MS);
      this.db
        .prepare(
          "UPDATE voucher SET status = 'confirmed', confirmed_at = ?, auto = 'confirmed', updated_at = ? WHERE id = ?",
        )
        .run(at, at, v.id);
    }
  }

  // Views -------------------------------------------------------------------

  /** Everything the Aufgaben screen shows; overdue vouchers are flagged (shown in red). */
  list(now: Date) {
    const rows = this.db
      .prepare<[], VoucherRow & { winner: string; loser: string }>(
        `SELECT v.*, w.name AS winner, l.name AS loser FROM voucher v
         JOIN user w ON w.id = v.winner_id JOIN user l ON l.id = v.loser_id
         WHERE v.status != 'void' ORDER BY v.id DESC LIMIT 100`,
      )
      .all();
    return rows.map((v) => ({
      id: v.id,
      kind: v.kind,
      fromPeriod: v.from_period,
      size: v.size,
      winnerId: v.winner_id,
      loserId: v.loser_id,
      winner: v.winner,
      loser: v.loser,
      status: v.status,
      chooseBy: v.choose_by,
      deadline: v.deadline,
      doneAt: v.done_at,
      auto: v.auto,
      overdue: v.status === 'open' && v.deadline !== null && v.deadline < now.toISOString(),
      createdAt: v.created_at,
      chore: v.chore_id === null ? null : this.choreView(v.chore_id),
    }));
  }

  chores() {
    return this.db
      .prepare<[], ChoreRow>('SELECT * FROM chore ORDER BY size, id')
      .all()
      .map((c) => ({ ...this.choreFields(c) }));
  }

  private choreView(id: number) {
    const c = this.db.prepare<[number], ChoreRow>('SELECT * FROM chore WHERE id = ?').get(id);
    return c ? this.choreFields(c) : null;
  }

  /** The chore sentence with the noun's declension strip and the separable split (spec §9.4). */
  private choreFields(c: ChoreRow) {
    return {
      id: c.id,
      size: c.size,
      titleDe: c.title_de,
      titleEn: c.title_en,
      sentenceDe: c.sentence_de,
      noun: c.noun,
      verb: c.verb,
      active: c.active === 1,
      nounForms: c.noun ? this.nounStrip(c.noun) : null,
      verbSplit: c.verb ? this.verbSplit(c.verb) : null,
    };
  }

  private word(text: string, pos: 'noun' | 'verb'): Record<string, unknown> | null {
    const w = this.db
      .prepare<[string, string], { data: string }>(
        'SELECT data FROM catalog_word WHERE text = ? AND pos = ?',
      )
      .get(text, pos);
    return w ? json<Record<string, unknown>>(w.data) : null;
  }

  private nounStrip(text: string) {
    const d = this.word(text, 'noun');
    if (!d) return null;
    const noun: NounInput = {
      lemma: text,
      gender: (d.gender as Gender | null) ?? null,
      altGenders: (d.alt_genders as Gender[] | undefined) ?? [],
      plural: (d.plural as string[] | undefined) ?? [],
      pluralOnly: d.plural_only === true,
      noPlural: d.no_plural === true,
      genSg: (d.gen_sg as string[] | undefined) ?? [],
      weak: d.weak === true,
      mixed: d.mixed === true,
      adjectival: d.adjectival === true,
      forms: (d.forms as Declension | null) ?? undefined,
    };
    return { gender: noun.gender, table: displayTable(noun) };
  }

  private verbSplit(text: string): string | null {
    const d = this.word(text, 'verb');
    if (!d) return null;
    const prefix = typeof d.prefix === 'string' ? d.prefix : null;
    if (d.separable !== true || !prefix || !text.startsWith(prefix)) return text;
    return `${prefix}|${text.slice(prefix.length)}`;
  }

  saveChore(
    id: number | null,
    c: {
      size: Size;
      titleDe: string;
      sentenceDe: string;
      titleEn: string;
      noun: string | null;
      verb: string | null;
      active: boolean;
    },
  ): number {
    if (id === null) {
      return Number(
        this.db
          .prepare(
            'INSERT INTO chore (size, title_de, sentence_de, title_en, noun, verb, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(c.size, c.titleDe, c.sentenceDe, c.titleEn, c.noun, c.verb, c.active ? 1 : 0)
          .lastInsertRowid,
      );
    }
    const info = this.db
      .prepare(
        'UPDATE chore SET size = ?, title_de = ?, sentence_de = ?, title_en = ?, noun = ?, verb = ?, active = ? WHERE id = ?',
      )
      .run(c.size, c.titleDe, c.sentenceDe, c.titleEn, c.noun, c.verb, c.active ? 1 : 0, id);
    if (info.changes === 0) throw new AttemptError(404, 'chore not found');
    return id;
  }

  /** Ledger: vouchers won and received per person per month (spec §9.4). */
  ledger() {
    const rows = this.db
      .prepare<[], { created_at: string; winner_id: number; loser_id: number; size: Size }>(
        "SELECT created_at, winner_id, loser_id, size FROM voucher WHERE status != 'void'",
      )
      .all();
    const out = new Map<
      string,
      Record<number, { won: Record<Size, number>; received: Record<Size, number> }>
    >();
    const blank = () => ({ S: 0, M: 0, L: 0 });
    for (const r of rows) {
      const month = monthKey(dayKey(new Date(r.created_at)));
      const m = out.get(month) ?? {};
      for (const [u, role] of [
        [r.winner_id, 'won'],
        [r.loser_id, 'received'],
      ] as const) {
        m[u] ??= { won: blank(), received: blank() };
        m[u][role][r.size] += 1;
      }
      out.set(month, m);
    }
    return [...out.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, users]) => ({ month, users }));
  }
}
