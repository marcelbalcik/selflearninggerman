const state = {
  level: "A1",
  levels: [],
  mode: "offline",
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

function setActiveLevel(code) {
  state.level = code;
  const meta = state.levels.find((l) => l.code === code);
  els.levelSummary.textContent = meta ? meta.summary : "";
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
    btn.innerHTML = `<span class="level-code">${level.code}</span><span class="level-name">${level.label
      .split("·")[1]
      .trim()}</span>`;
    btn.addEventListener("click", () => setActiveLevel(level.code));
    els.levelRow.appendChild(btn);
  });
  setActiveLevel(state.level);
}

function showTranslation(show) {
  els.translationText.hidden = !show;
  els.toggleTranslation.setAttribute("aria-pressed", String(show));
  els.toggleTranslation.textContent = show ? "Hide translation" : "Show translation";
}

function renderLesson(lesson) {
  els.title.textContent = lesson.title;
  els.germanText.textContent = lesson.text;
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

  if (lesson.source === "fallback") {
    els.modeBadge.hidden = false;
    els.modeBadge.textContent = "offline sample";
  } else {
    els.modeBadge.hidden = state.mode !== "offline";
  }
}

function setLoading(loading) {
  els.newTextBtn.disabled = loading;
  els.loader.hidden = !loading;
  if (loading) {
    els.lesson.hidden = true;
    els.placeholder.hidden = true;
  }
}

async function fetchLesson() {
  setLoading(true);
  try {
    const res = await fetch(`/api/lesson?level=${encodeURIComponent(state.level)}`);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const lesson = await res.json();
    renderLesson(lesson);
    els.lesson.hidden = false;
    els.lesson.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    els.placeholder.hidden = false;
    els.placeholder.innerHTML = `<p>Something went wrong: ${err.message}. Please try again.</p>`;
  } finally {
    setLoading(false);
  }
}

async function init() {
  try {
    const res = await fetch("/api/levels");
    const data = await res.json();
    state.levels = data.levels;
    state.mode = data.mode;
    if (data.mode === "offline") {
      els.modeBadge.hidden = false;
      els.modeBadge.textContent = "offline mode · sample texts";
    }
  } catch {
    // Fall back to a minimal hard-coded set if the levels endpoint fails.
    state.levels = ["A1", "A2", "B1", "B2", "C1", "C2"].map((code) => ({
      code,
      label: `${code} · `,
      summary: "",
    }));
  }
  renderLevels();
  els.newTextBtn.addEventListener("click", fetchLesson);
  els.toggleTranslation.addEventListener("click", () => {
    showTranslation(els.translationText.hidden);
  });
}

init();
