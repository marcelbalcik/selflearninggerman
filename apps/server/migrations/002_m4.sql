-- M4: more content data, disputes, reviews, komposition.

ALTER TABLE verb ADD COLUMN praesens_1sg TEXT;

-- Every inflected form of a lemma (komposition's deterministic check).
CREATE TABLE lemma_form (lemma_id INTEGER NOT NULL REFERENCES lemma(id), form TEXT NOT NULL);
CREATE INDEX lemma_form_form ON lemma_form(form);
CREATE INDEX lemma_form_lemma ON lemma_form(lemma_id);

-- "Das stimmt doch!": a disputed answer, decided by the other user only.
CREATE TABLE dispute (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempt(id),
  user_id INTEGER NOT NULL REFERENCES user(id),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL, -- 'open' | 'approved' | 'rejected'
  decided_by INTEGER REFERENCES user(id),
  decided_at TEXT,
  created_at TEXT NOT NULL
);

-- Answers accepted through approved disputes; survive content re-imports.
CREATE TABLE accepted_extra (
  sentence_id INTEGER NOT NULL,
  answer TEXT NOT NULL,
  dispute_id INTEGER REFERENCES dispute(id),
  PRIMARY KEY (sentence_id, answer)
);

-- Frames the users approved or rejected in Prüfen (overrides content).
CREATE TABLE frame_review (
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id),
  status TEXT NOT NULL, -- 'approved' | 'rejected'
  frame TEXT NOT NULL,
  decided_by INTEGER NOT NULL REFERENCES user(id),
  decided_at TEXT NOT NULL
);

-- Komposition: two sentences with three target lemmas (spec §6.8).
CREATE TABLE komposition (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  day_key TEXT NOT NULL,
  lemma_ids TEXT NOT NULL,
  required_case TEXT,
  text TEXT NOT NULL,
  checks TEXT NOT NULL,       -- deterministic target checks
  languagetool TEXT,          -- matches, or null when LanguageTool was unavailable
  reviewed_by INTEGER REFERENCES user(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE komposition_mark (
  id INTEGER PRIMARY KEY,
  komposition_id INTEGER NOT NULL REFERENCES komposition(id),
  reviewer_id INTEGER NOT NULL REFERENCES user(id),
  start INTEGER NOT NULL,
  "end" INTEGER NOT NULL,
  error_type TEXT NOT NULL, -- 'gender' | 'case' | 'frame' | 'ending' | 'other'
  correction TEXT NOT NULL,
  lemma_id INTEGER,
  created_at TEXT NOT NULL
);

-- Reviews that are not tied to an attempt (komposition, partner marks).
ALTER TABLE review_log ADD COLUMN komposition_id INTEGER REFERENCES komposition(id);
