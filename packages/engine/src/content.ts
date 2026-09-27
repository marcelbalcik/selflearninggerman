/**
 * Content import: copy the pipeline's content.sqlite into a freshly migrated
 * database. User data is never stored here; it is rebuilt by replaying the
 * action log on top (src/log.ts), so a new content version simply means a new
 * base database.
 */
import type { Db } from './db';

const TABLES = ['lemma', 'noun', 'verb', 'sentence', 'gender_rule', 'lemma_form', 'catalog_word'];

export interface ImportResult {
  version: string | null;
  counts: Record<string, number>;
}

function columns(db: Db, table: string): string[] {
  return db
    .prepare<[string], { name: string }>('SELECT name FROM pragma_table_info(?)')
    .all(table)
    .map((c) => c.name);
}

export function importContent(db: Db, content: Db): ImportResult {
  const counts: Record<string, number> = {};
  db.transaction(() => {
    for (const table of TABLES) {
      const cols = columns(content, table);
      if (cols.length === 0) continue;
      const list = cols.join(', ');
      const insert = db.prepare(
        `INSERT INTO ${table} (${list}) VALUES (${cols.map(() => '?').join(', ')})`,
      );
      const rows = content
        .prepare<[], Record<string, unknown>>(`SELECT ${list} FROM ${table}`)
        .all();
      for (const row of rows) insert.run(...cols.map((c) => row[c]));
      counts[table] = rows.length;
    }
    db.exec('DELETE FROM content_meta');
    const meta = content
      .prepare<[], { key: string; value: string }>('SELECT key, value FROM meta')
      .all();
    const put = db.prepare('INSERT INTO content_meta (key, value) VALUES (?, ?)');
    for (const m of meta) put.run(m.key, m.value);
  })();
  const version =
    db
      .prepare<[], { value: string }>(
        "SELECT value FROM content_meta WHERE key = 'content_version'",
      )
      .get()?.value ?? null;
  return { version, counts };
}
