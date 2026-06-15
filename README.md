# Deutsch lesen — Self-Learning German

A simple web app for learning German from short, interesting texts. Pick your
CEFR level (A1 → C2), get a fresh passage, then study its **translation**,
**vocabulary**, and the **grammar that level is meant to teach** — all drawn
from the text you just read.

It's the same idea as a conversation-practice app, but built around authentic
reading snippets instead of dialogues.

## How it works

- The backend asks **Claude** (`claude-opus-4-8`) to write an interesting German
  passage at the selected level, then return a fluent translation, a short
  vocabulary list, and 2–3 grammar points demonstrated by the text.
- Responses use **structured outputs**, so the model always returns clean,
  predictable JSON that the frontend renders into cards.
- If no API key is set (or a request fails), the app falls back to a set of
  hand-written sample lessons — one per level — so it always works.
- **Tap any word** in the text to see its meaning. This does **not** use Opus:
  it checks the lesson's own vocabulary first (instant, offline), then falls
  back to the free [MyMemory](https://mymemory.translated.net/) translation
  service for any other word — so word-checking is free regardless of whether
  you have API access.

## Do I need a paid plan?

A **Claude Pro/Max subscription does not include API access** — the API is
billed separately via [console.anthropic.com](https://console.anthropic.com)
(pay-as-you-go). You only need that to generate **fresh** AI texts. The app is
fully usable without it: the curated sample lessons and the tap-to-check-words
feature both work with no API key.

> If you deploy in a sandbox with network egress restrictions, allow the host
> `api.mymemory.translated.net` so word lookup can reach the dictionary.
> Optionally set `MYMEMORY_EMAIL` to raise the free rate limit.

## Run it

```bash
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY (optional)
npm start
```

Open http://localhost:3000.

- **With an API key:** every "Get a new text" generates a fresh, level-tailored
  passage on a random interesting topic.
- **Without a key:** the app runs in offline mode and serves the curated
  sample lessons.

## Project structure

```
server.js            Express server + Claude lesson generation
data/levels.js       CEFR levels, their grammar focus, and topic pool
data/fallback.js     Curated sample lessons (one per level)
public/index.html    UI
public/styles.css    Styling
public/app.js         Frontend logic
```

## API

- `GET /api/levels` — list of levels and whether the server is in live/offline mode.
- `GET /api/lesson?level=B1` — a lesson for the given level (`A1`–`C2`).
- `GET /api/word?q=Haus` — German→English translation of a single word (free, no Opus).

## Notes

- Requires Node 18+.
- The model is configured in `server.js` (`MODEL`). `medium` effort keeps
  generation reasonably fast for an interactive app.
