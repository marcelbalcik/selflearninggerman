/**
 * The slice of a synchronous SQLite API the engine uses. better-sqlite3 (tests,
 * build scripts) satisfies it as is; the browser wraps sql.js to match
 * (apps/web/src/runtime/sqljs.ts).
 */
import { MIGRATIONS } from './migrations';

export type BindValue = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement<P extends unknown[] = unknown[], R = unknown> {
  get(...params: P): R | undefined;
  all(...params: P): R[];
  run(...params: P): RunResult;
}

export interface Db {
  prepare<P extends unknown[] = unknown[], R = unknown>(sql: string): Statement<P, R>;
  exec(sql: string): unknown;
  transaction<A extends unknown[], T>(fn: (...args: A) => T): (...args: A) => T;
}

/** Apply pending migrations in order. */
export function migrate(db: Db): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY)');
  const done = new Set(
    db
      .prepare<[], { name: string }>('SELECT name FROM schema_migration')
      .all()
      .map((r) => r.name),
  );
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migration VALUES (?)').run(m.name);
    })();
    applied.push(m.name);
  }
  return applied;
}

/** Parse a JSON column. */
export function json<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}
