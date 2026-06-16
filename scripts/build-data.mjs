// Generates the static data files the web app loads at runtime, so the whole
// site can be served as plain static files (e.g. on GitHub Pages) with no
// server. Run with: npm run build
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { LEVELS, LEVEL_CODES } from "../data/levels.js";
import { LESSONS } from "../data/lessons.js";
import { DICTIONARY } from "../data/dictionary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

const levels = LEVEL_CODES.map((code) => ({
  code,
  ...LEVELS[code],
  count: (LESSONS[code] || []).length,
}));

writeFileSync(join(outDir, "levels.json"), JSON.stringify({ levels }));
writeFileSync(join(outDir, "lessons.json"), JSON.stringify(LESSONS));
writeFileSync(join(outDir, "dictionary.json"), JSON.stringify(DICTIONARY));

const total = Object.values(LESSONS).reduce((n, a) => n + a.length, 0);
console.log(`Built public/data/: ${levels.length} levels, ${total} lessons, ${Object.keys(DICTIONARY).length} dictionary entries.`);
