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

// Online fallback for words not in the offline dictionary. Combines two free,
// key-less sources: MyMemory (a quick translation that also handles inflected
// forms) and English Wiktionary (part of speech, senses, and example
// sentences). The app works fully offline without this — it's only reached for
// words the bundled dictionary doesn't cover.
const wordCache = new Map();

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Quick German→English gloss from MyMemory.
async function fetchMyMemory(q, signal) {
  const params = new URLSearchParams({ q, langpair: "de|en" });
  if (process.env.MYMEMORY_EMAIL) params.set("de", process.env.MYMEMORY_EMAIL);
  const r = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal });
  const data = await r.json();
  const t = (data?.responseData?.translatedText || "").trim();
  return t && !/^(NO QUERY|PLEASE|INVALID)/i.test(t) ? t : "";
}

// Richer entries (part of speech, senses, examples) from English Wiktionary's
// REST API. The German section is keyed by language code "de".
async function fetchWiktionary(q, signal) {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}?redirect=true`;
  const r = await fetch(url, {
    signal,
    headers: { "User-Agent": "SelfLearningGerman/1.0 (offline German learning app)" },
  });
  if (!r.ok) return [];
  const data = await r.json();
  const sections = Array.isArray(data?.de) ? data.de : [];
  const entries = [];
  for (const section of sections.slice(0, 3)) {
    const definitions = (section.definitions || [])
      .slice(0, 3)
      .map((d) => ({
        definition: stripHtml(d.definition || ""),
        examples: (d.parsedExamples || d.examples || [])
          .map((ex) => stripHtml(typeof ex === "string" ? ex : ex.example || ""))
          .filter(Boolean)
          .slice(0, 1),
      }))
      .filter((d) => d.definition);
    if (definitions.length) {
      entries.push({ partOfSpeech: section.partOfSpeech || "", definitions });
    }
  }
  return entries;
}

app.get("/api/word", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Missing query" });

  const key = q.toLowerCase();
  if (wordCache.has(key)) return res.json(wordCache.get(key));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const [mm, wk] = await Promise.allSettled([
      fetchMyMemory(q, controller.signal),
      fetchWiktionary(q, controller.signal),
    ]);

    // Both sources unreachable → treat as a connectivity problem.
    if (mm.status === "rejected" && wk.status === "rejected") {
      return res.status(502).json({ word: q, translation: "", entries: [], error: "lookup_failed" });
    }

    const translation = mm.status === "fulfilled" ? mm.value : "";
    const entries = wk.status === "fulfilled" ? wk.value : [];
    const result = { word: q, translation, entries, source: "online" };
    if (translation || entries.length) wordCache.set(key, result);
    res.json(result);
  } catch {
    res.status(502).json({ word: q, translation: "", entries: [], error: "lookup_failed" });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  const total = Object.values(LESSONS).reduce((n, arr) => n + arr.length, 0);
  console.log(`German learning app running at http://localhost:${PORT}`);
  console.log(`Offline archive: ${total} texts across ${LEVEL_CODES.length} levels.`);
});
