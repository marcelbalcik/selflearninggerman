# Wortduell

A private web app for two people to learn German vocabulary through typed
retrieval practice, with a daily duel, weekly and monthly competition, and a
shared weekly goal. The full build spec is [docs/SPEC.md](docs/SPEC.md);
decisions taken on top of it are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

| Milestone                 | State       |
| ------------------------- | ----------- |
| M0 Scaffold and core      | done        |
| M1 Pipeline on 200 lemmas | next        |
| M2–M6                     | not started |

## Layout

```
packages/core   pure TypeScript: config, determiners, declension, normalisation,
                grading, error classification, ratings (no IO)
apps/web        Vite + React PWA            (M3)
apps/server     Fastify + SQLite (+ self-hosted LanguageTool)  (M2)
pipeline/       Python content pipeline: Wiktionary, Tatoeba,
                spaCy, OdeNet; no paid APIs (M1)
```

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
