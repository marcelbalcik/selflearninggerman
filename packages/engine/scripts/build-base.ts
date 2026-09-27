/**
 * Build the base database the web app starts from: every migration plus the
 * content, no user data. Written to apps/web/public/data/ under a name that
 * changes with the content and the schema, so browsers fetch a new one only
 * when it changed.
 *
 *   pnpm --filter @wortduell/engine build-base
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { importContent } from '../src/content';
import { migrate } from '../src/db';
import { MIGRATIONS } from '../src/migrations';

const here = dirname(fileURLToPath(import.meta.url));
const content = resolve(here, '..', 'content', 'content.sqlite');
const out = resolve(here, '..', '..', '..', 'apps', 'web', 'public', 'data');

const db = new Database(':memory:');
migrate(db);
const src = new Database(content, { readonly: true });
const result = importContent(db, src);
src.close();
db.exec('VACUUM');
const bytes = db.serialize();
db.close();

const version = createHash('sha256')
  .update(result.version ?? '')
  .update(MIGRATIONS.map((m) => m.name).join(','))
  .digest('hex')
  .slice(0, 12);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.startsWith('base-')) rmSync(join(out, f));
const file = `base-${version}.sqlite`;
writeFileSync(join(out, file), bytes);
writeFileSync(
  join(out, 'base.json'),
  `${JSON.stringify({ file, version, bytes: bytes.length })}\n`,
);
console.log(`${file}: ${(bytes.length / 1e6).toFixed(1)} MB (content ${result.version})`);
