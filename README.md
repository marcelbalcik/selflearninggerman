# Deutsch lesen — Self-Learning German

A simple web app for learning German from short, interesting texts. Pick your
CEFR level (A1 → C2), get a text from the archive, then study its
**translation**, **vocabulary**, and the **grammar that level is meant to
teach** — all drawn from the text you just read. **Tap any word** to check its
meaning.

It's a **static site** — the lessons and a common-word dictionary ship with it,
so it works offline; only the "tap a rare word" lookup uses the internet.

## How it works

- A built-in **archive of 46 hand-written lessons** (16 at A1, plus 6 each at
  A2–C2), covering everyday life, history, sports, literature, music, science,
  geography, food, nature, and culture. Each lesson has a German text, an English
  translation, a vocabulary list, and 2–3 grammar points. "Get a new text" picks
  another one at random (without repeating the last).
- **Tap any word** to see its meaning. Lookups are offline-first:
  1. the lesson's own vocabulary (richest, with notes),
  2. a bundled dictionary of ~360 common German words and forms,
  3. then, for anything else, two free online sources combined —
     [MyMemory](https://mymemory.translated.net/) (a quick translation that also
     handles inflected forms) and [Wiktionary](https://en.wiktionary.org/) (part
     of speech, senses, examples). Only step 3 uses the internet.

## Run it locally

```bash
npm install
npm start
```

Open http://localhost:3000. (`npm start` runs the build, then serves `public/`.)

## Project structure

```
data/levels.js       CEFR levels and their grammar focus  (source of truth)
data/lessons.js      The lesson archive                    (source of truth)
data/dictionary.js   Offline common-word dictionary        (source of truth)
scripts/build-data.mjs  Emits the above as JSON into public/data/
public/              The static site (index.html, styles.css, app.js, data/)
server.js            Tiny static server for local dev
.github/workflows/   GitHub Pages deploy workflow
```

The app loads `public/data/*.json` and runs entirely in the browser; lesson
selection and word lookups happen client-side. The Node parts are only a build
step and a local dev server.

## Adding more content

- **More texts:** add entries to the arrays in `data/lessons.js` (unique `id`),
  then `npm run build`.
- **More words:** add lowercase keys to `data/dictionary.js`, then `npm run build`.

## Deploying

The included workflow builds the site and publishes `public/` to **GitHub
Pages** on every push. If word lookup is blocked in a locked-down network,
allow the hosts `api.mymemory.translated.net` and `en.wiktionary.org`.

## Notes

- Requires Node 18+ (only build/dev dependency is Express).
