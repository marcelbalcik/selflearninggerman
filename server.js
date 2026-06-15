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
// tapping any word works with no further requests.
app.get("/api/dictionary", (_req, res) => {
  res.json(DICTIONARY);
});

app.listen(PORT, () => {
  const total = Object.values(LESSONS).reduce((n, arr) => n + arr.length, 0);
  console.log(`German learning app running at http://localhost:${PORT}`);
  console.log(`Offline archive: ${total} texts across ${LEVEL_CODES.length} levels.`);
});
