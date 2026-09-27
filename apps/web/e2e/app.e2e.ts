/**
 * Pages mode end to end: the built site served statically, a fake GitHub
 * holding the shared logs, and two phones (separate browser profiles) whose
 * clocks are moved day by day.
 *
 *   Day 0  both unlock (a wrong password first), say who they are, do the
 *          placement; Marcel plays a session with every exercise type that
 *          comes up and one deliberate mistake.
 *   Day 2  Marcel plays the duel, the partner plays it on her phone; after a
 *          sync Marcel sees the result.
 *   Day 3  the settled result and the star show on both phones.
 *
 *   pnpm --filter @wortduell/web build && pnpm --filter @wortduell/web e2e
 *
 * Env: CHROMIUM (browser binary, default /opt/pw-browsers/chromium),
 *      SHOTS (screenshot folder, default e2e/screenshots).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { seal } from '../src/runtime/crypto';
import { fakeGitHub, staticServer } from './harness';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'dist');
const shots = resolve(process.env.SHOTS ?? join(here, 'screenshots'));
mkdirSync(shots, { recursive: true });
const SITE = 4020;
const API = 4021;
const PASSWORD = 'unser gemeinsames Wortduell-Passwort';
const TOKEN = 'github_pat_e2e';

function fail(msg: string): never {
  throw new Error(msg);
}

/** 09:00 Berlin time (winter) on a day. */
const at = (day: string) => new Date(`${day}T08:00:00.000Z`);

interface Plan {
  items: {
    kind: 'intro' | 'exercise';
    sentenceId?: number;
    exerciseType?: string;
    lemmaId: number;
  }[];
  komposition: { lemmas: { text: string }[] } | null;
}

async function main(): Promise<void> {
  const meta = JSON.parse(readFileSync(join(dist, 'data', 'base.json'), 'utf8')) as {
    file: string;
  };
  const content = new DatabaseSync(join(dist, 'data', meta.file), { readOnly: true });
  const answerFor = (sentenceId: number) => {
    const row = content
      .prepare('SELECT gap, accepted FROM sentence WHERE id = ?')
      .get(sentenceId) as { gap: string; accepted: string } | undefined;
    if (!row) fail(`no sentence ${sentenceId}`);
    return {
      accepted: (JSON.parse(row.accepted) as string[])[0] ?? '',
      gap: JSON.parse(row.gap) as {
        error_index?: number;
        correct?: string | number;
        options?: string[];
      },
    };
  };
  const glossOf = (lemmaId: number) =>
    (
      JSON.parse(
        (
          content.prepare('SELECT glosses_accepted AS g FROM lemma WHERE id = ?').get(lemmaId) as {
            g: string;
          }
        ).g,
      ) as string[]
    )[0] ?? '';

  const config = {
    users: ['Marcel', 'Anna'],
    sync: {
      apiBase: `http://127.0.0.1:${API}`,
      owner: 'marcel',
      repo: 'wortduell-data',
      token: await seal(TOKEN, PASSWORD),
    },
  };
  const github = await fakeGitHub(API, 'marcel', 'wortduell-data', TOKEN);
  const site = await staticServer(dist, SITE, { '/wortduell.config.json': JSON.stringify(config) });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const errors: string[] = [];

  const phone = async (name: string): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    return { ctx, page };
  };
  const shot = (page: Page, name: string) =>
    page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
  /** The app's own API on that phone (the engine runs in the page). */
  const request = <T>(page: Page, method: string, url: string) =>
    page.evaluate(
      ([m, u]) =>
        (
          window as unknown as { wortduell: { request: (a: string, b: string) => unknown } }
        ).wortduell.request(m, u),
      [method, url] as const,
    ) as Promise<T>;
  const sync = (page: Page) =>
    page.evaluate(() =>
      (window as unknown as { wortduell: { syncNow: () => Promise<void> } }).wortduell.syncNow(),
    );

  try {
    const m = await phone('marcel');
    const a = await phone('anna');
    for (const p of [m, a]) await p.page.clock.setFixedTime(at('2027-03-01'));

    // --- Day 0: unlock, who are you, placement -------------------------------------
    for (const [p, who] of [
      [m, 'Marcel'],
      [a, 'Anna'],
    ] as const) {
      await p.page.goto(`http://127.0.0.1:${SITE}/`);
      await p.page.getByLabel('Passwort').fill('falsch');
      await p.page.getByRole('button', { name: 'Entsperren' }).tap();
      await p.page.getByText('Das Passwort stimmt nicht.').waitFor();
      if (who === 'Marcel') await shot(p.page, 'p-01-unlock');
      await p.page.getByLabel('Passwort').fill(PASSWORD);
      await p.page.getByRole('button', { name: 'Entsperren' }).tap();
      await p.page.getByRole('heading', { name: 'Wer bist du?' }).waitFor();
      if (who === 'Marcel') await shot(p.page, 'p-02-wer');
      await p.page.getByRole('button', { name: who }).tap();
      await p.page.getByRole('button', { name: 'Einstufung starten' }).tap();
      const sample = (
        await request<{ sample: { lemmaId: number }[] }>(p.page, 'GET', '/api/placement')
      ).sample;
      for (let i = 0; i < 12; i++) {
        await p.page.getByText(`${i + 1} von`).waitFor();
        await p.page.locator('#answer').fill(glossOf(sample[i]?.lemmaId ?? 0));
        await p.page.getByRole('button', { name: 'Weiter' }).tap();
      }
      await p.page.getByRole('button', { name: 'Fertig' }).tap();
      await p.page.getByText(/Wörter übernommen/u).waitFor();
      await p.page.getByRole('button', { name: 'Weiter' }).tap();
      await p.page.getByRole('heading', { name: `Hallo ${who}!` }).waitFor();
    }

    // Marcel's day-0 session: every exercise type that comes up, one mistake.
    const seen = new Set<string>();
    const page = m.page;
    const plan = await request<Plan>(page, 'GET', '/api/session');
    await shot(page, 'p-03-heute');
    await page.getByRole('button', { name: 'Los geht’s' }).tap();
    let mistake = false;
    for (const [n, item] of plan.items.entries()) {
      await page.getByText(`${n + 1} von ${plan.items.length}`).waitFor();
      if (item.kind === 'intro') {
        if (!seen.has('intro')) await shot(page, 'p-04-intro');
        seen.add('intro');
        await page.getByRole('button', { name: 'Weiter' }).tap();
        continue;
      }
      const { accepted, gap } = answerFor(item.sentenceId ?? 0);
      const type = item.exerciseType ?? '';
      const wrong = !mistake && type === 'kasus_luecke';
      if (type === 'fehlersuche') {
        await page
          .locator('.tokens > *')
          .nth(gap.error_index ?? 0)
          .tap();
        await page.locator('#answer').fill(String(gap.correct ?? ''));
      } else if (type === 'wer_tut_was') {
        await page
          .getByRole('button', { name: gap.options?.[Number(accepted)] ?? '', exact: true })
          .tap();
      } else {
        await page
          .locator('#answer')
          .fill(
            wrong
              ? accepted.replace(/^(\S+)/u, (d) => (d.toLowerCase() === 'den' ? 'dem' : 'den'))
              : accepted,
          );
      }
      if (type !== 'wer_tut_was') {
        if (!seen.has(type)) await shot(page, `p-05-${type}`);
        await page.getByRole('button', { name: 'Prüfen' }).tap();
      }
      await page.locator('.feedback').waitFor();
      const heading = await page.locator('.feedback h2').innerText();
      if (wrong) {
        mistake = true;
        if (!heading.includes('Nicht ganz')) fail('deliberate mistake was graded correct');
        await shot(page, 'p-06-mistake');
        const gender = page.getByRole('button', { name: 'der', exact: true });
        if (await gender.isVisible()) await gender.tap();
      } else if (!heading.includes('Richtig')) {
        fail(`right answer graded wrong (${type}): ${await page.locator('.feedback').innerText()}`);
      }
      seen.add(type);
      await page.getByRole('button', { name: 'Weiter' }).tap();
    }
    if (plan.komposition) {
      await page.getByRole('heading', { name: 'Schreib selbst' }).waitFor();
      await page
        .locator('#komposition')
        .fill(
          `Heute lerne ich ${plan.komposition.lemmas.map((l) => l.text).join(', ')}. Das ist nicht schwer.`,
        );
      await page.getByRole('button', { name: 'Abgeben' }).tap();
      await page.getByRole('button', { name: 'Weiter' }).tap();
    }
    await page.getByRole('heading', { name: 'Geschafft!' }).waitFor();
    await page.getByRole('button', { name: 'Zurück zu Heute' }).tap();
    for (const p of [m, a]) await sync(p.page);
    const files = [...github.files.keys()];
    if (!files.some((f) => f.startsWith('log/1/')) || !files.some((f) => f.startsWith('log/2/')))
      fail(`logs not pushed: ${files.join(', ')}`);

    // --- Day 2: the duel on both phones ------------------------------------------------
    const playDuel = async (p: Page, right: boolean, label: string) => {
      await p.getByRole('heading', { name: 'Duell des Tages' }).waitFor();
      await p.getByRole('button', { name: 'Duell spielen' }).tap();
      await p.getByRole('button', { name: 'Duell spielen' }).tap();
      for (;;) {
        const v = await request<{
          next?: { index: number; sentenceId: number; exerciseType: string } | null;
          total?: number;
        }>(p, 'GET', '/api/duel');
        if (!v.next) break;
        await p.getByText(`${v.next.index + 1} von ${v.total ?? 0}`).waitFor();
        const { accepted, gap } = answerFor(v.next.sentenceId);
        if (v.next.exerciseType === 'wer_tut_was') {
          const pick = right ? Number(accepted) : 1 - Number(accepted);
          await p.getByRole('button', { name: gap.options?.[pick] ?? '', exact: true }).tap();
          continue;
        }
        if (v.next.exerciseType === 'fehlersuche')
          await p
            .locator('.tokens > *')
            .nth(gap.error_index ?? 0)
            .tap();
        await p
          .locator('#answer')
          .fill(
            right
              ? String(v.next.exerciseType === 'fehlersuche' ? gap.correct : accepted)
              : 'falsch',
          );
        if (v.next.index === 0) await shot(p, `p-07-duel-${label}`);
        await p.getByRole('button', { name: 'Prüfen' }).tap();
      }
      await p.getByRole('heading', { name: 'Duell des Tages' }).waitFor();
    };
    for (const p of [m, a]) {
      await p.page.clock.setFixedTime(at('2027-03-03'));
      await p.page.reload();
    }
    await playDuel(m.page, true, 'marcel');
    await m.page.getByText(/hat noch nicht gespielt/u).waitFor();
    await sync(m.page);
    await sync(a.page);
    await a.page.goto(`http://127.0.0.1:${SITE}/#/heute`);
    await playDuel(a.page, false, 'anna');
    await sync(a.page);
    await sync(m.page);
    // Marcel is still on the duel screen: the synced result appears there.
    await m.page.getByText('Du gewinnst!').waitFor();
    await shot(m.page, 'p-08-duel-result');

    // --- Day 3: settled on both phones -------------------------------------------------
    for (const p of [m, a]) {
      await p.page.clock.setFixedTime(at('2027-03-04'));
      await p.page.goto(`http://127.0.0.1:${SITE}/#/wettbewerb`);
      await p.page.getByRole('heading', { name: 'Letzte Duelle' }).waitFor();
    }
    await m.page.getByText('Du gewinnst!').first().waitFor();
    await a.page.getByText('Marcel gewinnt.').first().waitFor();
    await shot(m.page, 'p-09-wettbewerb');
    const wm = await request<{ days: unknown[]; stars: unknown[] }>(
      m.page,
      'GET',
      '/api/wettbewerb',
    );
    const wa = await request<{ days: unknown[]; stars: unknown[] }>(
      a.page,
      'GET',
      '/api/wettbewerb',
    );
    if (
      JSON.stringify(wm.days) !== JSON.stringify(wa.days) ||
      JSON.stringify(wm.stars) !== JSON.stringify(wa.stars)
    )
      fail('the two phones disagree on the results');
    await m.page.goto(`http://127.0.0.1:${SITE}/#/einstellungen`);
    await m.page.getByText(/Zuletzt abgeglichen/u).waitFor();
    await shot(m.page, 'p-10-mehr');

    if (errors.length > 0) fail(`page errors: ${errors.join('; ')}`);
    console.log(
      `OK: types ${[...seen].join(', ')}; ${github.files.size} log files, ${github.writes} writes; both phones agree; screenshots in ${shots}`,
    );
  } finally {
    await browser.close();
    site.close();
    github.server.close();
    content.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
