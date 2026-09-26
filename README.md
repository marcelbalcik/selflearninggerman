# Wortduell

A private web app for two people to learn German vocabulary through typed
retrieval practice, with a daily duel, weekly and monthly competition, and a
shared weekly goal. The full build spec is [docs/SPEC.md](docs/SPEC.md);
decisions taken on top of it are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

| Milestone            | State                                         |
| -------------------- | --------------------------------------------- |
| M0 Scaffold and core | done                                          |
| M1 Pipeline          | done (reviewed)                               |
| M2 Server core       | done (30-day simulation passes)               |
| M3 Web               | done (real-phone check by Marcel open)        |
| M4 Content at scale  | done                                          |
| M5 Competition       | done, awaiting review                         |
| M6 Push and deploy   | next (audio and personal tracks out of scope) |

## Layout

```
packages/core   pure TypeScript: config, determiners, declension, normalisation,
                grading, error classification, ratings (no IO)
apps/web        Vite + React PWA: login, placement, Heute, session runner with
                red-pen feedback, Wort screen, report button (M3);
                all eight exercise types, komposition, disputes, Prüfen (M4);
                Duell, Monatsprüfung, Wettbewerb, Wochenziel, Aufgaben (M5)
apps/server     Fastify + SQLite: auth, content import, FSRS cards, session queue,
                attempts, reports with voiding, placement (M2); disputes,
                komposition with optional LanguageTool, frame review (M4);
                settlement jobs, vouchers, rewards, dual-approval settings (M5)
pipeline/       Python content pipeline: Wiktionary, Tatoeba,
                spaCy, OdeNet; no paid APIs (M1)
```

## Running it

```bash
pnpm install
pnpm --filter @wortduell/server hash-password      # prints an argon2 hash
cp apps/server/.env.example apps/server/.env       # fill in names and hashes
pnpm start                                         # builds the web app, serves both on :3000
```

The server imports `apps/server/content/content.sqlite` on startup when its
content version changed; user data is never touched.

**Trying it on a phone in the same Wi-Fi:** set `HOST=0.0.0.0` and
`COOKIE_SECURE=false` in `apps/server/.env`, run `pnpm start`, and open
`http://<your computer's IP>:3000` on the phone. (Installing as an app needs
HTTPS, which comes with the Caddy deployment in M6.)

**Grammar feedback for komposition (optional):** set `LANGUAGETOOL_URL` (e.g.
`http://localhost:8010` for a local LanguageTool server, `docker run -p
8010:8010 erikvl87/languagetool`). Without it, komposition still checks the
target words and the partner corrects the text in Prüfen.

**End-to-end test on an emulated phone:** `pnpm e2e` starts the server with a
fresh database and plays placement plus two full sessions, a komposition, a
dispute and the partner's Prüfen round in Chromium
(`CHROMIUM=/path/to/chrome` if it is not at `/opt/pw-browsers/chromium`).
A second script (`e2e/competition.e2e.ts`, also run by `pnpm e2e`) plays a
duel, settles it on the next day, chooses and confirms the chore voucher and
redeems reward vouchers with the reveal. Screenshots land in `apps/web/e2e/screenshots/`; see `docs/screenshots/m3/`.

## Development

Requires Node 22.12+ and pnpm 10.

```bash
pnpm install
pnpm verify      # format check, lint, typecheck, tests (what CI runs)
pnpm test        # tests only
pnpm format      # apply Prettier
```

All tunable numbers live in `packages/core/src/config.ts`. Business logic
takes time from an injected clock; lint rejects `Date.now()` and `new Date()`
in `packages/core` and `apps/server`.
