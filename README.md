# Deutsch lesen — Self-Learning German

A simple, **fully offline** web app for learning German from short, interesting
texts. Pick your CEFR level (A1 → C2), get a text from the archive, then study
its **translation**, **vocabulary**, and the **grammar that level is meant to
teach** — all drawn from the text you just read. Tap any word to check its
meaning.

No accounts, no API keys, no internet required — everything ships with the app.

## How it works

- A built-in **archive of 36 hand-written lessons** (6 per level). Each lesson
  has a German text, an English translation, a vocabulary list, and 2–3 grammar
  points demonstrated by the text. "Get a new text" picks another one at random
  (without immediately repeating the last).
- **Tap any word** in the text to see its meaning. Lookups are offline-first:
  1. the lesson's own vocabulary (richest, with notes),
  2. a bundled dictionary of ~360 common German words and forms,
  3. then, for anything else, two free online sources combined:
     [MyMemory](https://mymemory.translated.net/) for a quick translation (it
     also handles inflected forms) and [Wiktionary](https://en.wiktionary.org/)
     for richer detail — part of speech, multiple senses, and example sentences.
  Only step 3 uses the internet; common words still resolve instantly offline,
  and if you're offline the app just says so.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000. That's it — no configuration needed.

## Project structure

```
server.js            Tiny Express server (serves the archive + dictionary)
data/levels.js       CEFR levels and their grammar focus
data/lessons.js      The lesson archive (6 texts per level)
data/dictionary.js   Offline German→English common-word dictionary
public/index.html    UI
public/styles.css    Styling
public/app.js        Frontend logic (clickable words, lookups)
```

## API

- `GET /api/levels` — levels, grammar focus, and how many texts each level has.
- `GET /api/lesson?level=B1&exclude=<id>` — a random lesson for the level.
- `GET /api/dictionary` — the offline word dictionary (loaded once by the client).
- `GET /api/word?q=Haus` — online fallback lookup for words not in the offline
  dictionary. Returns `{ translation, entries: [{ partOfSpeech, definitions }] }`.

> The lesson archive and the ~360-word dictionary are fully offline. Only the
> `/api/word` fallback reaches the internet. If you run in a locked-down
> environment, allow the hosts `api.mymemory.translated.net` and
> `en.wiktionary.org`. You can optionally set `MYMEMORY_EMAIL=you@example.com`
> to raise MyMemory's free rate limit.

## Adding more content

- **More texts:** add entries to the arrays in `data/lessons.js` (give each a
  unique `id`). They're picked up automatically.
- **More words:** add lowercase keys to `data/dictionary.js`.

## Notes

- Requires Node 18+ (only dependency is Express).
