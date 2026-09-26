/**
 * Content import (spec §11 "Server import"): on startup, when the committed
 * content.sqlite has a new content_version, upsert every content row by its
 * stable id. User data is never touched; lemmas and sentences missing from
 * the new version are retired rather than deleted, and a sentence someone
 * reported keeps its `reported` status.
 */
import { existsSync } from 'node:fs';
import type { Db } from './db';

const TABLES = ['lemma', 'noun', 'verb', 'sentence', 'audio', 'gender_rule'] as const;
/** Tables without a key: replaced wholesale. */
const REPLACED = ['lemma_form', 'catalog_word'] as const;

export interface ImportResult {
  imported: boolean;
  version: string | null;
  counts: Record<string, number>;
}

export function importContent(db: Db, contentPath: string): ImportResult {
  if (!existsSync(contentPath)) return { imported: false, version: null, counts: {} };
  db.prepare('ATTACH DATABASE ? AS content').run(contentPath);
  try {
    const next = db
      .prepare<[], { value: string }>(
        "SELECT value FROM content.meta WHERE key = 'content_version'",
      )
      .get()?.value;
    const current = db
      .prepare<[], { value: string }>(
        "SELECT value FROM content_meta WHERE key = 'content_version'",
      )
      .get()?.value;
    if (next === undefined || next === current) {
      return { imported: false, version: current ?? null, counts: {} };
    }
    const counts: Record<string, number> = {};
    db.transaction(() => {
      for (const table of TABLES) {
        const cols = db
          .prepare<[], { name: string }>(
            `SELECT name FROM pragma_table_info('${table}', 'content')`,
          )
          .all()
          .map((c) => c.name);
        const key = cols[0] as string;
        const list = cols.join(', ');
        const updates = cols
          .slice(1)
          .map((c) =>
            table === 'sentence' && c === 'status'
              ? `status = CASE WHEN main.sentence.status = 'reported' THEN 'reported' ELSE excluded.status END`
              : `${c} = excluded.${c}`,
          )
          .join(', ');
        const extra = table === 'lemma' || table === 'sentence' ? ', retired = 0' : '';
        const info = db
          .prepare(
            `INSERT INTO main.${table} (${list}) SELECT ${list} FROM content.${table} WHERE true
             ON CONFLICT(${key}) DO UPDATE SET ${updates}${extra}`,
          )
          .run();
        counts[table] = info.changes;
      }
      for (const table of REPLACED) {
        const exists = db
          .prepare<[string], { n: number }>(
            "SELECT COUNT(*) AS n FROM content.sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(table);
        if (!exists?.n) continue;
        db.exec(`DELETE FROM main.${table}`);
        counts[table] = db
          .prepare(`INSERT INTO main.${table} SELECT * FROM content.${table}`)
          .run().changes;
      }
      db.exec('UPDATE main.lemma SET retired = 1 WHERE id NOT IN (SELECT id FROM content.lemma)');
      db.exec(
        'UPDATE main.sentence SET retired = 1 WHERE id NOT IN (SELECT id FROM content.sentence)',
      );
      db.exec('DELETE FROM content_meta');
      db.exec('INSERT INTO content_meta SELECT key, value FROM content.meta');
    })();
    return { imported: true, version: next, counts };
  } finally {
    db.exec('DETACH DATABASE content');
  }
}
