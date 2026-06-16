// Local dev server: serves the static site in public/. The deployed site
// (GitHub Pages) uses the same files and needs no server at all.
// Run `npm run build` first (npm start does this automatically) to generate
// public/data/.
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`German learning app running at http://localhost:${PORT}`);
});
