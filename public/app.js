const state = {
  level: "A1",
  levels: [],
  lessons: {},
  dictionary: {},
  lesson: null,
};

const els = {
  levelRow: document.getElementById("level-row"),
  levelSummary: document.getElementById("level-summary"),
  newTextBtn: document.getElementById("new-text-btn"),
  modeBadge: document.getElementById("mode-badge"),
  lesson: document.getElementById("lesson"),
  placeholder: document.getElementById("placeholder"),
  loader: document.getElementById("loader"),
  title: document.getElementById("lesson-title"),
  germanText: document.getElementById("german-text"),
  translationText: document.getElementById("translation-text"),
  toggleTranslation: document.getElementById("toggle-translation"),
  vocabList: document.getElementById("vocab-list"),
  grammarList: document.getElementById("grammar-list"),
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ---------- levels ---------- */

function setActiveLevel(code) {
  state.level = code;
  const meta = state.levels.find((l) => l.code === code);
  els.levelSummary.textContent = meta ? meta.summary : "";
  if (meta && typeof meta.count === "number") {
    els.modeBadge.hidden = false;
    els.modeBadge.textContent = `${meta.count} text${meta.count === 1 ? "" : "s"}`;
  }
  [...els.levelRow.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.code === code);
  });
}

function renderLevels() {
  els.levelRow.innerHTML = "";
  state.levels.forEach((level) => {
    const btn = document.createElement("button");
    btn.className = "level-btn";
    btn.dataset.code = level.code;
    const name = level.label.includes("·") ? level.label.split("·")[1].trim() : "";
    btn.innerHTML = `<span class="level-code">${level.code}</span><span class="level-name">${name}</span>`;
    btn.addEventListener("click", () => setActiveLevel(level.code));
    els.levelRow.appendChild(btn);
  });
  setActiveLevel(state.level);
}

/* ---------- clickable German text ---------- */

function renderGermanText(text) {
  els.germanText.innerHTML = "";
  const wordRe = /[A-Za-zÀ-ÿ]+(?:[-'’][A-Za-zÀ-ÿ]+)*/g;
  let last = 0;
  let match;
  while ((match = wordRe.exec(text))) {
    if (match.index > last) {
      els.germanText.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const word = match[0];
    const span = document.createElement("span");
    span.className = "word";
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    span.textContent = word;
    span.addEventListener("click", (e) => onWordClick(e, word));
    span.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onWordClick(e, word);
      }
    });
    els.germanText.appendChild(span);
    last = match.index + word.length;
  }
  if (last < text.length) {
    els.germanText.appendChild(document.createTextNode(text.slice(last)));
  }
}

function normalizeWord(word) {
  return word.toLowerCase().replace(/^[^a-zà-ÿ]+|[^a-zà-ÿ]+$/gi, "");
}

function findInVocab(word) {
  const n = normalizeWord(word);
  for (const v of state.lesson?.vocabulary || []) {
    const stripped = v.german.toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, "");
    if (stripped === n || stripped.split(/\s+/).includes(n)) return v;
  }
  return null;
}

/* ---------- popover ---------- */

let popover;

function ensurePopover() {
  if (popover) return popover;
  popover = document.createElement("div");
  popover.className = "word-popover";
  popover.hidden = true;
  document.body.appendChild(popover);
  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && !e.target.classList.contains("word")) hidePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePopover();
  });
  window.addEventListener("resize", hidePopover);
  return popover;
}

function hidePopover() {
  if (popover) popover.hidden = true;
  document.querySelectorAll(".word.active").forEach((el) => el.classList.remove("active"));
}

function showPopover(anchor, html) {
  const p = ensurePopover();
  p.innerHTML = html;
  p.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - p.offsetWidth - 12;
  left = Math.max(window.scrollX + 12, Math.min(left, maxLeft));
  p.style.top = `${top}px`;
  p.style.left = `${left}px`;
}

function popoverHtml(de, en, note) {
  return (
    `<div class="wp-head">${escapeHtml(de)}</div>` +
    `<div class="wp-en">${escapeHtml(en)}</div>` +
    (note ? `<div class="wp-note">${escapeHtml(note)}</div>` : "")
  );
}

function popoverRich(word, data) {
  let html = `<div class="wp-head">${escapeHtml(word)}</div>`;
  if (data.translation) html += `<div class="wp-en">${escapeHtml(data.translation)}</div>`;
  for (const entry of data.entries || []) {
    html += `<div class="wp-entry">`;
    if (entry.partOfSpeech) html += `<div class="wp-pos">${escapeHtml(entry.partOfSpeech)}</div>`;
    html += `<ol class="wp-defs">`;
    for (const def of entry.definitions || []) {
      html += `<li>${escapeHtml(def.definition)}`;
      for (const ex of def.examples || []) {
        html += `<span class="wp-example">${escapeHtml(ex)}</span>`;
      }
      html += `</li>`;
    }
    html += `</ol></div>`;
  }
  return html;
}

/* ---------- online dictionary lookup (browser-side) ---------- */

const lookupCache = new Map();

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

async function fetchMyMemory(q) {
  const params = new URLSearchParams({ q, langpair: "de|en" });
  const r = await fetch(`https://api.mymemory.translated.net/get?${params}`);
  const data = await r.json();
  const t = (data?.responseData?.translatedText || "").trim();
  return t && !/^(NO QUERY|PLEASE|INVALID)/i.test(t) ? t : "";
}

async function fetchWiktionary(q) {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}?redirect=true`;
  const r = await fetch(url);
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
    if (definitions.length) entries.push({ partOfSpeech: section.partOfSpeech || "", definitions });
  }
  return entries;
}

async function lookupOnline(word) {
  if (lookupCache.has(word)) return lookupCache.get(word);
  const [mm, wk] = await Promise.allSettled([fetchMyMemory(word), fetchWiktionary(word)]);
  if (mm.status === "rejected" && wk.status === "rejected") throw new Error("offline");
  const result = {
    translation: mm.status === "fulfilled" ? mm.value : "",
    entries: wk.status === "fulfilled" ? wk.value : [],
  };
  lookupCache.set(word, result);
  return result;
}

async function onWordClick(e, raw) {
  e.stopPropagation();
  const anchor = e.currentTarget;
  document.querySelectorAll(".word.active").forEach((el) => el.classList.remove("active"));
  anchor.classList.add("active");

  // 1) The lesson's own vocabulary — richest, with notes. (offline)
  const local = findInVocab(raw);
  if (local) {
    showPopover(anchor, popoverHtml(local.german, local.english, local.note));
    return;
  }

  // 2) The bundled offline dictionary of common words. (offline)
  const word = normalizeWord(raw);
  const entry = state.dictionary[word];
  if (entry) {
    showPopover(anchor, popoverHtml(raw, entry, ""));
    return;
  }

  // 3) Online dictionaries (MyMemory + Wiktionary), in the browser.
  showPopover(anchor, `<div class="wp-head">${escapeHtml(raw)}</div><div class="wp-note">Looking up…</div>`);
  try {
    const data = await lookupOnline(word);
    if (data.translation || data.entries.length) {
      showPopover(anchor, popoverRich(raw, data));
    } else {
      showPopover(anchor, `<div class="wp-head">${escapeHtml(raw)}</div><div class="wp-note">No translation found.</div>`);
    }
  } catch {
    showPopover(
      anchor,
      `<div class="wp-head">${escapeHtml(raw)}</div><div class="wp-note">Offline — only common words are available without a connection.</div>`
    );
  }
}

/* ---------- lessons ---------- */

function showTranslation(show) {
  els.translationText.hidden = !show;
  els.toggleTranslation.setAttribute("aria-pressed", String(show));
  els.toggleTranslation.textContent = show ? "Hide translation" : "Show translation";
}

function renderLesson(lesson) {
  state.lesson = lesson;
  hidePopover();
  els.title.textContent = lesson.title;
  renderGermanText(lesson.text);
  els.translationText.textContent = lesson.translation;
  showTranslation(false);

  els.vocabList.innerHTML = "";
  (lesson.vocabulary || []).forEach((v) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="vocab-de">${v.german}</span> — <span class="vocab-en">${v.english}</span>`;
    if (v.note) {
      const note = document.createElement("span");
      note.className = "vocab-note";
      note.textContent = v.note;
      li.appendChild(note);
    }
    els.vocabList.appendChild(li);
  });

  els.grammarList.innerHTML = "";
  (lesson.grammar || []).forEach((g) => {
    const block = document.createElement("div");
    block.className = "grammar-point";
    block.innerHTML = `<h4>${g.point}</h4><p>${g.explanation}</p>`;
    (g.examples || []).forEach((ex) => {
      const ed = document.createElement("div");
      ed.className = "example";
      ed.innerHTML = `<span class="ex-de">${ex.german}</span><span class="ex-en">${ex.english}</span>`;
      block.appendChild(ed);
    });
    els.grammarList.appendChild(block);
  });
}

function newLesson() {
  const lessons = state.lessons[state.level] || [];
  if (!lessons.length) return;
  const pool =
    lessons.length > 1 && state.lesson ? lessons.filter((l) => l.id !== state.lesson.id) : lessons;
  const lesson = pool[Math.floor(Math.random() * pool.length)];
  renderLesson(lesson);
  els.placeholder.hidden = true;
  els.lesson.hidden = false;
  els.lesson.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- init ---------- */

async function init() {
  try {
    const [levelsData, lessonsData, dictData] = await Promise.all([
      fetch("data/levels.json").then((r) => r.json()),
      fetch("data/lessons.json").then((r) => r.json()),
      fetch("data/dictionary.json").then((r) => r.json()),
    ]);
    state.levels = levelsData.levels;
    state.lessons = lessonsData;
    state.dictionary = dictData;
  } catch (err) {
    els.placeholder.innerHTML = `<p>Could not load the lesson data: ${err.message}</p>`;
    return;
  }
  renderLevels();
  els.newTextBtn.addEventListener("click", newLesson);
  els.toggleTranslation.addEventListener("click", () => {
    showTranslation(els.translationText.hidden);
  });
}

init();
