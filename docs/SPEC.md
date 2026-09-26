# Wortduell: build spec for Claude Code

A private web app (installable PWA) for exactly two users, Marcel and his wife, to learn German vocabulary through typed, exercise-based retrieval practice. It includes a daily/weekly/monthly competition with chore stakes and a shared weekly goal with a randomly drawn reward.

---

## 0. How to work on this project

1. Read this whole file before writing any code. Then reply with (a) a milestone plan based on §14 and (b) at most 5 questions where this spec is ambiguous or contradictory. Wait for answers.
2. Build one milestone at a time. After each one, run all tests, commit, and write a short summary covering what was built, what is verified, and what is not verified yet. Then stop for review.
3. **Never invent German grammatical data** (gender, plural, case forms, verb case frames, separability, auxiliaries). If data is missing or sources disagree, set the item to `needs_review` and keep it out of exercises.
4. Every tunable number in this spec lives in one config module (`packages/core/src/config.ts`). No magic numbers anywhere else.
5. All time logic uses an injectable clock and the `Europe/Berlin` timezone. No direct `Date.now()` in business logic.
6. Keep it small: two users and one server. No microservices, no queues, no Kubernetes.
7. When the Claude API is involved, use structured JSON output and validate it against a schema. Never trust an LLM answer about German grammar without the deterministic checks described below.

---

## 1. Design requirements (from a research review; treat these as requirements)

1. **Retrieval with immediate corrective feedback.** Every attempt ends with the correct form shown.
2. **Typed recall, not multiple choice.** The only exception is the `wer_tut_was` exercise.
3. **Spacing is handled by FSRS** (library `ts-fsrs`, which implements FSRS v6).
4. **Nouns always appear as an article + noun unit.** Every noun display shows its case forms.
5. **The article or ending must carry the meaning.** Some exercises can only be solved by processing the case marking.
6. **Receptive practice comes first.** DE→EN recall first; EN→DE is unlocked once receptive recall is stable.
7. **No two new words from the same semantic field on the same day** (e.g. never Messer and Gabel together). Thematic sets (e.g. "am Bahnhof": Gleis, umsteigen, verspätet) are fine.
8. **Producing words in the learner's own sentences** (the `komposition` exercise) is treated as the highest-yield activity.
9. **No gender colour-coding anywhere.** Colour lets the learner bypass the article.
10. **Competition is always paired with a shared goal.**

---

## 2. Stack

- Monorepo with pnpm workspaces and TypeScript `strict` mode.
  - `apps/web`: Vite + React + TypeScript PWA (`vite-plugin-pwa`), mobile-first.
  - `apps/server`: Node 20+, Fastify (or Hono), `better-sqlite3`, Drizzle (or plain SQL migrations), `node-cron`.
  - `packages/core`: pure TypeScript with no IO. Contains article tables, the declension engine, verb helpers, answer normalisation, grading, error classification, the FSRS wrapper and competition scoring. Both server and web import it.
  - `pipeline/`: Python 3.11+ content pipeline that produces `content.sqlite` and `dictionary.sqlite`.
- **The server is authoritative** for grading, FSRS updates and all competition scoring. The web client may pre-grade for instant feedback, but the server result wins.
- **Claude API, server-side only.**
  - The key comes from `ANTHROPIC_API_KEY`. The model id comes from `CLAUDE_MODEL`, default `claude-sonnet-5`. Verify current model ids at https://docs.claude.com before use.
  - Use the Message Batches API for bulk pipeline generation if convenient.
- **Deployment.** Docker Compose on a small VPS, with a `server` container and `caddy` for automatic HTTPS.
  - Nightly SQLite `.backup` to a dated file, keeping 30 days. An optional offsite copy is fine.
- **Why not PocketBase:** grading, FSRS and scoring must run server-side and share code with the client. One language across the stack is simpler.

---

## 3. Users, auth, language

- Two users are seeded from env (`USER1_NAME`, `USER1_PASSWORD_HASH`, `USER2_...`). There is no registration.
- Sessions use httpOnly, Secure, SameSite=Lax cookies. Passwords are hashed with argon2 or bcrypt. Login is rate-limited.
- UI strings live in an i18n file with German (default) and English. Each user has a language toggle.
- The gloss language is English for v1. Keep it pluggable in case the second user needs a different gloss language (see open questions, §16).

---

## 4. Content model

### 4.1 Content tables

```
lemma(id, pos['noun'|'verb'|'adj'|'adv'|'other'], text, sense_key, gloss_en,
      freq_rank, cefr_hint, semantic_field, theme,
      track['core'|'personal'], owner_user_id NULL,
      status['ok'|'needs_review'|'reported'], source, created_at)

noun(lemma_id PK, gender['m'|'f'|'n'], alt_genders JSON NULL,
     plural NULL, plural_only BOOL, no_plural BOOL, gen_sg,
     weak BOOL, mixed BOOL, adjectival BOOL,
     forms JSON)         -- full table {nom,akk,dat,gen} x {sg,pl}, from Wiktionary

verb(lemma_id PK, prefix NULL, separable BOOL, dual_prefix BOOL,
     aux['haben'|'sein'|'both'], partizip2, praeteritum_3sg,
     praesens_2sg, praesens_3sg, stem_change BOOL,
     reflexive['none'|'akk'|'dat'], frame JSON, zu_infinitive)
     -- frame e.g. {"objects":["dat","akk"]} or {"prep":"an","case":"akk"}

sentence(id, lemma_id, target_facet, skill_ids JSON, de, en,
         gap JSON, accepted JSON, exercise_types JSON, audio_url NULL,
         status, generator, validated_at)

audio(lemma_id, url, local_path, license, attribution)
gender_rule(suffix, gender, dataset_accuracy, n, active BOOL)
```

The `gap` field describes the blank in token terms:

```json
{"tokens":["Ich","helfe","___","."],"gap_index":2,
 "expected":"dem Nachbarn","lemma_id":123,
 "features":{"case":"dat","number":"sg","det":"def"},
 "governed_by":{"type":"verb","lemma_id":456}}
```

### 4.2 Nouns: stored vs derived

The user wants every noun taught with its Akkusativ and Dativ forms. These forms are **displayed on every noun** but are mostly derivable.

- **Stored per noun:** gender (plus alternatives), plural, weak/mixed flag, adjectival flag, and the full form table from Wiktionary.
- **Cross-check:** `packages/core/declension.ts` generates the same table independently. The pipeline compares the two, and any mismatch becomes `needs_review` with a reason.

**Determiner tables**

|           | m     | f     | n     | pl       |
|-----------|-------|-------|-------|----------|
| def nom   | der   | die   | das   | die      |
| def akk   | den   | die   | das   | die      |
| def dat   | dem   | der   | dem   | den      |
| def gen   | des   | der   | des   | der      |
| indef nom | ein   | eine  | ein   | (keine)  |
| indef akk | einen | eine  | ein   | (keine)  |
| indef dat | einem | einer | einem | (keinen) |
| indef gen | eines | einer | eines | (keiner) |

`kein` and the possessives (`mein`, `dein`, ...) follow the indefinite pattern and have plural forms `meine / meine / meinen / meiner`.

**Ending rules.** These are a fallback and cross-check only; the Wiktionary table wins.

- **Dative plural** adds `-n` unless the plural ends in `-n` or `-s`.
  - Exception: Latin/Greek plurals in `-a` stay unchanged (`den Praktika`, `den Visa`).
- **Weak masculines (n-Deklination)** take `-(e)n` in akk/dat/gen singular: `den Kollegen`, `dem Jungen`, `des Menschen`.
  - Irregular: `Herr` → `Herrn` in the singular oblique cases, `Herren` in the plural.
- **Mixed declension:**
  - `der Name` → `den Namen`, `dem Namen`, `des Namens`. The same pattern applies to Buchstabe, Gedanke, Glaube, Wille, Funke, Same, Friede.
  - `das Herz` → akk `das Herz`, dat `dem Herzen`, gen `des Herzens`.
- **Adjectival nouns** (`der/die Angestellte`, `der Deutsche`) decline like adjectives: `ein Angestellter`, `dem Angestellten`, `eine Angestellte`.
- **Genitive singular m/n** takes `-s`/`-es`. It is displayed only and not trained in v1.
- **Archaic dative `-e`** (`dem Hause`) is not generated and not accepted.

**Golden test set** (unit tests must pass for all of these):

- der Tisch, der Kollege, der Junge, der Mensch, der Herr, der Student
- der Name, das Herz
- das Auto, das Kind, das Zimmer, die Mutter, die Frau
- das Museum (pl. Museen), das Praktikum (pl. Praktika)
- der/die Angestellte (adjectival)
- die Leute (plural only), das Obst (no plural)
- der/das Joghurt (alternative genders)
- der See / die See (different senses, so two lemma rows)

### 4.3 Verbs

- **Always-separable prefixes:** ab, an, auf, aus, bei, ein, fest, fort, her, hin, los, mit, nach, vor, weg, weiter, zu, zurück, zusammen, plus compounds such as heraus-, hinein-.
- **Inseparable prefixes:** be-, emp-, ent-, er-, ge-, miss-, ver-, zer-.
- **Dual prefixes** (separability depends on sense and stress): durch-, über-, um-, unter-, wider-, wieder-, hinter-, voll-.
  - Example: `übersetzen` "translate" is inseparable (`übersetzt`), while `übersetzen` "ferry across" is separable (`übergesetzt`). Store these as separate lemma rows keyed by `sense_key`.
- **Partizip II:**
  - Separable verbs: prefix + `ge` + stem (`angerufen`, `eingekauft`).
  - Inseparable verbs and `-ieren` verbs: no `ge-` (`besucht`, `verstanden`, `studiert`).
- **zu-infinitive:** separable verbs put `zu` inside (`anzurufen`); others put it before (`zu besuchen`).
- **Auxiliary:** `sein` for movement and change of state (gehen, fahren, aufstehen, einschlafen). Some verbs take both (`ich bin gefahren` / `ich habe das Auto gefahren`); store these as `both` with a sense note.
- **Case frame.** This is the verb's "Akkusativ/Dativ version" and is per-verb knowledge. Examples:
  - `helfen` jdm. (dat), `danken` jdm. (dat), `gehören` jdm. (dat), `gefallen` jdm. (dat)
  - `anrufen` jdn. (akk), `fragen` jdn. (akk)
  - `geben` jdm. etw. (dat + akk)
  - `sich erinnern an` + akk, `warten auf` + akk
- **Frame data is the weakest data source**, because Wiktionary is inconsistent here.
  - The pipeline proposes frames via Claude and validates them against Wiktionary tags where present.
  - Every frame for the top 300 verbs goes to the review queue before it is used.

### 4.4 Gender hints

Seed suffix rules. These are only mostly reliable, and the pipeline verifies them.

| Gender | Suffixes |
|--------|----------|
| die | -ung, -heit, -keit, -schaft, -ion, -tät, -ik, -ei, -ie, -ur, -enz, -anz |
| das | -chen, -lein, -ment, -um, -ma, -tum; nominalised infinitives (das Essen) |
| der | -ling, -ismus, -or, -ig, -ich; -ant/-ent for persons |

How the rules are applied:

- The pipeline measures each rule's accuracy on the actual selected lemma set.
- A rule is shown as a hint only if its accuracy is ≥ 0.90 with n ≥ 20.
- Suffix matching applies only to nouns with ≥ 2 syllables, so `der Sprung` is not treated as an -ung noun.
- A noun that contradicts an active rule gets an "Ausnahme" badge (e.g. `die Firma` against -ma → das).

---

## 5. Learning model: facets and skills

### 5.1 Lexical facets

Each facet is one FSRS card per user × lemma.

| POS | Facets |
|-----|--------|
| noun | `meaning_recv` (DE→EN), `meaning_prod` (EN→DE including article), `gender`, `plural`, `weak` (weak/mixed nouns only) |
| verb | `meaning_recv`, `meaning_prod`, `frame`, `separable` (separable or dual-prefix verbs only), `pp_aux` (Partizip II + auxiliary), `stem_change` (only if applicable) |
| adj / other | `meaning_recv`, `meaning_prod` |

`meaning_prod` unlocks when the stability of `meaning_recv` reaches ≥ 3 days (config `PROD_UNLOCK_STABILITY_DAYS`). All other facets are active from the moment the word is introduced.

### 5.2 Grammar skills

These are global per user and are also FSRS cards:

- **Case:** `case.akk.m`, `case.dat.m`, `case.dat.f`, `case.dat.n`, `case.dat.pl` (article plus -n), `case.weak_noun`
- **Prepositions:**
  - `prep.dat` (aus, außer, bei, mit, nach, seit, von, zu, gegenüber)
  - `prep.akk` (bis, durch, für, gegen, ohne, um)
  - `prep.wechsel.loc` (dative) and `prep.wechsel.dir` (accusative), for an, auf, hinter, in, neben, über, unter, vor, zwischen
- **Verbs:** `verb.sep.v2`, `verb.sep.sub` (Nebensatz), `verb.sep.perf`, `verb.sep.zu`, `verb.insep.perf`

Skills are updated by the same attempts that update lexical facets. Skills are **excluded** from the Behalten-Score (§9.2).

### 5.3 FSRS

- Use `ts-fsrs` with `request_retention` 0.90, `enable_short_term` true and fuzz on.
- Ratings used in v1: **Again, Hard, Good**. Easy is not used.
- Per implicated facet, an attempt maps to a rating as follows:
  - **Good:** correct, and latency ≤ `SLOW_FACTOR` (2.0) × the user's rolling median latency for that exercise type.
  - **Hard:** correct but slow, or correct with a tolerated stem typo, or a hint was used.
  - **Again:** wrong.
- Latency medians are computed over the last 200 attempts per user per exercise type. Below 30 attempts, use the defaults from config.
- Store the card state before and after every review in `review_log`, so any review can be rolled back (ts-fsrs supports rollback).
- Per-user FSRS parameter optimisation may be added later (after M6), for **scheduling only**. Competition scoring always uses the default parameter set (§9.2).

---

## 6. Exercises

**Common to all exercises:**

- Typed input with an umlaut key row (ä ö ü ß) above the keyboard.
- Submit opens a feedback panel showing:
  - the correct answer;
  - the user's answer with the wrong characters marked in red-pen style;
  - the noun's declension strip or the verb's forms;
  - the gender hint, if an active rule applies;
  - a "Fehler melden" button.

| id | answer type | duel-eligible |
|----|-------------|---------------|
| `kasus_luecke` | closed | yes |
| `wer_tut_was` | 2-option choice | yes |
| `satzbau` | open sentence | no |
| `umformen` | semi-open | no |
| `diktat` | typed from audio | no |
| `en_de_chunk` | closed | yes |
| `fehlersuche` | tap + closed correction | yes |
| `komposition` | open, LLM feedback | no |

1. **`kasus_luecke`.** A sentence with a gap covering determiner + noun (or a pronoun).
   - The cue gives the lemma **without its article** plus the determiner type and number, e.g. `Ich helfe ___ (Nachbar, bestimmt, Sg.).` → `dem Nachbarn`.
   - The number must be in the cue unless the sentence itself forces it. Otherwise `den Nachbarn` (dative plural) would also be a correct answer.
   - Implicates: gender, weak, the case skill, the governing verb's `frame` (if the gap is its object), and the preposition skill (if governed by a preposition).
2. **`wer_tut_was`.** A sentence in which only case marking reveals who does what, e.g. `Den Hund sieht der Mann.` The user picks between two short English paraphrases.
   - Only generate a sentence if at least one masculine singular NP makes the case unambiguous, because feminine, neuter and plural NPs look the same in nominative and accusative.
   - Implicates: `case.akk.m`, plus receptive gender of the NPs.
3. **`satzbau`.** Chunks plus a frame instruction; the user types the full sentence.
   - For separable verbs, generate all four frames: Hauptsatz (`Ich rufe morgen meine Mutter an.`), Nebensatz (`…, weil ich morgen meine Mutter anrufe.`), Perfekt (`Ich habe meine Mutter angerufen.`) and zu-infinitive (`Ich vergesse, meine Mutter anzurufen.`).
   - Answers are checked against the accepted variants.
   - If there is no match, the server asks Claude for a JSON grammaticality verdict, caches it per exact answer string, and lets the user dispute it.
4. **`umformen`.** A transformation task, e.g. singular to dative plural, Präsens to Perfekt, mit ↔ ohne, Hauptsatz to Nebensatz.
5. **`diktat`.** Audio (lemma audio file, or `speechSynthesis` de-DE for a sentence), then the user types what they heard.
   - The target NP must be exact.
   - The rest of the sentence passes if the normalised edit distance is ≤ 0.1.
6. **`en_de_chunk`.** Short phrase translation, e.g. "with the colleague" → `mit dem Kollegen`.
7. **`fehlersuche`.** A sentence containing exactly one error (wrong article, wrong case ending, or wrong separable-verb position). The user taps the wrong word, then types the correction.
8. **`komposition`.** Write 2 sentences using 3 given due lemmas (optionally with a required case, e.g. "one of them in the dative").
   - **Deterministic check:** each target lemma appears in some valid form from its form table.
   - **Claude feedback** as JSON: `{errors:[{span,type,correction,explanation_de,explanation_en}], uses_targets_correctly:{lemma_id:bool}}`.
   - **Ratings:**
     - Target lemmas used correctly → Good.
     - Misused → Again on the facet mapped from the error type (e.g. gender, case, frame).
     - Errors outside the target words are shown to the user but do not touch FSRS.

**New-word introduction** (not an exercise):

- The intro screen shows a sentence with audio, the gloss, the declension strip or verb forms, and the gender hint.
- The word reappears as a `meaning_recv` retrieval item after 3–5 other items.

---

## 7. Grading and error classification (`packages/core/grading.ts`)

### 7.1 Normalisation

- Apply Unicode NFC, trim, collapse whitespace and strip final punctuation.
- Comparison is case-insensitive. If a noun is typed lowercase, show a note but do not penalise.
- Accept `ae/oe/ue` for `ä/ö/ü` and `ss` for `ß`. Show a note but do not penalise.

### 7.2 Exactness

- **Determiners and inflectional endings must match exactly.**
- **Typo tolerance** is Damerau-Levenshtein distance 1, allowed only if all of these hold:
  - the expected word has ≥ 5 characters;
  - the edit is at a position < `len(expected) − 2`;
  - the answer's last 2 characters equal the expected word's last 2 characters.
- A tolerated typo counts as correct but gets the Hard rating and a note.
- Examples:
  - `Kolegen` for `Kollegen` → tolerated.
  - `Kollege` for `Kollegen` → **wrong**, because the ending differs.
  - `Kinder` for `Kindern` → **wrong**.

### 7.3 Error classification for a noun-phrase answer (`det'`, `noun'`)

0. **Checked first:** if the whole answer is a valid NP of the target lemma in the target case but in the other number, **and** it cannot be read as a target-number NP in any case, the class is `number_error`. Rate Again on the exercise's primary facet only.
   - Example: `den Kindern` for `dem Kind` is a `number_error`.
   - Counter-example: `den Nachbarn` for `dem Nachbarn` is also a valid accusative singular, so it falls through to step 3 as a `case_error`.
1. If `noun'` matches no form of the target lemma (after typo tolerance), the class is `wrong_word`. Rate the exercise's meaning facet Again.
2. If `det'` and `noun'` are both correct, the answer is correct.
3. If `det'` is wrong, let C be the set of (gender, case) cells that `det'` can realise within the same determiner class, **restricted to the target number**.
   - Cells with the **target gender** but a different case are *case candidates*.
   - Cells with the **target case** but a different gender are *gender candidates*.
   - Cells of the other number are excluded here; number mismatches are caught by step 0.
   - Classify as follows:
     - Only case candidates → `case_error`. Rate Again on the case skill, and on the governing verb's `frame` or the preposition skill if the gap is governed.
     - Only gender candidates → `gender_error`. Rate Again on `noun.gender`.
     - Both kinds (e.g. `der` = m.nom **or** f.dat) → `ambiguous`. Show a one-tap follow-up ("Genus von Nachbar? der / die / das"), which does not count in competition, then attribute the error according to the answer.
     - Neither kind → `det_error`. Rate Again on the case skill.
4. If `det'` is correct but the ending of `noun'` is wrong:
   - Weak noun missing `-(e)n` → `weak_error`. Rate Again on `noun.weak` and `case.weak_noun`.
   - Dative plural missing `-n` → `datpl_error`. Rate Again on `case.dat.pl`.
   - Wrong plural form in a plural context → `plural_error`. Rate Again on `noun.plural`.

Log every classification together with the raw answer.

**Required classifier tests (minimum):**

| target | answer | class |
|--------|--------|-------|
| dem Nachbarn (m, dat, weak) | den Nachbarn | case_error |
| dem Nachbarn | dem Nachbar | weak_error |
| dem Nachbarn | der Nachbarn | ambiguous |
| der Frau (f, dat) | dem Frau | gender_error |
| den Kindern (pl, dat) | den Kinder | datpl_error |
| den Tisch (m, akk) | der Tisch | case_error |
| das Auto (n, akk) | den Auto | gender_error |
| mit dem Kind (n, dat, sg) | mit den Kindern | number_error |

---

## 8. Scheduling and sessions

### 8.1 Time boundaries

- The day boundary is **03:00 Europe/Berlin** (config), so late-evening sessions count for the same day.
- A week runs Monday 03:00 → Monday 03:00.
- A month is the calendar month, using the same boundary.

### 8.2 Daily session order

1. **Duell**, if not yet played today (§9.1).
2. **Due reviews.**
   - Collect due facets and group them by lemma.
   - For each lemma, pick the exercise type that covers the most of its due facets.
   - No exercise type may exceed 40% of the session.
   - Never show the same lemma twice in a row.
   - Interleave parts of speech and themes.
3. **New words.**
   - Up to `NEW_PER_DAY` (default 5). The cap is identical for both users and counts the total across the core and personal tracks.
   - The core deck is ordered by frequency rank within thematic batches.
   - Never introduce two new lemmas with the same `semantic_field` on the same day.
4. **Komposition.** One task, if at least 3 suitable due or recent lemmas exist.
5. **Backlog mode.** If more than 150 facets are due, the app offers a reviews-only session. The new-word cap stays equal for both users either way.

### 8.3 Active day

A user has an **active day** when they played the duel **and** either cleared their due queue or did ≥ 40 reviews that day. This feeds the joint goal (§9.5).

### 8.4 Reporting errors

- "Fehler melden" sets the sentence's status to `reported`, which excludes it everywhere.
- All attempts on that sentence are voided:
  - FSRS state is rolled back from `review_log`.
  - The item is removed from both players' duel or exam scores, and any affected settlement is recomputed.
- The **Prüfen** screen lists reported items and all `needs_review` data for the two users to fix or reject.

---

## 9. Competition, chores and the joint goal

Settlement rules:

- All settlement runs server-side in cron jobs at the day boundary.
- Every settlement job is **idempotent**: results are keyed by period, and re-running a job changes nothing.
- Settled results are immutable, except through the report-voiding path (§8.4).

### 9.1 Daily Duell

**Items**

- At 03:00 the server generates **10 items, identical for both users**.
- Items come only from lemmas both users have introduced, core track only, using duel-eligible exercise types only.
- Prefer items where both users' predicted recall (R, default parameters) lies in [0.6, 0.95].
- A lemma may not reappear in a duel within 7 days.

**Play**

- The duel is played asynchronously at any time that day.
- The other user's results stay hidden until both have finished or the day ends.
- There is no feedback between items; full feedback is shown at the end.
- Duel attempts count as normal FSRS reviews.
- If a user has not played by the day boundary, they forfeit. The other user wins if they played; if neither played, there is no result.

**Scoring** (config `DUEL_MODE`; changing it requires both users' approval, §10):

- **`raw`:** score = correct count. The tiebreak is the lower total time; an exact tie is a draw.
- **`vs_expected`:** score = correct − Σ R_i, where R_i is the player's predicted recall of that item's primary facet at the time the duel was generated. The higher score wins; a difference < 0.25 is a draw.
  - Example: user A was expected to get 8.2 and got 9 (+0.8). User B was expected to get 6.1 and got 7 (+0.9). **B wins** despite fewer correct answers.
  - This mode is recommended once 14 days of review data exist, so that a level gap does not decide every duel.

**Stakes**

- Each daily win earns 1 **Stern**.
- Every `STARS_PER_S_VOUCHER` stars (default 3) earns one **S chore voucher**. Setting this to 1 makes every daily win a chore.

### 9.2 Weekly Behalten-Score

**Nightly snapshot** per user at 03:00:

```
B_u(d) = Σ over lexical facets f introduced by u :  R( Δt_f + 7 days ; S_f )
```

- `Δt_f` is the number of days since f's last review.
- `S_f` is f's current FSRS stability.
- `R` is the FSRS forgetting curve with the **default shared parameter set**. Use the ts-fsrs forgetting-curve function; do not hand-code the decay constant.

**Weekly score**

```
W_u = mean(B_u over this week's 7 snapshots) − mean(B_u over last week's 7 snapshots)
```

- In week 1 the baseline is 0.
- A missing snapshot is reconstructed from `review_log`, never skipped.
- The higher W wins; |W₁ − W₂| < 0.5 is a draw.
- **Stakes:** one **M chore voucher**.

**Why this metric:**

- Averaging 7 nightly snapshots makes Sunday-night cramming count for only one seventh.
- Skipping reviews never helps, because R keeps decaying.

**Sanity values.** Under the FSRS-5 default curve `R = (1 + 19/81 · t/S)^−0.5` with t = 7 d:

| S | R |
|---|---|
| 2 d | 0.741 |
| 10 d | 0.927 |
| 30 d | 0.974 |

FSRS-6 (which ts-fsrs uses) has a different default decay, so **regenerate the test fixtures from the library's actual curve**. Do not hard-code these numbers.

### 9.3 Monthly Monatsprüfung

- The exam window runs from the 1st to the 3rd day of the following month. Each user takes it once.
- It has **40 items, identical for both users**, sampled from core-track facets that both users introduced during the month and at least 7 days before the window opened. If fewer than 40 exist, fill with older shared facets at random.
- Duel-eligible exercise types only. There are no hints, and results are hidden until both have finished or the window closes.
- The higher percentage correct wins. A difference of ≤ 1 item is a draw. Not taking the exam in the window is a forfeit.
- **Stakes:** one **L chore voucher**.

### 9.4 Chore vouchers (Aufgaben-Gutscheine)

**Catalog**

- Table: `chore(id, size['S'|'M'|'L'], title_de, sentence_de, title_en, active)`. It is seeded from §12 and editable by both users.
- Every chore has a German instruction sentence that doubles as vocabulary, preferring separable verbs: `Du bringst heute den Müll raus.`
- The voucher shows that sentence together with the noun's declension strip and the separable split (`raus|bringen`).

**Flow**

1. Settlement creates a voucher with fields winner, loser, size, source period and status `choose`.
2. The winner picks a chore of that size within 24 h. If they don't, the server picks one at random.
3. The status becomes `open`, with a deadline of 48 h for S, 7 days for M and 14 days for L.
4. The loser marks it `done`.
5. The winner confirms it as `confirmed`. If the winner does nothing, it auto-confirms after 48 h.

**Other rules**

- Overdue vouchers are shown in red on both home screens. There is no automatic penalty.
- A draw produces no voucher.
- A **Ledger** screen shows vouchers won and received per person per month. The visible imbalance is intentional: it is the signal to renegotiate duel mode or stakes.

### 9.5 Weekly joint goal (Gemeinsames Wochenziel) and reward vouchers

**Tier.** The weekly voucher value is based on the **minimum** over both users, so one person cannot carry the other.

| Weekly voucher | Condition |
|----------------|-----------|
| 3 € | both ≥ 4 active days |
| 5 € | both ≥ 5 active days |
| 10 € | both ≥ 6 active days **and** both ≥ 3 completed `komposition` tasks |
| none | otherwise |

- The weekly maximum is 10 € (config `MAX_WEEKLY_VOUCHER_EUR`).
- The home screen shows live progress for each person, the voucher value currently secured, and the balance of banked reward vouchers (the "Gutschein-Konto").

**Issuing.** At the Monday 03:00 settlement, if a tier was reached, the server issues one `reward_voucher` with that face value and status `banked`. Nothing is drawn automatically.

**Redeeming and combining.** Combining applies to reward vouchers only; chore vouchers (§9.4) are never combined.

1. Either user starts a redemption by selecting one or more banked vouchers. The other user must confirm with "Einlösen". The total is V = sum of face values.
2. Reward bands are 3, 5, 10, 15, 20 and 30 € (config `REWARD_BANDS`). The default target band is the largest band ≤ V, but the users may pick any lower band.
3. **Change:** V − band is issued back as a new banked voucher (`source = 'change'`), so no credit is lost.
4. If the chosen band has no eligible reward after exclusions, fall back to the next lower band that has one. The change grows accordingly.

Examples:

| Selected vouchers | V | Band | Change |
|-------------------|---|------|--------|
| 3 | 3 € | 3 € | 0 € |
| 5 + 5 | 10 € | 10 € | 0 € |
| 5 + 5 + 3 | 13 € | 10 € | 3 € |
| 10 + 5 | 15 € | 15 € | 0 € |
| 10 + 10 + 5 + 5 | 30 € | 30 € | 0 € |

Other rules:

- The 15, 20 and 30 € bands are reachable only by combining vouchers.
- Banked vouchers never expire.

**Draw.** At redemption, draw one reward with `budget_eur == band`.

- Exclude rewards drawn in the last 8 weeks.
- Include `outdoor` rewards only from April to October.
- Exclude `needs_babysitter` rewards if that setting is off.
- Use uniform random selection with a seeded RNG. Store the seed with the redemption so the draw is reproducible.

**Reveal and follow-up**

- The reveal happens at redemption as one card-flip animation. It is the app's single deliberate show-off motion.
- **One reroll per redemption**, and only if both users tap "Neu würfeln".
- Status flow: `pending` (waiting for the second user's confirmation) → `drawn` → `planned` (with a date) → `done` (with an optional note).
- **Undo:** until the status reaches `planned`, both users together can undo a redemption. Undo restores the spent vouchers to `banked` and deletes the change voucher.
- Every reward carries a German mission, e.g. "Ihr bestellt beide auf Deutsch."

**Reward table:**

```
reward(id, budget_eur[3|5|10|15|20|30], kind['together'|'buy'], title_de, title_en,
       german_mission_de, season['any'|'outdoor'], needs_babysitter BOOL,
       est_cost_note, active, last_drawn_at)
```

**"Ideen vorschlagen"**

- Claude proposes 5 new rewards for a chosen band as JSON, including an estimated cost.
- They enter the pool only after both users approve.
- The UI labels all prices as estimates.

---

## 10. UI

**Visual direction: a German school exercise book (Schulheft).**

- Subtle squared-paper background.
- The user's own answers appear in royal-blue fountain-pen ink ("Königsblau").
- Errors are marked in **correction red**, on exactly the wrong characters. This is the core visual idea.
- Graphite grey for UI text.
- Do not use cream + terracotta, dark + acid green, or generic SaaS card grids.
- There is one bold moment only: the reward reveal at redemption.
- No gender colour-coding anywhere.

**Typography.** Choose deliberately. One suggestion: Fira Sans for the UI and a readable serif for German example sentences.

**Screens**

- **Heute:** duel card, due count, new words, joint-goal progress, open vouchers, week standings.
- **Session:** the exercise runner and feedback panel.
- **Duell**
- **Wort:** lemma detail with declension table, verb forms, example sentences and a stability bar per facet.
- **Wettbewerb:** daily, weekly and monthly results, plus the ledger.
- **Wochenziel:** weekly progress, the Gutschein-Konto (banked reward vouchers), select-and-combine redemption, reward reveal, history.
- **Aufgaben:** chore vouchers.
- **Einstellungen:** settings, catalogs, personal tracks, import.
- **Prüfen:** review queue.

**Settings that require dual approval:** `NEW_PER_DAY`, `DUEL_MODE`, `STARS_PER_S_VOUCHER`, the tier thresholds and voucher values, and `REWARD_BANDS`.

- A proposed change stays pending until the other user approves it.
- It takes effect at the next day boundary.

**Quality floor**

- Large tap targets and the umlaut key row.
- Visible focus states, `prefers-reduced-motion` respected, WCAG AA contrast.
- Online-only in v1, but the app is installable as a PWA.

---

## 11. Content pipeline (`pipeline/`)

Each step below is a CLI command and writes a report.

1. **`download`.** The kaikki.org German dictionary JSONL, extracted from English Wiktionary with wiktextract. Find the current raw-data link on kaikki.org. Stream-parse the file; never load it whole.
2. **`select`.**
   - Rank lemmas by frequency using the Python `wordfreq` package (`de`).
   - Take lemmas only, not inflected forms.
   - v1 target: 2,000 core lemmas (config).
   - Exclude proper nouns, abbreviations and vulgar words.
3. **`extract`.**
   - Nouns: gender(s), plural, form tables (tags nominative/accusative/dative/genitive × singular/plural).
   - Verbs: separability, auxiliary, Partizip II, Präteritum, present 2sg/3sg.
   - All: audio URLs and glosses.
   - Split a lemma into separate rows when gender or separability differs by sense.
4. **`crosscheck`.** Compare the extracted tables against the TypeScript rule engine through a small CLI (`pnpm core:decline --json`). Mismatches become `needs_review` with a reason.
5. **`gender_rules`.** Compute each suffix rule's accuracy on the selected set and write the `gender_rule` table.
6. **`enrich`** (Claude, temperature 0, JSON schema). Per lemma: `semantic_field`, `theme`, a verb frame proposal and a CEFR hint.
7. **`sentences`** (Claude). Per (lemma, target facet or skill): 3 sentences using A2–B1 vocabulary, each with a gap spec, accepted variants, an English translation and the allowed exercise types.
8. **`validate`.**
   - The expected answer, recomputed from the form tables, must equal the LLM's answer.
   - `wer_tut_was`: an unambiguous masculine singular NP must exist.
   - `fehlersuche`: exactly one token differs from a valid sentence.
   - On rejection, regenerate up to 2 times; after that, drop the sentence.
9. **`audio`.** Download lemma audio (mp3) into `apps/web/public/audio/` and write `ATTRIBUTION.md` covering the Wikimedia Commons licences.
10. **`export`.** Produce:
    - `content.sqlite` (core track);
    - `dictionary.sqlite` (all German nouns and verbs with forms, used for personal-track lookups);
    - a JSON report with counts, rejection rates and the `needs_review` list.

**Server import.** The server imports content on startup when the content version has changed. User data is never touched.

**API budget.** Before any generation run, print an estimated token count and require `--yes`.

### Personal tracks and EPUB import

- Import accepts CSV/JSON rows of `word, sentence, source`. This covers words looked up in Marcel's Android EPUB reader.
- For each row, the server looks the word up in `dictionary.sqlite` and creates a personal lemma with the user's sentence as its first context sentence.
- Further sentences are generated on demand, using the same validation as the pipeline.
- Personal-track lemmas **never** appear in the duel or the monthly exam. They do count toward the Behalten-Score and the `NEW_PER_DAY` cap.

---

## 12. Seed catalogs

These are editable in the app. **Prices are estimates;** adjust them to local reality.

### Chores

**S** (from duel stars):

- Spülmaschine ausräumen: *Du räumst heute die Spülmaschine aus.*
- Müll rausbringen: *Du bringst den Müll raus.*
- Wäsche aufhängen: *Du hängst die Wäsche auf.*
- Pfandflaschen wegbringen: *Du bringst die Pfandflaschen weg.*
- Tisch abräumen: *Du räumst nach dem Essen den Tisch ab.*

**M** (weekly):

- Bad putzen: *Du putzt heute das Bad.*
- Wohnung saugen: *Du saugst die ganze Wohnung.*
- Betten neu beziehen: *Du beziehst die Betten neu.* (inseparable, a useful contrast)
- Wocheneinkauf: *Du kaufst für die Woche ein.*
- Kühlschrank auswischen: *Du wischst den Kühlschrank aus.*

**L** (monthly):

- Küche gründlich: *Du putzt die Küche gründlich, auch den Backofen.*
- Fenster: *Du putzt alle Fenster.*
- Bad Grundreinigung: *Du machst eine Grundreinigung im Bad.*
- Abstellraum: *Du räumst den Abstellraum auf.*

### Rewards

Bands 15, 20 and 30 € are reachable only by combining vouchers.

**3 €**

- together: Stadt-Land-Fluss-Abend (0 €). Mission: *Nur deutsche Wörter.*
- together: Abendspaziergang (0 €). Mission: *Jede/r beschreibt zehn Dinge auf Deutsch.* (outdoor)
- buy: ein deutsches Rätselheft (~3 €).
- buy: zwei Brezeln vom Bäcker (~3 €). Mission: *Ihr bestellt auf Deutsch.*
- buy: ein Pixi-Buch (~1–2 €). Mission: *Ihr lest es euch gegenseitig vor.*

**5 €**

- together: Kartoffelpuffer nach deutschem Rezept kochen (~4 € Zutaten). Mission: *Ihr lest das Rezept laut vor.*
- buy: eine Kugel Eis für jeden. Mission: *Ihr bestellt auf Deutsch.* (outdoor)
- buy: zwei Teilchen vom Bäcker. Mission: *Ihr bestellt auf Deutsch, „zum Mitnehmen".*

**10 €**

- buy: Kuchen vom Konditor für Kaffee und Kuchen zu Hause.
- together: Käsespätzle selbst machen (~8–10 €).
- together: Flohmarkt mit 10 € Budget. Mission: *Ihr handelt nur auf Deutsch.* (outdoor)
- buy: ein deutsches Comicheft. Mission: *Ihr lest eine Geschichte gemeinsam.*

**15 €**

- together: Minigolf zu zweit (check local price). (outdoor)
- together: Wochenmarkt-Einkauf für ein deutsches Gericht. Mission: *Ihr kauft nur auf Deutsch ein.*

**20 €**

- together: Döner- oder Pizza-Abend (Abholung). Mission: *Am Tisch wird nur Deutsch gesprochen.*
- together: Kaffee und Kuchen im Café (check locally). `needs_babysitter` = true.
- buy: ein deutsches Wort- oder Brettspiel (≤ 20 €). Mission: *Ihr erklärt euch die Regeln auf Deutsch.*
- together: Museumsbesuch zu zweit. `needs_babysitter` = true.
- buy: ein deutsches Hörbuch.

**30 €**

- together: Kino zu zweit, ein deutscher Film ohne Untertitel. `needs_babysitter` = true.
- together: Bowling zu zweit (check local price). Mission: *Ihr zählt die Punkte auf Deutsch.* `needs_babysitter` = true.

---

## 13. User-data tables

```
user(id, name, pw_hash, ui_lang)
facet_card(user_id, facet_key, lemma_id NULL, skill_id NULL, fsrs JSON,
           introduced_at, unlocked BOOL)           -- facet_key: 'lemma:{id}:{facet}' | 'skill:{id}'
review_log(id, user_id, facet_key, attempt_id, rating,
           card_before JSON, card_after JSON, ts, voided BOOL)
attempt(id, user_id, sentence_id, exercise_type, answer_raw, correct,
        error_class, latency_ms, context['session'|'duel'|'exam'], ts, voided BOOL)
duel(id, date, items JSON, mode, settled_at)
duel_result(duel_id, user_id, correct, expected_sum, total_ms, finished_at, forfeit BOOL)
exam(id, month_key, items JSON, opens_at, closes_at, settled_at)
exam_result(exam_id, user_id, correct, total, finished_at, forfeit BOOL)
snapshot(user_id, date, b_value)
period_result(period_key, kind['day'|'week'|'month'], winner_user_id NULL,
              draw BOOL, details JSON, settled_at)
star(user_id, period_key, consumed_by_voucher_id NULL)
voucher(id, from_period, winner_id, loser_id, size, chore_id NULL,
        status['choose'|'open'|'done'|'confirmed'], deadline, created_at, updated_at)
coop_week(week_key, tier_eur NULL, details JSON, voucher_id NULL, settled_at)
reward_voucher(id, value_eur, source['week'|'change'], week_key NULL,
               status['banked'|'spent'], redemption_id NULL, created_at)
redemption(id, voucher_ids JSON, total_eur, band_eur, change_voucher_id NULL,
           reward_id NULL, rng_seed, rerolls_used, started_by, confirmed_by NULL,
           status['pending'|'drawn'|'planned'|'done'|'undone'], planned_for, note, created_at)
setting(key, value, pending_value, proposed_by, approved_by, effective_from)
report(id, user_id, sentence_id, reason, status, created_at)
push_subscription(user_id, endpoint, keys JSON)
```

---

## 14. Milestones and acceptance criteria

- **M0: Scaffold and core.**
  - Build: monorepo, strict TS, lint, vitest, CI script; in `packages/core`, the determiner tables, declension engine, normaliser, grading and error classifier.
  - Acceptance: the golden noun tests (§4.2) and classifier tests (§7) pass.
- **M1: Pipeline on 200 lemmas.**
  - Build: every step from `download` to `export`, plus the mismatch report.
  - Acceptance: Marcel reviews the report, and the mismatches turn out to be real data problems rather than engine bugs.
- **M2: Server core.**
  - Build: auth, migrations, content import, FSRS integration, the session queue builder, and the attempt endpoint (grade → classify → rate → update cards → log with rollback).
  - Acceptance: API tests with a fake clock simulating 30 days pass.
- **M3: Web.**
  - Build: login, Heute, and the session runner with `kasus_luecke`, `wer_tut_was`, `umformen`, `en_de_chunk` and `fehlersuche`; the feedback panel, the Wort screen and the report button.
  - Acceptance: a full session completes on a phone.
- **M4: Content at scale.**
  - Build: sentence generation for all 2,000 lemmas, the `satzbau` and `diktat` exercises, and the Prüfen screen.
- **M5: Competition.**
  - Build: duel, snapshots, weekly and monthly settlement, stars, vouchers, joint-goal tiers, reward vouchers (issue, combine, change, redeem, reveal, reroll, undo), dual-approval settings and the ledger.
  - Acceptance: a simulation of two synthetic users over 90 days passes. It must include both DST switches (last Sunday of March and of October), forfeits, draws, report voiding with re-settlement, idempotent re-runs of every settlement job, and voucher combination with change (including the band-fallback case and undo).
- **M6: Remaining features.**
  - Build: `komposition` with Claude feedback, personal tracks and EPUB import, and Web Push (duel reminder at 19:00 if not yet played; voucher deadlines).
  - Deployment: Docker Compose + Caddy, backups, and a README with operations notes.

---

## 15. Out of scope for v1

- Offline mode, native apps, more than two users.
- Speech recognition.
- Adjective-declension exercises (adjectives get meaning facets only).
- Genitive training.

---

## 16. Open questions (ask Marcel; do not assume)

1. Hosting target (VPS provider or home server) and domain name.
2. The second user's current German level, which sets her starting point in the core deck and whether her UI starts in English.
3. Whether English glosses work for both users, or the second user needs another gloss language.
4. Whether daily duel wins should produce chores directly (`STARS_PER_S_VOUCHER = 1`) or via stars (default 3).
5. Whether `DUEL_MODE` should start as `raw` and switch to `vs_expected` after 14 days (the recommended default).
