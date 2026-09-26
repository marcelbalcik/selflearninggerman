/**
 * M5 on an emulated phone: the duel, its result after the day boundary, the
 * star that becomes a chore voucher, choosing the chore, and redeeming reward
 * vouchers with the reveal. The partner acts through the API; Marcel uses the
 * app.
 *
 *   pnpm --filter @wortduell/web build && pnpm --filter @wortduell/web exec tsx e2e/competition.e2e.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const PORT = 4011;
const BASE = `http://127.0.0.1:${PORT}`;
const shots = resolve(process.env.SHOTS ?? join(here, 'screenshots'));
mkdirSync(shots, { recursive: true });

function fail(msg: string): never {
  throw new Error(msg);
}

function stop(proc: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((done) => {
    if (proc.exitCode !== null) return done();
    proc.once('exit', () => done());
    proc.kill();
  });
}

/** A tiny API client with its own cookie (the partner's phone). */
function client(name: string) {
  let cookie = '';
  const call = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0] ?? '';
    const data = (await res.json()) as T;
    if (!res.ok) fail(`${name} ${method} ${url}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  };
  return {
    call,
    login: () => call('POST', '/api/login', { name, password: 'geheim' }),
    relogin: () => {
      cookie = '';
      return call('POST', '/api/login', { name, password: 'geheim' });
    },
  };
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'wortduell-e2e5-'));
  const passwordHash = await hash('geheim');
  const startServer = async (offsetDays: number) => {
    const proc = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: join(root, 'apps', 'server'),
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        PORT: String(PORT),
        COOKIE_SECURE: 'false',
        USER1_NAME: 'marcel',
        USER1_PASSWORD_HASH: passwordHash,
        USER2_NAME: 'partnerin',
        USER2_PASSWORD_HASH: passwordHash,
        WEB_DIST: join(root, 'apps', 'web', 'dist'),
        CLOCK_OFFSET_MS: String(offsetDays * 86_400_000),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    proc.stdout.on('data', (d: Buffer) => (log += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (log += d.toString()));
    for (let i = 0; i < 80 && !log.includes('Server listening'); i++)
      await new Promise((r) => setTimeout(r, 250));
    if (!log.includes('Server listening')) fail(`server did not start:\n${log}`);
    return proc;
  };

  let server = await startServer(0);
  const db = new DatabaseSync(join(dataDir, 'wortduell.sqlite'));
  const marcelApi = client('marcel');
  const partner = client('partnerin');
  await marcelApi.login();
  await partner.login();

  // Both know the same words, then finish placement: the competition starts today.
  const lemmas = (
    db
      .prepare(
        `SELECT DISTINCT s.lemma_id AS id FROM sentence s JOIN lemma l ON l.id = s.lemma_id
         WHERE json_extract(s.exercise_types, '$[0]') IN ('kasus_luecke', 'fehlersuche', 'wer_tut_was')
           AND s.status = 'ok' ORDER BY l.freq_rank LIMIT 15`,
      )
      .all() as { id: number }[]
  ).map((r) => r.id);
  for (const c of [marcelApi, partner]) {
    for (const id of lemmas) await c.call('POST', `/api/lemmas/${id}/intro`, {});
    await c.call('POST', '/api/placement/skip', {});
  }
  // Every duel win is a chore (approved today, effective from the next boundary).
  await marcelApi.call('POST', '/api/settings/STARS_PER_S_VOUCHER', { value: 1 });
  await partner.call('POST', '/api/settings/STARS_PER_S_VOUCHER/decision', { approve: true });

  const oracle = (sentenceId: number) => {
    const row = db
      .prepare('SELECT gap, accepted, exercise_types FROM sentence WHERE id = ?')
      .get(sentenceId) as {
      gap: string;
      accepted: string;
      exercise_types: string;
    };
    const type = (JSON.parse(row.exercise_types) as string[])[0];
    const gap = JSON.parse(row.gap) as {
      error_index?: number;
      correct?: string | number;
      options?: string[];
    };
    const accepted = (JSON.parse(row.accepted) as string[])[0] ?? '';
    return { type, gap, accepted };
  };

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'de-DE',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const shot = (name: string) =>
      page.screenshot({ path: join(shots, `m5-${name}.png`), fullPage: true });

    await page.goto(BASE);
    await page.getByLabel('Name').fill('marcel');
    await page.getByLabel('Passwort').fill('geheim');
    await page.getByRole('button', { name: 'Anmelden' }).tap();
    await page.getByRole('heading', { name: 'Duell des Tages' }).waitFor();
    await shot('01-heute-duel');

    // The duel: no feedback between items.
    await page.getByRole('button', { name: 'Duell spielen' }).tap();
    await page.getByRole('button', { name: 'Duell spielen' }).tap();
    const duel = db.prepare('SELECT items FROM duel').get() as { items: string };
    const items = JSON.parse(duel.items) as { sentenceId: number }[];
    for (const [i, it] of items.entries()) {
      await page.getByText(`${i + 1} von ${items.length}`).waitFor();
      const o = oracle(it.sentenceId);
      if (o.type === 'fehlersuche') {
        await page
          .locator('.tokens > *')
          .nth(o.gap.error_index ?? 0)
          .tap();
        await page.locator('#answer').fill(String(o.gap.correct ?? ''));
      } else if (o.type === 'wer_tut_was') {
        await page
          .getByRole('button', { name: o.gap.options?.[Number(o.accepted)] ?? '', exact: true })
          .tap();
        continue;
      } else {
        await page.locator('#answer').fill(o.accepted);
      }
      if (i === 0) await shot('02-duel-item');
      await page.getByRole('button', { name: 'Prüfen' }).tap();
      if (await page.locator('.feedback').count()) fail('feedback shown during the duel');
    }
    await page.getByText(/hat noch nicht gespielt/u).waitFor();
    await shot('03-duel-waiting');

    // The partner plays through the API, answering everything wrong.
    for (;;) {
      const v = await partner.call<{ next: { index: number } | null }>('GET', '/api/duel');
      if (!v.next) break;
      await partner.call('POST', '/api/duel/answer', {
        index: v.next.index,
        answer: 'falsch',
        latencyMs: 3000,
      });
    }
    await page.reload();
    await page.getByText('Du gewinnst!').waitFor();
    await shot('04-duel-result');

    // Next day: settled, one star, which (at 1 star per chore) is an S chore voucher.
    await stop(server);
    server = await startServer(1);
    await marcelApi.relogin();
    await partner.relogin();
    await page.goto(`${BASE}/#/wettbewerb`);
    await page.getByRole('heading', { name: 'Letzte Duelle' }).waitFor();
    await shot('05-wettbewerb');
    await page.goto(`${BASE}/#/aufgaben`);
    await page.getByText(/Wähle eine Aufgabe/u).waitFor();
    await page.locator('label.chore-option').filter({ hasText: 'Müll' }).tap();
    await page.getByRole('button', { name: 'Speichern' }).tap();
    await page.getByText('raus|bringen').waitFor();
    await shot('06-aufgabe');
    const v = (
      await partner.call<{ vouchers: { id: number; status: string }[] }>('GET', '/api/vouchers')
    ).vouchers[0];
    if (v?.status !== 'open') fail(`voucher not open: ${JSON.stringify(v)}`);
    await partner.call('POST', `/api/vouchers/${v.id}/done`, {});
    await page.reload();
    await page.getByRole('button', { name: 'Bestätigen' }).tap();
    await page.getByText('Erledigt und bestätigt').waitFor();

    // Reward vouchers (three banked weeks), combined with change.
    const now = new Date().toISOString();
    for (const eur of [5, 5, 3]) {
      db.prepare(
        "INSERT INTO reward_voucher (value_eur, source, status, created_at) VALUES (?, 'week', 'banked', ?)",
      ).run(eur, now);
    }
    await page.goto(`${BASE}/#/wochenziel`);
    await page.getByText('Guthaben: 13 €').waitFor();
    for (const c of await page.locator('.chip input').all()) await c.tap();
    await page.getByText('Wechselgeld: 3 €').waitFor();
    await shot('07-wochenziel-select');
    await page.getByRole('button', { name: 'Einlösen vorschlagen' }).tap();
    await page.getByText(/Wartet auf partnerin/u).waitFor();
    const red = (await partner.call<{ redemptions: { id: number }[] }>('GET', '/api/wochenziel'))
      .redemptions[0];
    await partner.call('POST', `/api/redemptions/${red?.id}/confirm`, {});
    await page.reload();
    await page.locator('.reveal[data-flipped="true"]').waitFor();
    await page.waitForTimeout(1200);
    await shot('08-reveal');
    await page.getByRole('button', { name: 'Neu würfeln' }).tap();
    await page.getByText(/muss auch tippen/u).waitFor();
    await partner.call('POST', `/api/redemptions/${red?.id}/reroll`, {});
    await page.reload();
    await page.getByLabel('Planen').fill('2030-01-05');
    await page.getByRole('button', { name: 'Planen' }).tap();
    await page.getByText(/Geplant für/u).waitFor();
    await shot('09-planned');
    await page.goto(`${BASE}/#/einstellungen`);
    await page.getByRole('heading', { name: 'Gemeinsame Einstellungen' }).waitFor();
    await shot('10-mehr');
    await page.goto(`${BASE}/#/heute`);
    await page.getByRole('heading', { name: 'Wochenziel' }).waitFor();
    await shot('11-heute-after');
    if (errors.length > 0) fail(`page errors: ${errors.join('; ')}`);
    console.log(
      `OK: duel of ${items.length} items won, chore voucher chosen and confirmed, 13 € redeemed; screenshots in ${shots}`,
    );
  } finally {
    await browser.close();
    db.close();
    await stop(server);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
