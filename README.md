# Wortduell

A private web app for two people to learn German vocabulary through typed
retrieval practice, with a daily duel, weekly and monthly competition, and a
shared weekly goal. It runs entirely on GitHub Pages: there is no server. The
full build spec is [docs/SPEC.md](docs/SPEC.md); decisions taken on top of it
are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

| Milestone            | State                                           |
| -------------------- | ----------------------------------------------- |
| M0 Scaffold and core | done                                            |
| M1 Pipeline          | done (reviewed)                                 |
| M2 Server core       | done (now the engine, runs on the phone)        |
| M3 Web               | done (real-phone check by Marcel open)          |
| M4 Content at scale  | done                                            |
| M5 Competition       | done                                            |
| Pages mode           | done, awaiting review (replaces the M6 servers) |

## How it works

```
packages/core    pure TypeScript: config, declension, grading, FSRS, competition rules
packages/engine  the app's logic and SQL: learning, duel, settlement, vouchers,
                 rewards, settings; an in-process router; the action log
apps/web         Vite + React PWA; runs the engine on SQLite in the browser (sql.js)
                 and syncs through GitHub (src/runtime/)
pipeline/        Python content pipeline: Wiktionary, Tatoeba, spaCy, OdeNet
```

- **Everything runs on the phone.** The word database ships with the site; the
  engine answers the screens locally, so the app also works offline.
- **Shared state is an action log.** Every answer, duel move, voucher step or
  setting change is one action. Each person's actions go to their own files in
  a **private** GitHub repository (`log/<person>/<day>.json`); each phone
  fetches the other's and replays both logs in one fixed order, so both
  phones compute the same results. Settlement (duel, week, month) happens on
  whichever phone opens first after 03:00, with the same outcome on both.
- **One shared password** unlocks the GitHub token, which is published only
  encrypted (AES-GCM, key from the password via PBKDF2). Then the app asks
  "Wer bist du?" and remembers the answer on that phone.

## Setting it up (once)

1. **Data repository.** On GitHub, create a new **private** repository, e.g.
   `wortduell-data`. It can stay empty.
2. **Token.** GitHub → Settings → Developer settings → Fine-grained personal
   access tokens → Generate new token:
   - Repository access: _Only select repositories_ → `wortduell-data`.
   - Permissions: _Contents: Read and write_ (nothing else).
   - Expiration: up to a year; renew it and re-run step 3 when it expires.

   Keep the token to yourself; never paste it into a chat or an issue.

3. **Pages.** In this repository: Settings → Pages → Source: _GitHub Actions_.
   The `Pages` workflow publishes the app on every push to the default branch, at
   `https://<your-account>.github.io/<this-repository>/`.
4. **Config, in the browser.** Open that address with `#/einrichten` at the
   end (the first screen also links to it). Enter your two names, the data
   repository, the token and a shared password (a long sentence: the
   encrypted token is public and could be guessed at offline). The page checks
   the token and encrypts it right there, then shows the config file. On
   GitHub, use _Add file → Create new file_ in this repository, name it
   `apps/web/public/wortduell.config.json`, paste the text and commit. After the
   rebuild (a minute or two) the app syncs.

   _Alternatively, with Node 22 and pnpm installed:_
   `pnpm install && pnpm --filter @wortduell/web setup-sync` writes the same file.

5. **Phones.** Open the address, enter the password, choose your name, and add
   the page to the home screen (it installs as an app).

Without `wortduell.config.json` the app runs on one device only (no sync),
which is handy for trying it out: `pnpm dev`.

## Development

Requires Node 22.12+ and pnpm 10.

```bash
pnpm install
pnpm dev         # the app on http://localhost:5173 (this device only)
pnpm verify      # format check, lint, typecheck, tests (what CI runs)
pnpm e2e         # builds the site, then two emulated phones sync through a fake GitHub
```

- `pnpm --filter @wortduell/engine build-base` rebuilds the base database
  (`apps/web/public/data/`) from `packages/engine/content/content.sqlite`; the
  web build does this first.
- The engine tests include a 90-day and a 30-day simulation across both DST
  switches, and two phones syncing late and out of order that must end with
  identical databases (also on sql.js).
- `pnpm e2e` needs Chromium (`CHROMIUM=/path/to/chrome` if it is not at
  `/opt/pw-browsers/chromium`); screenshots land in `apps/web/e2e/screenshots/`.

All tunable numbers live in `packages/core/src/config.ts`. Business logic
takes time from an injected clock; lint rejects `Date.now()` and `new Date()`
in `packages/core` and `packages/engine`.
