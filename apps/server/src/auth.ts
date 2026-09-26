/**
 * Two users seeded from env, argon2 password hashes, httpOnly session cookies,
 * rate-limited login (spec §3).
 */
import { createHash, randomBytes } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import { OPS } from '@wortduell/core';
import type { Db } from './db';

export const SESSION_COOKIE = 'wd_session';

export interface SeedUser {
  name: string;
  passwordHash: string;
  uiLang?: string;
}

/** USER1_NAME / USER1_PASSWORD_HASH, USER2_… (spec §3). There is no registration. */
export function usersFromEnv(env: NodeJS.ProcessEnv): SeedUser[] {
  const out: SeedUser[] = [];
  for (const n of [1, 2]) {
    const name = env[`USER${n}_NAME`];
    const hash = env[`USER${n}_PASSWORD_HASH`];
    if (name && hash)
      out.push({ name, passwordHash: hash, uiLang: env[`USER${n}_UI_LANG`] ?? 'de' });
  }
  return out;
}

export function seedUsers(db: Db, users: SeedUser[]): void {
  const upsert = db.prepare(
    `INSERT INTO user (name, pw_hash, ui_lang) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET pw_hash = excluded.pw_hash`,
  );
  for (const u of users) upsert.run(u.name, u.passwordHash, u.uiLang ?? 'de');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Fixed-window limiter on failed logins per user name and per address. */
export class LoginLimiter {
  private failures = new Map<string, number[]>();

  blocked(keys: string[], now: Date): boolean {
    return keys.some((k) => this.recent(k, now).length >= OPS.LOGIN_MAX_ATTEMPTS);
  }

  fail(keys: string[], now: Date): void {
    for (const k of keys) this.failures.set(k, [...this.recent(k, now), now.getTime()]);
  }

  clear(keys: string[]): void {
    for (const k of keys) this.failures.delete(k);
  }

  private recent(key: string, now: Date): number[] {
    return (this.failures.get(key) ?? []).filter((t) => now.getTime() - t < OPS.LOGIN_WINDOW_MS);
  }
}

export async function login(
  db: Db,
  name: string,
  password: string,
  now: Date,
): Promise<{ token: string; userId: number; expires: Date } | null> {
  const user = db
    .prepare<[string], { id: number; pw_hash: string }>(
      'SELECT id, pw_hash FROM user WHERE name = ?',
    )
    .get(name);
  if (!user || !(await verify(user.pw_hash, password))) return null;
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(now.getTime() + OPS.SESSION_TTL_MS);
  db.prepare(
    'INSERT INTO auth_session (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), user.id, now.toISOString(), expires.toISOString());
  return { token, userId: user.id, expires };
}

export function sessionUser(
  db: Db,
  token: string | undefined,
  now: Date,
): { id: number; name: string; uiLang: string } | null {
  if (!token) return null;
  const row = db
    .prepare<[string, string], { id: number; name: string; ui_lang: string }>(
      `SELECT user.id, user.name, user.ui_lang FROM auth_session
       JOIN user ON user.id = auth_session.user_id
       WHERE token_hash = ? AND expires_at > ?`,
    )
    .get(tokenHash(token), now.toISOString());
  return row ? { id: row.id, name: row.name, uiLang: row.ui_lang } : null;
}

export function logout(db: Db, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM auth_session WHERE token_hash = ?').run(tokenHash(token));
}
