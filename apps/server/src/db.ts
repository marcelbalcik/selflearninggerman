import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Open the database and apply pending migrations (plain SQL files, in order). */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TEXT)');
  const done = new Set(
    db
      .prepare<[], { name: string }>('SELECT name FROM schema_migration')
      .all()
      .map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migration VALUES (?, datetime())').run(file);
    })();
    applied.push(file);
  }
  return applied;
}

/** Parse a JSON column. */
export function json<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}
