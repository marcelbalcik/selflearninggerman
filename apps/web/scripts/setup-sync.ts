/**
 * One-time setup (run on your own computer, never paste the token anywhere):
 *
 *   pnpm --filter @wortduell/web setup-sync
 *
 * Asks for the two names, the private data repository, the GitHub token and
 * the shared password; checks that the token can write to the repository;
 * writes apps/web/public/wortduell.config.json with the token encrypted by
 * the password. Commit that file — it is safe to publish as long as the
 * password is long (anyone can try to guess it offline).
 *
 * Non-interactive: WD_USERS="Marcel,Partnerin" WD_OWNER=… WD_REPO=… WD_TOKEN=…
 * WD_PASSWORD=… (e.g. from a password manager's CLI).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { seal } from '../src/runtime/crypto';
import { GitHub } from '../src/runtime/github';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'wortduell.config.json');

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Echo nothing while the secret is typed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(question)) process.stdout.write(question);
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const env = process.env;
  const users = (
    env.WD_USERS ?? (await ask('Die zwei Namen, mit Komma getrennt (z. B. Marcel, Anna): '))
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (users.length !== 2) throw new Error('Bitte genau zwei Namen angeben.');
  const owner = env.WD_OWNER ?? (await ask('GitHub-Konto des Daten-Repos (z. B. marcelbalcik): '));
  const repo = env.WD_REPO ?? (await ask('Name des privaten Daten-Repos (z. B. wortduell-data): '));
  const token = env.WD_TOKEN ?? (await ask('GitHub-Token (Eingabe bleibt unsichtbar): ', true));
  const password = env.WD_PASSWORD ?? (await ask('Gemeinsames Passwort (unsichtbar): ', true));
  if (!env.WD_PASSWORD && (await ask('Passwort wiederholen: ', true)) !== password)
    throw new Error('Die Passwörter sind verschieden.');
  if (password.length < 12)
    throw new Error('Bitte ein Passwort mit mindestens 12 Zeichen (besser ein Satz).');

  process.stdout.write('Prüfe den Token … ');
  await new GitHub(
    { owner, repo, ...(env.WD_API ? { apiBase: env.WD_API } : {}) },
    token,
  ).connect();
  process.stdout.write('ok\n');

  const config = {
    users,
    sync: {
      owner,
      repo,
      ...(env.WD_API ? { apiBase: env.WD_API } : {}),
      token: await seal(token, password),
    },
  };
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Geschrieben: ${target}\nJetzt committen und pushen; die Seite baut sich neu.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
