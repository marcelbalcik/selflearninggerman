/**
 * Server entry point. Environment:
 *   DATA_DIR            where wortduell.sqlite lives (default ./data)
 *   CONTENT_PATH        content.sqlite to import (default ./content/content.sqlite)
 *   PORT, HOST          listen address (default 3000, 127.0.0.1)
 *   COOKIE_SECURE       "false" only for local development without HTTPS
 *   WEB_DIST            built web app to serve (default ../web/dist)
 *   CLOCK_OFFSET_MS     development/testing only: shift the server clock
 *   LANGUAGETOOL_URL    self-hosted LanguageTool (e.g. http://languagetool:8010); optional
 *   USER1_NAME, USER1_PASSWORD_HASH, USER2_NAME, USER2_PASSWORD_HASH
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offsetClock, systemClock } from '@wortduell/core';
import { buildApp } from './app';
import { languageToolClient } from './services/komposition';
import { seedUsers, usersFromEnv } from './auth';
import { importContent } from './content';
import { openDb } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', 'data'));
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, 'wortduell.sqlite'));
const imported = importContent(
  db,
  resolve(process.env.CONTENT_PATH ?? join(here, '..', 'content', 'content.sqlite')),
);
const users = usersFromEnv(process.env);
if (users.length === 0) console.warn('No users configured (USER1_NAME / USER1_PASSWORD_HASH).');
seedUsers(db, users);

const app = buildApp({
  db,
  clock: process.env.CLOCK_OFFSET_MS
    ? offsetClock(Number(process.env.CLOCK_OFFSET_MS))
    : systemClock,
  secureCookies: process.env.COOKIE_SECURE !== 'false',
  logger: true,
  webDist: resolve(process.env.WEB_DIST ?? join(here, '..', '..', 'web', 'dist')),
  languageTool: languageToolClient(process.env.LANGUAGETOOL_URL),
});
app.log.info({ content: imported }, 'content');
if (process.env.CLOCK_OFFSET_MS)
  app.log.warn({ offsetMs: process.env.CLOCK_OFFSET_MS }, 'clock is shifted (testing only)');
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
