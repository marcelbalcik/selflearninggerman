-- M5: competition, chores, joint goal, rewards, dual-approval settings (spec §9, §13).

-- Wiktionary data of the words the chore catalog uses (from content.sqlite).
CREATE TABLE catalog_word (
  text TEXT NOT NULL,
  pos TEXT NOT NULL,
  gloss_en TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (text, pos)
);

ALTER TABLE attempt ADD COLUMN duel_id INTEGER;
ALTER TABLE attempt ADD COLUMN exam_id INTEGER;
ALTER TABLE attempt ADD COLUMN item_index INTEGER;
-- Duel/exam feedback is shown only at the end, so it is kept with the attempt.
ALTER TABLE attempt ADD COLUMN feedback TEXT;
CREATE INDEX attempt_duel ON attempt(duel_id);
CREATE INDEX attempt_exam ON attempt(exam_id);

CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Daily Duell: identical items for both users (spec §9.1).
CREATE TABLE duel (
  id INTEGER PRIMARY KEY,
  day_key TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL,        -- [{sentenceId, lemmaId, facetKey, r: {userId: R}}]
  mode TEXT NOT NULL,         -- 'raw' | 'vs_expected'
  created_at TEXT NOT NULL,
  settled_at TEXT
);
CREATE TABLE duel_result (
  duel_id INTEGER NOT NULL REFERENCES duel(id),
  user_id INTEGER NOT NULL REFERENCES user(id),
  correct INTEGER NOT NULL DEFAULT 0,
  expected_sum REAL NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  forfeit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (duel_id, user_id)
);

-- Monatsprüfung (spec §9.3).
CREATE TABLE exam (
  id INTEGER PRIMARY KEY,
  month_key TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settled_at TEXT
);
CREATE TABLE exam_result (
  exam_id INTEGER NOT NULL REFERENCES exam(id),
  user_id INTEGER NOT NULL REFERENCES user(id),
  correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  forfeit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (exam_id, user_id)
);

-- Behalten-Score: B_u at the end of each learning day (spec §9.2).
CREATE TABLE snapshot (
  user_id INTEGER NOT NULL REFERENCES user(id),
  day_key TEXT NOT NULL,
  b_value REAL NOT NULL,
  reconstructed INTEGER NOT NULL DEFAULT 0,
  taken_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

-- One row per settled period; immutable except through re-settlement (§8.4).
CREATE TABLE period_result (
  kind TEXT NOT NULL,         -- 'day' | 'week' | 'month'
  period_key TEXT NOT NULL,
  winner_user_id INTEGER,
  draw INTEGER NOT NULL,
  details TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  resettled_at TEXT,
  PRIMARY KEY (kind, period_key)
);

CREATE TABLE star (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id),
  period_key TEXT NOT NULL,
  consumed_by_voucher_id INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, period_key)
);

CREATE TABLE chore (
  id INTEGER PRIMARY KEY,
  size TEXT NOT NULL,         -- 'S' | 'M' | 'L'
  title_de TEXT NOT NULL,
  sentence_de TEXT NOT NULL,
  title_en TEXT NOT NULL,
  noun TEXT,                  -- catalog_word / lemma text for the declension strip
  verb TEXT,                  -- catalog_word / lemma text for the separable split
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE voucher (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,         -- 'day' (stars) | 'week' | 'month'
  from_period TEXT NOT NULL,
  winner_id INTEGER NOT NULL REFERENCES user(id),
  loser_id INTEGER NOT NULL REFERENCES user(id),
  size TEXT NOT NULL,
  chore_id INTEGER REFERENCES chore(id),
  status TEXT NOT NULL,       -- 'choose' | 'open' | 'done' | 'confirmed' | 'void'
  choose_by TEXT NOT NULL,
  deadline TEXT,
  done_at TEXT,
  confirmed_at TEXT,
  auto TEXT,                  -- 'picked' | 'confirmed' when the server acted
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Komposition is counted per week; the queue-cleared flag feeds active days.
CREATE TABLE day_activity (
  user_id INTEGER NOT NULL REFERENCES user(id),
  day_key TEXT NOT NULL,
  cleared_at TEXT NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE coop_week (
  week_key TEXT PRIMARY KEY,
  tier_eur INTEGER,
  details TEXT NOT NULL,
  voucher_id INTEGER,
  settled_at TEXT NOT NULL
);

CREATE TABLE reward_voucher (
  id INTEGER PRIMARY KEY,
  value_eur INTEGER NOT NULL,
  source TEXT NOT NULL,       -- 'week' | 'change'
  week_key TEXT UNIQUE,
  status TEXT NOT NULL,       -- 'banked' | 'spent'
  redemption_id INTEGER,      -- set while reserved by a pending redemption or once spent
  change_of INTEGER,          -- redemption that issued this change voucher
  created_at TEXT NOT NULL
);

CREATE TABLE reward (
  id INTEGER PRIMARY KEY,
  budget_eur INTEGER NOT NULL,
  kind TEXT NOT NULL,         -- 'together' | 'buy'
  title_de TEXT NOT NULL,
  title_en TEXT NOT NULL,
  german_mission_de TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT 'any',
  needs_babysitter INTEGER NOT NULL DEFAULT 0,
  est_cost_note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  last_drawn_at TEXT,
  proposed_by INTEGER REFERENCES user(id),
  approved_by INTEGER REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE redemption (
  id INTEGER PRIMARY KEY,
  voucher_ids TEXT NOT NULL,
  total_eur INTEGER NOT NULL,
  band_eur INTEGER NOT NULL,        -- chosen band
  drawn_band_eur INTEGER,           -- after fallback
  change_voucher_id INTEGER,
  reward_id INTEGER REFERENCES reward(id),
  rng_seed INTEGER NOT NULL,
  rerolls_used INTEGER NOT NULL DEFAULT 0,
  reroll_requests TEXT NOT NULL DEFAULT '[]',
  undo_requests TEXT NOT NULL DEFAULT '[]',
  prev_drawn_at TEXT,               -- the reward's last_drawn_at before this draw (undo, reroll)
  started_by INTEGER NOT NULL REFERENCES user(id),
  confirmed_by INTEGER REFERENCES user(id),
  status TEXT NOT NULL,             -- 'pending' | 'drawn' | 'planned' | 'done' | 'undone'
  planned_for TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dual-approval settings (spec §10): one pending proposal per key, values with
-- the instant they take effect (the next day boundary after approval).
CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  pending_value TEXT NOT NULL,
  proposed_by INTEGER NOT NULL REFERENCES user(id),
  proposed_at TEXT NOT NULL
);
CREATE TABLE setting_value (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  proposed_by INTEGER,
  approved_by INTEGER,
  PRIMARY KEY (key, effective_from)
);

-- Seed catalogs (spec §12). Prices are estimates; both users can edit them.
INSERT INTO chore (size, title_de, sentence_de, title_en, noun, verb) VALUES
  ('S', 'Spülmaschine ausräumen', 'Du räumst heute die Spülmaschine aus.', 'Empty the dishwasher', 'Spülmaschine', 'ausräumen'),
  ('S', 'Müll rausbringen', 'Du bringst den Müll raus.', 'Take out the rubbish', 'Müll', 'rausbringen'),
  ('S', 'Wäsche aufhängen', 'Du hängst die Wäsche auf.', 'Hang up the laundry', 'Wäsche', 'aufhängen'),
  ('S', 'Pfandflaschen wegbringen', 'Du bringst die Pfandflaschen weg.', 'Return the deposit bottles', 'Pfandflasche', 'wegbringen'),
  ('S', 'Tisch abräumen', 'Du räumst nach dem Essen den Tisch ab.', 'Clear the table', 'Tisch', 'abräumen'),
  ('M', 'Bad putzen', 'Du putzt heute das Bad.', 'Clean the bathroom', 'Bad', 'putzen'),
  ('M', 'Wohnung saugen', 'Du saugst die ganze Wohnung.', 'Vacuum the flat', 'Wohnung', 'saugen'),
  ('M', 'Betten neu beziehen', 'Du beziehst die Betten neu.', 'Change the bed linen', 'Bett', 'beziehen'),
  ('M', 'Wocheneinkauf', 'Du kaufst für die Woche ein.', 'Weekly shopping', 'Woche', 'einkaufen'),
  ('M', 'Kühlschrank auswischen', 'Du wischst den Kühlschrank aus.', 'Wipe out the fridge', 'Kühlschrank', 'auswischen'),
  ('L', 'Küche gründlich', 'Du putzt die Küche gründlich, auch den Backofen.', 'Deep-clean the kitchen', 'Küche', 'putzen'),
  ('L', 'Fenster', 'Du putzt alle Fenster.', 'Clean all windows', 'Fenster', 'putzen'),
  ('L', 'Bad Grundreinigung', 'Du machst eine Grundreinigung im Bad.', 'Deep-clean the bathroom', 'Bad', 'machen'),
  ('L', 'Abstellraum', 'Du räumst den Abstellraum auf.', 'Tidy the storeroom', 'Abstellraum', 'aufräumen');

INSERT INTO reward (budget_eur, kind, title_de, title_en, german_mission_de, season, needs_babysitter, est_cost_note) VALUES
  (3, 'together', 'Stadt-Land-Fluss-Abend', 'Stadt-Land-Fluss evening', 'Nur deutsche Wörter.', 'any', 0, '0 €'),
  (3, 'together', 'Abendspaziergang', 'Evening walk', 'Jede/r beschreibt zehn Dinge auf Deutsch.', 'outdoor', 0, '0 €'),
  (3, 'buy', 'Ein deutsches Rätselheft', 'A German puzzle book', '', 'any', 0, '~3 €'),
  (3, 'buy', 'Zwei Brezeln vom Bäcker', 'Two pretzels from the bakery', 'Ihr bestellt auf Deutsch.', 'any', 0, '~3 €'),
  (3, 'buy', 'Ein Pixi-Buch', 'A Pixi book', 'Ihr lest es euch gegenseitig vor.', 'any', 0, '~1–2 €'),
  (5, 'together', 'Kartoffelpuffer nach deutschem Rezept kochen', 'Cook potato pancakes from a German recipe', 'Ihr lest das Rezept laut vor.', 'any', 0, '~4 € Zutaten'),
  (5, 'buy', 'Eine Kugel Eis für jeden', 'A scoop of ice cream each', 'Ihr bestellt auf Deutsch.', 'outdoor', 0, ''),
  (5, 'buy', 'Zwei Teilchen vom Bäcker', 'Two pastries from the bakery', 'Ihr bestellt auf Deutsch, „zum Mitnehmen“.', 'any', 0, ''),
  (10, 'buy', 'Kuchen vom Konditor für Kaffee und Kuchen zu Hause', 'Cake from the patisserie for coffee at home', '', 'any', 0, ''),
  (10, 'together', 'Käsespätzle selbst machen', 'Make Käsespätzle', '', 'any', 0, '~8–10 €'),
  (10, 'together', 'Flohmarkt mit 10 € Budget', 'Flea market with a 10 € budget', 'Ihr handelt nur auf Deutsch.', 'outdoor', 0, ''),
  (10, 'buy', 'Ein deutsches Comicheft', 'A German comic', 'Ihr lest eine Geschichte gemeinsam.', 'any', 0, ''),
  (15, 'together', 'Minigolf zu zweit', 'Mini golf for two', '', 'outdoor', 0, 'Preis vor Ort prüfen'),
  (15, 'together', 'Wochenmarkt-Einkauf für ein deutsches Gericht', 'Market shopping for a German dish', 'Ihr kauft nur auf Deutsch ein.', 'any', 0, ''),
  (20, 'together', 'Döner- oder Pizza-Abend (Abholung)', 'Döner or pizza night (takeaway)', 'Am Tisch wird nur Deutsch gesprochen.', 'any', 0, ''),
  (20, 'together', 'Kaffee und Kuchen im Café', 'Coffee and cake at a café', '', 'any', 1, 'Preis vor Ort prüfen'),
  (20, 'buy', 'Ein deutsches Wort- oder Brettspiel', 'A German word or board game', 'Ihr erklärt euch die Regeln auf Deutsch.', 'any', 0, '≤ 20 €'),
  (20, 'together', 'Museumsbesuch zu zweit', 'Museum visit for two', '', 'any', 1, ''),
  (20, 'buy', 'Ein deutsches Hörbuch', 'A German audiobook', '', 'any', 0, ''),
  (30, 'together', 'Kino zu zweit, ein deutscher Film ohne Untertitel', 'Cinema for two, a German film without subtitles', '', 'any', 1, ''),
  (30, 'together', 'Bowling zu zweit', 'Bowling for two', 'Ihr zählt die Punkte auf Deutsch.', 'any', 1, 'Preis vor Ort prüfen');
