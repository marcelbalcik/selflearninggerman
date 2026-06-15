import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { LEVELS, LEVEL_CODES } from "./data/levels.js";
import { LESSONS } from "./data/lessons.js";
import { DICTIONARY } from "./data/dictionary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, "public")));

function pickRandom(arr, excludeId) {
  const pool = arr.length > 1 && excludeId ? arr.filter((l) => l.id !== excludeId) : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Level metadata + how many texts are available at each level.
app.get("/api/levels", (_req, res) => {
  res.json({
    levels: LEVEL_CODES.map((code) => ({
      code,
      ...LEVELS[code],
      count: (LESSONS[code] || []).length,
    })),
  });
});

// A random lesson from the offline archive for the chosen level.
// Pass ?exclude=<id> to avoid repeating the text the learner just read.
app.get("/api/lesson", (req, res) => {
  const levelCode = String(req.query.level || "A1").toUpperCase();
  const lessons = LESSONS[levelCode];
  if (!lessons || lessons.length === 0) {
    return res.status(400).json({ error: `Unknown level: ${levelCode}` });
  }
  const exclude = req.query.exclude ? String(req.query.exclude) : null;
  res.json(pickRandom(lessons, exclude));
});

// The whole offline word dictionary, fetched once by the client so that
// tapping common words works with no further requests.
app.get("/api/dictionary", (_req, res) => {
  res.json(DICTIONARY);
});

// Online fallback for words not in the offline dictionary. Uses the free
// MyMemory translation API (no key). The app works fully offline without
// this — it's only reached for words the bundled dictionary doesn't cover.
const wordCache = new Map();

app.get("/api/word", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Missing query" });

  const key = q.toLowerCase();
  if (wordCache.has(key)) return res.json(wordCache.get(key));

  const params = new URLSearchParams({ q, langpair: "de|en" });
  if (process.env.MYMEMORY_EMAIL) params.set("de", process.env.MYMEMORY_EMAIL);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
      signal: controller.signal,
    });
    const data = await r.json();
    const translation = (data?.responseData?.translatedText || "").trim();
    const ok = translation && !/^(NO QUERY|PLEASE|INVALID|'')/i.test(translation);
    const result = { word: q, translation: ok ? translation : "", source: "online" };
    if (ok) wordCache.set(key, result);
    res.json(result);
  } catch {
    res.status(502).json({ word: q, translation: "", error: "lookup_failed" });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  const total = Object.values(LESSONS).reduce((n, arr) => n + arr.length, 0);
  console.log(`German learning app running at http://localhost:${PORT}`);
  console.log(`Offline archive: ${total} texts across ${LEVEL_CODES.length} levels.`);
});
