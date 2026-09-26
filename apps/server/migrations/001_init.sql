-- Content (imported from content.sqlite; spec §4.1). User data never lives here.
CREATE TABLE content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE lemma (
  id INTEGER PRIMARY KEY,
  pos TEXT NOT NULL,
  text TEXT NOT NULL,
  sense_key TEXT NOT NULL,
  gloss_en TEXT NOT NULL,
  glosses_accepted TEXT NOT NULL,
  freq_rank INTEGER,
  cefr_hint TEXT,
  semantic_field TEXT,
  theme TEXT,
  track TEXT NOT NULL,
  owner_user_id INTEGER,
  status TEXT NOT NULL,
  review_reasons TEXT NOT NULL,
  gender_exception TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Lemmas dropped by a newer content version stay for existing cards.
  retired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE noun (
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id),
  gender TEXT, alt_genders TEXT, plural TEXT,
  plural_only INTEGER NOT NULL, no_plural INTEGER NOT NULL, gen_sg TEXT,
  weak INTEGER NOT NULL, mixed INTEGER NOT NULL, adjectival INTEGER NOT NULL,
  forms TEXT NOT NULL, mismatch TEXT
);

CREATE TABLE verb (
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id),
  prefix TEXT, separable INTEGER NOT NULL, dual_prefix INTEGER NOT NULL, aux TEXT,
  partizip2 TEXT, praeteritum_3sg TEXT, praesens_2sg TEXT, praesens_3sg TEXT,
  stem_change INTEGER, reflexive TEXT NOT NULL, frame TEXT, frame_status TEXT NOT NULL,
  frame_sources TEXT, zu_infinitive TEXT
);

CREATE TABLE sentence (
  id INTEGER PRIMARY KEY,
  lemma_id INTEGER NOT NULL REFERENCES lemma(id),
  target_facet TEXT NOT NULL,
  skill_ids TEXT NOT NULL,
  de TEXT NOT NULL,
  en TEXT,
  gap TEXT NOT NULL,
  accepted TEXT NOT NULL,
  exercise_types TEXT NOT NULL,
  audio_url TEXT,
  status TEXT NOT NULL,
  generator TEXT NOT NULL,
  validated_at TEXT NOT NULL,
  retired INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sentence_lemma ON sentence(lemma_id);

CREATE TABLE audio (
  lemma_id INTEGER PRIMARY KEY REFERENCES lemma(id),
  url TEXT NOT NULL, local_path TEXT NOT NULL, license TEXT NOT NULL,
  attribution TEXT NOT NULL, source TEXT NOT NULL
);

CREATE TABLE gender_rule (
  suffix TEXT PRIMARY KEY, gender TEXT NOT NULL, dataset_accuracy REAL NOT NULL,
  n INTEGER NOT NULL, active INTEGER NOT NULL
);

-- Users and learning data (spec §13).
CREATE TABLE user (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  ui_lang TEXT NOT NULL DEFAULT 'de',
  placement_done_at TEXT
);

CREATE TABLE auth_session (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE lemma_intro (
  user_id INTEGER NOT NULL REFERENCES user(id),
  lemma_id INTEGER NOT NULL REFERENCES lemma(id),
  introduced_at TEXT NOT NULL,
  day_key TEXT NOT NULL,
  source TEXT NOT NULL, -- 'session' | 'placement'
  PRIMARY KEY (user_id, lemma_id)
);

CREATE TABLE facet_card (
  user_id INTEGER NOT NULL REFERENCES user(id),
  facet_key TEXT NOT NULL,
  lemma_id INTEGER,
  skill_id TEXT,
  fsrs TEXT NOT NULL,
  due TEXT NOT NULL,
  introduced_at TEXT NOT NULL,
  unlocked INTEGER NOT NULL,
  PRIMARY KEY (user_id, facet_key)
);
CREATE INDEX facet_card_due ON facet_card(user_id, unlocked, due);
CREATE INDEX facet_card_lemma ON facet_card(user_id, lemma_id);

CREATE TABLE attempt (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  sentence_id INTEGER NOT NULL,
  exercise_type TEXT NOT NULL,
  answer_raw TEXT NOT NULL,
  correct INTEGER NOT NULL,
  error_class TEXT,
  classification TEXT,
  latency_ms INTEGER NOT NULL,
  context TEXT NOT NULL, -- 'session' | 'duel' | 'exam'
  ts TEXT NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  pending_followup INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX attempt_user_type ON attempt(user_id, exercise_type, ts);
CREATE INDEX attempt_sentence ON attempt(sentence_id);

CREATE TABLE review_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  facet_key TEXT NOT NULL,
  attempt_id INTEGER REFERENCES attempt(id),
  rating TEXT NOT NULL,
  card_before TEXT NOT NULL,
  card_after TEXT NOT NULL,
  ts TEXT NOT NULL,
  context TEXT NOT NULL, -- 'session' | 'duel' | 'exam' | 'placement'
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX review_log_card ON review_log(user_id, facet_key, ts);
CREATE INDEX review_log_attempt ON review_log(attempt_id);

CREATE TABLE report (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  sentence_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL, -- 'open' | 'fixed' | 'rejected'
  created_at TEXT NOT NULL
);
