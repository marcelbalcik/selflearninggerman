// Generates the static data files the web app loads at runtime, so the whole
// site can be served as plain static files (e.g. on GitHub Pages) with no
// server. Run with: npm run build
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { LEVELS, LEVEL_CODES } from "../data/levels.js";
import { LESSONS } from "../data/lessons.js";
import { DICTIONARY } from "../data/dictionary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

// Bulk-generated lessons live in a separate JSON file so the curated
// data/lessons.js stays readable. Merge them in by level here.
let EXTRA = {};
try {
  EXTRA = JSON.parse(readFileSync(join(__dirname, "..", "data", "lessons-extra.json"), "utf8"));
} catch {
  EXTRA = {};
}

const ALL_LESSONS = {};
for (const code of LEVEL_CODES) {
  ALL_LESSONS[code] = [...(LESSONS[code] || []), ...(EXTRA[code] || [])];
}

const levels = LEVEL_CODES.map((code) => ({
  code,
  ...LEVELS[code],
  count: (ALL_LESSONS[code] || []).length,
}));

writeFileSync(join(outDir, "levels.json"), JSON.stringify({ levels }));
writeFileSync(join(outDir, "lessons.json"), JSON.stringify(ALL_LESSONS));
writeFileSync(join(outDir, "dictionary.json"), JSON.stringify(DICTIONARY));

const total = Object.values(ALL_LESSONS).reduce((n, a) => n + a.length, 0);
console.log(`Built public/data/: ${levels.length} levels, ${total} lessons, ${Object.keys(DICTIONARY).length} dictionary entries.`);
