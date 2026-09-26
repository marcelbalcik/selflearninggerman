/**
 * Print an argon2 hash for USERn_PASSWORD_HASH:
 *   pnpm --filter @wortduell/server hash-password
 * The password is read from stdin so it never lands in shell history.
 */
import { hash } from '@node-rs/argon2';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stderr });
rl.question('Password: ', (password) => {
  rl.close();
  void hash(password).then((h) => process.stdout.write(`${h}\n`));
});
