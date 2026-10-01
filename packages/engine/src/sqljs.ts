/**
 * The engine's Db interface on sql.js (SQLite compiled to WebAssembly), for
 * the browser. Transactions nest through savepoints, as in better-sqlite3.
 */
import type { Database, SqlJsStatic, SqlValue, Statement as SqlJsStatement } from 'sql.js';
import type { Db, RunResult, Statement } from './db';
import type { DbHost } from './log';

type Params = unknown[];

function bindable(params: Params): SqlValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'bigint') return Number(p);
    return p as SqlValue;
  });
}

export class SqlJsDb implements Db {
  private readonly cache = new Map<string, SqlJsStatement>();
  private depth = 0;

  constructor(readonly raw: Database) {}

  private stmt(sql: string): SqlJsStatement {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  prepare<P extends unknown[] = unknown[], R = unknown>(sql: string): Statement<P, R> {
    const all = (...params: P): R[] => {
      const s = this.stmt(sql);
      try {
        s.bind(bindable(params));
        const rows: R[] = [];
        while (s.step()) rows.push(s.getAsObject() as R);
        return rows;
      } finally {
        s.reset();
      }
    };
    return {
      all,
      get: (...params: P): R | undefined => {
        const s = this.stmt(sql);
        try {
          s.bind(bindable(params));
          return s.step() ? (s.getAsObject() as R) : undefined;
        } finally {
          s.reset();
        }
      },
      run: (...params: P): RunResult => {
        const s = this.stmt(sql);
        try {
          s.run(bindable(params));
        } finally {
          s.reset();
        }
        const changes = this.raw.getRowsModified();
        const raw = this.raw;
        return {
          changes,
          // Read on access (callers use it right away); saves a query per write.
          get lastInsertRowid(): number {
            const id = raw.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
            return typeof id === 'number' ? id : 0;
          },
        };
      },
    };
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction<A extends unknown[], T>(fn: (...args: A) => T): (...args: A) => T {
    return (...args: A): T => {
      const name = `sp${this.depth}`;
      this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
      this.depth += 1;
      try {
        const result = fn(...args);
        this.depth -= 1;
        this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
        return result;
      } catch (err) {
        this.depth -= 1;
        this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
        throw err;
      }
    };
  }

  /** Free cached statements (before export() or close()). */
  freeStatements(): void {
    for (const s of this.cache.values()) s.free();
    this.cache.clear();
  }
}

/** Open, save and close sql.js databases for the action log (src/log.ts). */
export function sqlJsHost(SQL: SqlJsStatic): DbHost {
  return {
    open: (bytes) => {
      const db = new SqlJsDb(new SQL.Database(bytes));
      db.exec('PRAGMA foreign_keys = ON');
      return db;
    },
    save: (db) => {
      const d = db as SqlJsDb;
      d.freeStatements();
      const bytes = d.raw.export();
      d.exec('PRAGMA foreign_keys = ON');
      return bytes;
    },
    close: (db) => {
      const d = db as SqlJsDb;
      d.freeStatements();
      d.raw.close();
    },
  };
}
