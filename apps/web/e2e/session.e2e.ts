/**
 * M3 acceptance: a full session on a phone. Starts the real server with a
 * fresh database and the built web app, then drives it in Chromium emulating
 * a phone (touch, small viewport): login → placement → Heute → a whole
 * session (intros, kasus_luecke, fehlersuche, bedeutung, one deliberate
 * mistake, the Wort overlay) → back to Heute.
 *
 *   pnpm --filter @wortduell/web build && pnpm --filter @wortduell/web e2e
 *
 * Env: CHROMIUM (browser binary, default /opt/pw-browsers/chromium),
 *      SHOTS (screenshot folder, default e2e/screenshots).
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
const PORT = 4010;

const BASE = `http://127.0.0.1:${PORT}`;
const shots = resolve(process.env.SHOTS ?? join(here, 'screenshots'));
mkdirSync(shots, { recursive: true });

interface PlanItem {
  kind: 'intro' | 'exercise';
  sentenceId?: number;
  exerciseType?: string;
  lemmaId: number;
}

function stop(proc: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((done) => {
    if (proc.exitCode !== null) return done();
    proc.once('exit', () => done());
    proc.kill();
  });
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'wortduell-e2e-'));
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
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  try {
    const db = new DatabaseSync(join(dataDir, 'wortduell.sqlite'), { readOnly: true });
    const glossOf = (lemmaId: number) =>
      (
        JSON.parse(
          (
            db.prepare('SELECT glosses_accepted AS g FROM lemma WHERE id = ?').get(lemmaId) as {
              g: string;
            }
          ).g,
        ) as string[]
      )[0] ?? '';
    const answerFor = (sentenceId: number) => {
      const row = db.prepare('SELECT gap, accepted FROM sentence WHERE id = ?').get(sentenceId) as
        { gap: string; accepted: string } | undefined;
      if (!row) fail(`no sentence ${sentenceId}`);
      const gap = JSON.parse(row.gap) as { error_index?: number; correct?: string };
      return { accepted: (JSON.parse(row.accepted) as string[])[0] ?? '', gap };
    };

    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'de-DE',
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let plan: PlanItem[] = [];
    let placement: { lemmaId: number }[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('/api/session') && res.ok()) {
        plan = ((await res.json()) as { items: PlanItem[] }).items;
      }
      if (res.url().endsWith('/api/placement') && res.request().method() === 'GET' && res.ok()) {
        placement = ((await res.json()) as { sample: { lemmaId: number }[] }).sample;
      }
    });
    const shot = (name: string) =>
      page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });

    // Login
    await page.goto(BASE);
    await page.getByLabel('Name').fill('marcel');
    await page.getByLabel('Passwort').fill('geheim');
    await shot('01-login');
    await page.getByRole('button', { name: 'Anmelden' }).tap();

    // Placement: know the first dozen sampled words, then finish early.
    await page.getByRole('button', { name: 'Einstufung starten' }).tap();
    for (let i = 0; i < 12; i++) {
      await page.getByText(`${i + 1} von`).waitFor();
      await page.locator('#answer').fill(glossOf(placement[i]?.lemmaId ?? 0));
      if (i === 0) await shot('02-placement');
      await page.getByRole('button', { name: 'Weiter' }).tap();
    }
    await page.getByRole('button', { name: 'Fertig' }).tap();
    await page.getByText(/Wörter übernommen/u).waitFor();
    await page.getByRole('button', { name: 'Weiter' }).tap();

    const seen = new Set<string>();
    let mistakeMade = false;
    const runSession = async (label: string) => {
      plan = [];
      await page.getByRole('heading', { name: 'Hallo marcel!' }).waitFor();
      await shot(`03-heute-${label}`);
      await page.getByRole('button', { name: 'Los geht’s' }).tap();
      for (let i = 0; i < 50 && plan.length === 0; i++) await page.waitForTimeout(100);
      if (plan.length === 0) fail('no session plan');
      for (const [n, item] of plan.entries()) {
        await page.getByText(`${n + 1} von ${plan.length}`).waitFor();
        if (item.kind === 'intro') {
          if (!seen.has('intro')) await shot('04-intro');
          seen.add('intro');
          await page.getByRole('button', { name: 'Weiter' }).tap();
          continue;
        }
        const { accepted, gap } = answerFor(item.sentenceId ?? 0);
        const type = item.exerciseType ?? '';
        const wrongOnPurpose = !mistakeMade && type === 'kasus_luecke';
        if (type === 'fehlersuche') {
          await page
            .locator('.tokens > *')
            .nth(gap.error_index ?? 0)
            .tap();
          await page.locator('#answer').fill(gap.correct ?? '');
        } else if (type === 'kasus_luecke') {
          // One grammatical slip to see the red-pen feedback.
          const typed = wrongOnPurpose
            ? accepted.replace(/^(\S+)/u, (d) => (d.toLowerCase() === 'den' ? 'dem' : 'den'))
            : accepted;
          await page.locator('#answer').fill(typed);
        } else {
          await page.locator('#answer').fill(accepted);
        }
        if (!seen.has(type)) await shot(`05-${type}`);
        await page.getByRole('button', { name: 'Prüfen' }).tap();
        await page.locator('.feedback').waitFor();
        const heading = await page.locator('.feedback h2').innerText();
        if (wrongOnPurpose) {
          mistakeMade = true;
          if (!heading.includes('Nicht ganz')) fail('deliberate mistake was graded correct');
          if ((await page.locator('.mark-wrong, .mark-missing').count()) === 0)
            fail('no red marks shown');
          await shot('06-feedback-mistake');
          const gender = page.getByRole('button', { name: 'der', exact: true });
          if (await gender.isVisible()) await gender.tap();
        } else if (!heading.includes('Richtig')) {
          fail(
            `right answer graded wrong (${type}, sentence ${item.sentenceId}): ${await page.locator('.feedback').innerText()}`,
          );
        }
        if (!seen.has(`fb-${type}`) && !wrongOnPurpose) await shot(`06-feedback-${type}`);
        if (!seen.has('wort')) {
          await page.getByRole('button', { name: 'Wort ansehen' }).tap();
          await page
            .getByRole('dialog')
            .getByText(/Gedächtnis|Beispielsätze/u)
            .first()
            .waitFor();
          await shot('07-wort');
          await page.getByRole('button', { name: 'Schließen' }).tap();
          seen.add('wort');
        }
        seen.add(type);
        seen.add(`fb-${type}`);
        await page.getByRole('button', { name: 'Weiter' }).tap();
      }
      await page.getByRole('heading', { name: 'Geschafft!' }).waitFor();
      await shot(`08-done-${label}`);
      await page.getByRole('button', { name: 'Zurück zu Heute' }).tap();
      return plan;
    };

    // Day 1: new words. Day 3: reviews of the placed and new words.
    const day1 = await runSession('day1');
    await stop(server);
    server = await startServer(2);
    await page.reload();
    const day3 = await runSession('day3');
    await page.getByRole('heading', { name: 'Hallo marcel!' }).waitFor();
    await shot('09-heute-after');
    for (const t of ['kasus_luecke', 'fehlersuche', 'bedeutung'])
      if (!seen.has(t)) fail(`no ${t} item was played`);
    if (errors.length > 0) fail(`page errors: ${errors.join('; ')}`);
    const count = (p: PlanItem[]) =>
      `${p.length} items (${p.filter((i) => i.kind === 'intro').length} new words)`;
    console.log(`OK: day 1 ${count(day1)}, day 3 ${count(day3)}; screenshots in ${shots}`);
  } finally {
    await browser.close();
    await stop(server);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
