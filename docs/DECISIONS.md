# Decisions

Decisions taken on top of [SPEC.md](SPEC.md), agreed with Marcel on
2026-09-26 ("defaults ok"). Later changes are appended with a date.

## Answers to the spec questions

1. **DE→EN recall gets its own exercise, `bedeutung`.** The German word is shown
   in a sentence, and the user types the English meaning. Answers are matched against
   the Wiktionary glosses and their English WordNet synonyms (US/UK spelling, a
   leading "to"/"the"/"a" ignored). A rejected answer can be disputed. It is not
   duel-eligible. `meaning_recv` is exercised by `bedeutung`.
2. **A later starting point uses placement.** Core-deck words before a user's
   starting point are introduced in bulk after a short typed placement check, so
   they have FSRS cards and count as introduced. On a day with fewer than 10
   eligible shared duel items there is no duel: no result and no forfeit, and
   "played the duel" is dropped from that day's active-day condition.
3. **On a wrong answer, only blamed facets are rated.** The facets the error class
   names get Again. The other implicated facets are left unrated and stay due.
   This never rewards a lucky guess.
4. **`komposition` moves from M6 to M4**, next to `satzbau`. This makes the 10 €
   tier reachable by M5.

## Open questions from SPEC §16 (answered 2026-09-26)

- **Starting level: both A2.1.** Both users run the same placement check over the
  A1 part of the core deck (frequency rank below `PLACEMENT.START_RANK`). Words
  they pass get FSRS cards and count as introduced. Words they fail go back into
  the normal new-word queue. Both decks therefore stay nearly identical, so duels
  have shared items from day one.
- **Glosses: English for both users.** The UI still defaults to German with a
  per-user English toggle.
- **Stars: 3 duel wins per S chore** (`DUEL.STARS_PER_S_VOUCHER = 3`, the default).
- **Duel mode: starts as `raw`** (plain correct count). After 14 days of review
  data, the app suggests `vs_expected`. The switch still needs both users'
  approval, as for any dual-approval setting.
- **Hosting and domain:** still open, needed only for M6.

## No paid AI services (2026-09-26)

The project uses no Claude API or other LLM API. SPEC.md has been updated to
match:

- **Sentences** come from Tatoeba and Wiktionary examples, parsed locally with
  spaCy. Each gap is validated against the form tables, and a sentence is dropped
  on any disagreement.
- **Semantic fields** come from OdeNet and Wiktionary categories.
- **CEFR hints** come from the frequency band.
- **Verb frames** come from Wiktionary tags plus corpus counts, and all go to review.
- **`satzbau` and `bedeutung`** accept only known variants, and anything else can be disputed.
- **`komposition`** gets the deterministic target check, a self-hosted
  LanguageTool, and **partner review** (Marcel: yes).
- **Disputes ("Das stimmt doch!")** are approved or rejected by the **other
  user**, never by the person who disputed (Marcel: other person). An approved
  dispute adds the answer to the accepted variants and regrades the attempt
  through the report-voiding path.
- **Rewards** are added by hand: one user proposes, the other approves. The
  Claude "Ideen vorschlagen" feature is gone.

## Implementation decisions

- **ae/oe/ue and ss.** The answer is aligned against the expected form with
  transliterations as free operations. The answer is never rewritten, so
  `Mauer` never becomes `Maür`. A note is still shown.
- **Typo tolerance is off when the typed noun is itself a form of the lemma.**
  For example, `Mutter` for `Mütter` is one substitution before the ending, but it
  is the singular. It is therefore graded as a grammatical error.
- **Adjectival nouns** store their forms per declension type (weak after der-words,
  mixed after ein-words, strong without a determiner) and per gender.
  `der/die Angestellte` is one lemma: masculine, with a feminine alternative.
- **Weak nouns** take their oblique singular from the plural (`Nachbar` →
  `Nachbarn`, `Student` → `Studenten`), because `-n` vs `-en` depends on stress.
  `Herr` → `Herrn` is the only listed irregular form.
- **Dative plural** also leaves Italian `-i` plurals unchanged (`den Celli`),
  alongside the spec's Latin/Greek `-a`.
- **Genitive singular** of strong masculine/neuter nouns is displayed only from
  stored data, never guessed. The engine checks stored forms for plausibility.
- **Two mistakes in one answer.** An answer that is wrong in both the determiner
  and the noun ending gets both classes (`den Nachbar` for `dem Nachbarn` gives
  `case_error` + `weak_error`). This applies only when the noun does not simply
  follow the user's own case choice (`die Kinder` for `den Kindern` is only a
  `case_error`).
- **Extra error classes** beyond §7.3:
  - `prep_error`: wrong preposition in an `en_de_chunk` answer.
  - `ending_error`: a form of the lemma with the wrong ending, e.g. `dem Kinde`.
  - `extra_words`: more than determiner + noun.
  - `no_answer`: an empty answer.

  All rate Again on the primary facet, or on the preposition skill for
  `prep_error`.

- **Contractions** (`zum`, `im`, `ins`, …) are accepted and expanded before
  grading. The expected answer is shown with the contractions standard German
  prefers.
- **Voiding a review that is not the card's latest.** ts-fsrs can only roll back
  the latest review, so the log rows are voided and the card's remaining reviews
  are replayed from its initial state. Weekly Behalten snapshots already taken
  are not recomputed; duel and exam results are (§8.4).
- **Locked `meaning_prod` facets** count toward the Behalten-Score only once they
  are unlocked.
- **Hint.** A "Tipp" reveals the noun's first letter, never the article. It is not
  available in the duel or the exam.
- **Lemma ids** stay stable across content versions, so re-imports never orphan
  user cards.
- **Tooling.**
  - TypeScript 6.0: typescript-eslint does not support 7.x yet.
  - Node 22.12+: Vitest 5 requires it, and Node 20 is end-of-life.

## M1 pipeline (2026-09-26)

- **Trial size: 500 lemmas** (Marcel), picked by frequency.
- **Frequency method.** wordfreq gives each word form's frequency, but it
  ignores case and part of speech. So each form's frequency is split over its
  readings as spaCy finds them in context across the whole Tatoeba corpus.
  Without this, `einen` counted for the verb "to unite" and `mal` for `malen`.
  - Readings count only when the form is one of the lemma's Wiktionary forms,
    which catches lemmatiser errors.
  - Swiss spellings credit their standard form (`gross` → `groß`).
  - An adjective and its adverb use are one lemma (`gut`).
- **Deck parts of speech: nouns, verbs, adjectives, adverbs.** Articles,
  pronouns, prepositions and conjunctions are grammar skills, not deck words.
- **Dative plural rule, refined from the spec.** `-n` attaches only to plurals
  ending in `-e`, `-el` or `-er`. Every other plural stays unchanged. The spec's
  rule ("unless -n/-s, except -a") turned the zero plurals used after numerals
  into `Euron`, `Stückn` and `Jahrn`. Wiktionary lists `mit zehn Euro` and
  `zwei Stück` as standard.
- **Genitive plausibility is lenient.** `-s`, `-es`, unchanged, or `-ses` after
  a final s are all accepted, because the choice depends on stress. The stricter
  guess rejected `Beispieles`, `Königes` and `des September`. The genitive is
  display-only and always comes from Wiktionary.
- **Archaic dative `-e`** is dropped from Wiktionary tables even when unmarked:
  both `lemma+e` and the `-es` genitive without its final s (`dem Ergebnisse`).
- **Nonstandard forms are dropped from the stored tables.** These are forms
  tagged archaic, obsolete, rare, poetic, colloquial, regional or alternative,
  and alternatives labelled on the headword line.
- **Wiktionary's own "mixed" label** (`der See`) differs from the spec's mixed
  declension (`der Name`, `das Herz`), so it is ignored. The spec's mixed means
  weak endings plus a genitive in `-ns`.
- **Senses split** into separate rows when gender or separability differs
  (`der/das Teil`, `der/das Moment`).
- **Exercise types generated in M1:**
  - `kasus_luecke` (determiner + noun gaps checked against the form tables)
  - `fehlersuche` (one determiner swapped for one that fits no cell of the noun)
  - `bedeutung`

  The others need templates and come in M4. Only `ok` lemmas get sentences.

- **Gender hints:** none are active at 500 lemmas, because no suffix reaches
  n ≥ 20. They will become active as the deck grows toward 2,000.
- **Wikimedia requests** send a descriptive User-Agent, run at most one per
  second, and back off on 429. A recording without licence data is not used.
- **github.com is unreachable** from the build environment, so OdeNet is not
  used yet. Semantic fields come from Wiktionary topic categories only, and about
  two thirds of lemmas have none. An empty field never blocks introduction.

## M1 review (2026-09-26)

Marcel delegated the review of the M1 report to Claude. The decisions live in
`pipeline/review/decisions.json`, and the pipeline applies them on every run.

- **Noun table mismatches: all five were data problems, not engine bugs.** The
  engine bugs found during M1 were fixed before this review (see above).
  - `Mann`, `Thema`, `der Ort`, `Junge`: the stored table keeps only the
    standard plurals. The dropped ones are an obsolete `Mann`, the variants
    `Themas`/`Themata`, the specialised `Örter`, and the colloquial
    `Jungs`/`Jungens`. `das Ort` (mining) keeps `Örter`.
  - `Herz`: Wiktionary's table is accepted, so both `dem Herzen` and
    `dem Herz` count as correct.
- **All 127 verb frames reviewed and approved.** Modal verbs, the copula and
  intransitive verbs get an empty frame and therefore no frame facet.
  Prepositional objects are recorded, e.g. `warten auf + Akk`,
  `denken an + Akk`.
- **M1 is accepted.**
- **The word database `apps/server/content/content.sqlite` (about 1.5 MB) is
  committed** so the server needs no pipeline run. `dictionary.sqlite` (59 MB)
  stays out of git; it is rebuilt with
  `python -m wortduell_pipeline all`.

## M2 server core (2026-09-26)

- **Stack.**
  - Fastify 5 with `better-sqlite3` and plain SQL migrations (`apps/server/migrations`).
  - Passwords are hashed with argon2 (`@node-rs/argon2`).
  - Login sessions are random tokens, stored hashed, in an httpOnly,
    SameSite=Lax cookie that is Secure by default and lasts 30 days
    (`OPS.SESSION_TTL_MS`).
  - Login is rate-limited to 5 failures per 15 minutes, per name and per address.
- **Time.** The learning day, week and month come from `packages/core/src/time.ts`
  (03:00 Europe/Berlin, DST-safe). Business code only gets time from an injected
  `Clock`.
- **Content import** upserts by stable id on startup when `content_version`
  changes. Rows missing from a new version are retired, not deleted. A reported
  sentence keeps its status.
- **Cards.**
  - One card per facet is created on introduction, and skill cards are created on
    first use.
  - `meaning_prod` unlocks when `meaning_recv` stability reaches 3 days.
  - Every review stores the card before and after.
  - Voiding replays a card's remaining reviews.
- **Queue.**
  - For each lemma, the sentence covering the most due facets and skills is
    chosen, preferring sentences the user has not seen recently.
  - No exercise type may exceed 40% of the session, with a minimum of 2 per type
    so short sessions still work. A lemma whose only fitting type is full waits
    for the next session.
  - Parts of speech are interleaved, and the same lemma never appears twice in a
    row.
  - Due facets that no available exercise type can train yet (e.g. `pp_aux`
    before `satzbau` exists, `meaning_prod` before `en_de_chunk` exists) still get
    cards but stay out of the queue. They are reported as `untrainable`.
- **New words.**
  - New words come in frequency order, skipping a semantic field already
    introduced that day. Thematic batching arrives with themes from M4.
  - Only words with a `bedeutung` sentence are introduced.
  - The first retrieval follows 3–5 items later. When the session is too short
    for that gap, the intro moves earlier.
- **`fehlersuche`, wrong answer:** Again on the sentence's target facet only.
- **Placement.**
  - `GET/POST /api/placement` samples every 5th core word below rank 500.
  - A passed sample introduces its block of 5 words, each card seeded with one
    Good review. A failed sample leaves the block in the normal queue.
  - Placement runs once per user and does not count toward `NEW_PER_DAY`.
- **Not yet built:**
  - pronoun gaps in `kasus_luecke` (the pipeline generates none yet)
  - duel and exam contexts (M5)
  - disputes (M4)

## M3 web (2026-09-26)

- **Stack.**
  - Vite 8, React 19 and vite-plugin-pwa (generateSW).
  - The app shell and Latin font subsets are precached (about 450 KB). The API
    is never cached (online-only v1).
  - The server serves the built app (`WEB_DIST`), so one process is enough.
- **Look (spec §10).**
  - Squared paper (5 mm grid).
  - The learner's answers are in Königsblau `#1d3fa6` (Literata italic).
  - Correction red `#c20e2b` marks only the wrong or missing characters.
  - The interface text is graphite `#33363b` in Fira Sans. Fonts are
    self-hosted via Fontsource, not Google.
  - No gender colours, no decorative motion. The reward reveal (M5) will be the
    only animation.
- **Exercises in the runner:** `kasus_luecke`, `fehlersuche` and `bedeutung`,
  which are the types M1 content provides. `wer_tut_was`, `umformen` and
  `en_de_chunk` arrive with their content in M4.
- **Hint.** "Tipp" shows the first letter of the expected English meaning in
  `bedeutung` and counts as Hard. `kasus_luecke` has no hint, because the cue
  already names the noun.
- **Heute counts** due exercises (one per word), not due cards.
- **`CLOCK_OFFSET_MS`** shifts the server clock, for development and the
  end-to-end test only. The server logs a warning when it is set.
- **Acceptance.** `pnpm e2e` plays placement plus a day-1 and a day-3 session on
  an emulated Pixel 7 (touch, 412 px wide) against the real server. It covers
  all three exercise types, one deliberate mistake with red marks, and the Wort
  overlay. Marcel's check on a real phone is still open.

## M4 content at scale (2026-09-26)

- **2,000 lemmas.** `WORTDUELL_LEMMAS` defaults to `CORE_LEMMA_TARGET`. The run
  gives 2,032 rows (977 nouns, 490 verbs, 363 adjectives, 202 adverbs; a few
  words are both adjective and adverb) and 18,282 exercise sentences. The
  active gender rules are only -ung and -ion, because the others miss the
  dataset-accuracy threshold.
- **Review (delegated to Claude).** Noun disagreements between Wiktionary and
  the engine are decided in `pipeline/review/decisions.json`, keyed by
  `"Word (gender)"` so homographs such as der/das Ort stay apart. Frames of the
  300 most frequent verbs were reviewed and approved. The remaining 190 frames
  stay `needs_review` and appear in Prüfen with corpus counts, and only an
  approved frame gets a `frame` card.
- **Templates, not free generation.** The new types come from Tatoeba
  sentences plus deterministic templates over the stored forms, with no
  invented grammar (spec §0):
  - `en_de_chunk` (3,952): an English gloss of a Tatoeba noun phrase. The
    answer is graded like `kasus_luecke` and trains `meaning_prod`, so it
    only comes up after that facet unlocks.
  - `umformen` (1,496): dative plural, Perfekt and du-form, all from stored
    forms.
  - `satzbau` (165): verbs with an approved frame, in four frames
    (Hauptsatz, weil-Nebensatz, Perfekt, zu-Infinitiv). Verbs that make
    unnatural sentences are excluded in `review/templates.json`.
  - `wer_tut_was` (94): object-first sentences from a curated list of 47
    animate nouns and 25 verbs, each with an English 3sg form.
  - `diktat` (1,597): short Tatoeba sentences, spoken by the browser's
    speech synthesis (normal and slow). Grading tolerates slips up to
    `DIKTAT_MAX_NORMALISED_DISTANCE`, but the target word must be right.
- **Graders (core `grading-other.ts`).** `gradeClosed` (en_de_chunk, umformen)
  compares normalised whole answers. `gradeSentence` (satzbau) also ignores
  commas and a leading or trailing full stop. `gradeDiktat` is described
  above.
- **Ratings reported back** are only those that reached an unlocked card
  (locked `meaning_prod`, for example, is left out). The API response and
  review_log now always agree.
- **Disputes ("Das stimmt doch!").** Any wrong answer except `wer_tut_was` can
  be disputed, with an optional note, and only the other person decides.
  Approving:
  - adds the answer to `accepted_extra`, which survives content re-imports
    and applies to both users;
  - marks the attempt correct;
  - voids its reviews and logs Good, at the original time, on every facet the
    attempt rated and every unlocked facet a right answer would have rated;
  - then replays the affected cards.

  Rejecting changes nothing.

- **Komposition (spec §6.8).** At most one a day, at the end of a normal
  session. It uses three due or recently introduced lemmas (noun, verb,
  adjective), and "one noun in the dative" is added whenever a noun is among
  them.
  - The check is deterministic. Each target must appear in one of its stored
    forms (`lemma_form` table), and a dative is recognised from the
    determiner or contraction in front of the noun.
  - LanguageTool runs only when `LANGUAGETOOL_URL` is set. Its findings on a
    target word blame gender (agreement rules) or meaning.
  - Ratings: a missing target is Again on meaning; a missing dative is Again
    on `case.dat.<gender>`; otherwise Good.
  - The other person then marks mistakes in Prüfen (the wrong part, its type
    and the correction). A mark on a target word adds Again on the facet its
    type maps to: gender, case, frame, ending (weak nouns) or otherwise
    meaning. The reviews carry `review_log.komposition_id`.
- **Prüfen** lists:
  - the other person's open disputes and unreviewed kompositions;
  - open reports (reject brings the sentence back, fixed keeps it out);
  - verb frames awaiting review (approving adds the frame card for everyone
    who knows the verb);
  - lemmas marked `needs_review`;
  - your own disputes with their status.

  Long lists show 5 items and a "show all" button.

- **Acceptance.**
  - Server tests cover every new exercise type, disputes (other person only,
    regrade, answer accepted for the partner, reject), komposition (checks,
    LanguageTool stub, once a day, partner review ratings), frame approval
    and report rejection.
  - The 30-day simulation passes on the 2,000-lemma content.
  - `pnpm e2e` plays umformen, diktat and wer_tut_was among the older types,
    two kompositions, and one dispute. The partner, on a second emulated
    phone, rejects that dispute and corrects a komposition in Prüfen.

## M5 competition (2026-09-27)

- **Settlement job.** `Competition.tick(now)` runs every minute in the server
  and before every competition request. For each completed learning day it:
  - takes the Behalten snapshots;
  - settles the duel;
  - on Sundays settles the week and the joint goal;
  - on the last day of an exam window settles the month.

  It then makes sure today's duel (and, in its window, the exam) exists and
  runs the voucher timers. Every step is keyed by its period and skips work
  already stored, so re-running from the epoch changes nothing; the
  simulations check this by comparing every settlement table before and
  after.

- **Epoch.** The competition starts on the learning day on which both users
  have finished (or skipped) placement. Week 1 is the week containing that
  day, with baseline 0, and only its days from the epoch count.
- **Duel items.**
  - Items come from sentences of the four duel-eligible types, one per
    lemma. Both users must have introduced the lemma, and the item's primary
    facet must be unlocked for both, so `en_de_chunk` appears only once
    `meaning_prod` has unlocked.
  - The shuffle is seeded by the day, so the pick is reproducible. Items
    with both users' R in [0.6, 0.95] come first; the rest follow by
    closeness to that band.
  - A lemma used in the last 7 days' duels is skipped.
  - If no item qualifies, today's duel row is stored empty and means "no
    duel today". It is generated on the day's first request or tick.
- **Duel play.**
  - Answers go in order, and each is a normal attempt (context `duel`, an
    FSRS review) without feedback in the response. The feedback is stored
    and shown for every item at the end, with report and dispute.
  - The other user's score stays hidden until both have finished or the day
    has ended.
  - A player who never started forfeits. A started but unfinished duel
    counts the answers given.
  - An ambiguous determiner's gender follow-up can be answered in the
    end-of-duel feedback. It only moves the FSRS blame, never the score.
- **`vs_expected` example.** With the 0.25 draw margin, the spec's example
  (+0.8 against +0.9) is a draw rather than a win for B. The rule is
  implemented as written, and the tests use +0.8 against +1.1 for the win.
- **Monatsprüfung.**
  - The exam is generated when its window opens (days 1–3 of the next
    month). It has 40 items: facets both users introduced during the month
    and at least 7 days before the window, topped up with older shared
    facets.
  - The draw rule is at most 1 item apart, since both answer the same items.
  - Not playing is a forfeit.
- **Re-settlement (spec §8.4).** A report of a duel or exam sentence
  removes that item from both players' scores (reported items and voided
  attempts do not count). An approved dispute regrades the attempt. Either
  one recomputes the affected round. If the winner changes:
  - the old winner's star is revoked and the new winner gets one;
  - an S voucher paid for by a revoked star is voided while nobody has
    worked on it yet. A chore already done stays done.
  - The monthly L voucher follows the same rule.
  - Weekly Behalten snapshots are not recomputed.
- **Stars.** Every `STARS_PER_S_VOUCHER` unspent stars (the setting in
  effect at settlement) become an S chore voucher for the star owner.
- **Active day.** A user has one when they finished the duel (waived on a
  day without a duel) and either cleared the queue or did at least 40
  session or duel reviews.
  - "Cleared" is recorded when Heute finds no due exercises.
  - Kompositions count by their day.
- **Chore catalog words.** The chore nouns and verbs (Müll, rausbringen, …)
  are not in the 2,000-word deck. The pipeline copies their Wiktionary
  entries into a `catalog_word` table (`pipeline/review/catalog_words.json`),
  so the voucher shows the stored declension strip and the separable split
  (`raus|bringen`), with no grammar invented.
- **Voucher timers.** An unpicked voucher gets a seeded random chore of its
  size 24 h after settlement, with its deadline counted from then.
  Auto-confirm happens 48 h after `done`.
- **Rewards.**
  - The seed catalog (§12) has an empty German mission where the spec gives
    none, and the users can edit this.
  - `BABYSITTER_AVAILABLE` is a shared switch without approval, because the
    spec does not list it among the dual-approval settings.
  - The draw uses a crypto-random seed stored on the redemption.
    Reproducibility from the stored seed is tested.
  - A reroll draws again in the same band and never draws the current
    reward. It needs both users to tap.
  - The starter can withdraw a pending redemption alone, since nothing has
    been drawn yet. Undo after the draw needs both users and is refused once
    the change voucher has been used.
- **Dual-approval settings.** `NEW_PER_DAY`, `DUEL_MODE`,
  `STARS_PER_S_VOUCHER`, `COOP_TIERS` and `REWARD_BANDS` are stored as a
  history of values with their `effective_from` (the next day boundary
  after approval). Each job reads the value in effect at its instant.
- **UI.**
  - The bottom navigation is Heute · Wettbewerb · Ziel · Aufgaben · Mehr.
    Mehr holds the settings, the reward and chore catalogs, and the link to
    Prüfen.
  - The reward reveal is the only animation: a card flip, switched off
    under `prefers-reduced-motion`.
- **Acceptance.**
  - `test/competition-sim.test.ts` runs two synthetic users 90 days from
    2027-02-01 (spring DST switch, two exam windows including a forfeit).
    It also runs them 30 days from 2026-10-12 (autumn switch, one exam).
  - Both runs cover forfeits, no-result days, draws (raw and
    `vs_expected`), a report that flips a settled duel and moves its star,
    and a dual-approved mode change. They also cover chore vouchers through
    every state (including the server's pick and auto-confirm) and
    idempotent re-runs.
  - The 90-day run ends by combining the banked reward vouchers (40 €):
    30 € falls back to 20 € without a babysitter, with 20 € change. Undo
    then restores every voucher and removes the change.
  - `pnpm e2e` plays the same on emulated phones.

## Scope change before M6 (2026-09-27)

Marcel: no audio, and no personal word lists for now.

- **Recorded audio removed.** The pipeline's `audio` step (Wikimedia Commons
  recordings) and the play buttons on the intro and Wort screens are gone.
  Migration `004_no_audio.sql` drops the `audio` table and
  `sentence.audio_url`. The service worker no longer caches audio.
- **`diktat` stays** (Marcel's choice). It never used recordings: the
  browser's German speech synthesis reads the sentence.
- **Personal tracks and EPUB/CSV import** are out of scope (SPEC §15).
  `lemma.track` stays `core` everywhere. `dictionary.sqlite` still feeds the
  chore catalog's words.
- **M6** was then replaced by Pages mode (next section).

## Pages mode: no server (2026-09-27)

Marcel: run on GitHub Pages alone; one shared password, a "who are you"
screen, no reminders, no LanguageTool; the two users trust each other.

- **The server became an engine.** `apps/server` moved to `packages/engine`.
  The services and their SQL are unchanged. Fastify, logins, argon2,
  sessions and LanguageTool are gone, and the routes became an in-process
  router (`engine.call(user, method, path, body, now)`). The engine runs on
  sql.js in the browser and on better-sqlite3 in the tests, behind one small
  `Db` interface. A write is one transaction: all of it, or nothing.
- **Shared state is an action log** (`packages/engine/src/log.ts`).
  - Every write is an action `{id, user, ts, method, path, body}`.
  - Both logs are replayed in one fixed order: time, then author. An
    author's times strictly increase (writes in the same millisecond are
    nudged by 1 ms).
  - Actions later than everything applied, and later than the last read
    (whose settlement tick may already have settled a day), are applied in
    place. Anything earlier rebuilds from the newest valid checkpoint.
  - A checkpoint is the database before a day's first action. It records how
    many actions it contains, so an earlier action arriving late makes it
    stale automatically. Three are kept.
  - The base database (content, no user data) is built at build time; a new
    content version means a full replay.
- **Everything a write does must be the same on both phones:**
  - Rows the app refers to later (attempts, disputes, kompositions, reports,
    redemptions, rewards, chores, vouchers, reward vouchers) get ids from the
    action (`time × 4 + author`, × 1000 + n). Rows created by the settlement
    get ids from the day boundary.
  - The reward draw's seed comes from the redemption, not from crypto.
  - The competition starts on the day of the later placement (from the data,
    not from when a phone first noticed).
  - Duel items use only facets both users have had for over a day, and never
    `meaning_prod` (it unlocks with recent reviews). The spec's R band
    preference is dropped. `vs_expected` computes R at the start of the day
    from the review log, at settlement. Duel and exam ids come from their
    day or month.
  - A duel answer names the sentence it answers; if a late sync changed the
    items, the replayed answer is refused instead of grading another item.
  - "Queue cleared" (active day) is an explicit action, sent when Heute finds
    nothing due.
  - Snapshots, settlements, duel and exam rows carry boundary times, never
    the moment a phone happened to compute them.
- **Sync** (`apps/web/src/runtime/github.ts`) runs through a private data
  repository:
  - Files are `log/<person>/<day>.json`, and only their author writes them.
    The same person on two devices merges on a sha conflict and retries.
  - Pull: one git-trees call, then the blobs whose sha changed.
  - Push: debounced 3 s after a write.
  - Polling: every minute while the app is visible, plus on focus and when
    the phone comes back online.
  - Requests go straight to api.github.com with a fine-grained token that
    only has Contents read/write on the data repository.
- **Password.** The token is published in `wortduell.config.json` encrypted
  with AES-GCM, using a key from the shared password (PBKDF2-SHA256, 600,000
  iterations). A wrong password fails the GCM check. The setup script
  (`pnpm --filter @wortduell/web setup-sync`) checks the token and refuses
  passwords under 12 characters. The decrypted token and "who am I" are kept
  in the phone's localStorage.
- **What was dropped:** logins, push reminders, LanguageTool, and
  server-side authority. Both users see each other's raw data, but the
  screens still hide the other duel result until both have finished.
- **Storage on the phone:** IndexedDB holds the base database (9.4 MB), both
  logs, the checkpoints and the sync state. The service worker caches the
  app, SQLite's WebAssembly and the base database, so the app works offline.
- **Speed.** Replaying about 1,000 actions takes 1.3 s on sql.js in Node. A
  day's rebuild after a late sync takes well under a second; a full replay
  after a content update takes longer.
- **Acceptance.**
  - `packages/engine/test/sync.test.ts` covers two phones:
    - once with the partner playing in the evening and offline for three
      days;
    - once with both playing at the same time, which caused 11 rebuilds.
  - In both runs the two databases end identical to each other and to a
    fresh replay. The sql.js replay matches too.
  - `apps/web/e2e/app.e2e.ts` runs the built site, a fake GitHub and two
    emulated phones with fixed clocks: wrong then right password, "Wer bist
    du?", placement, a session, the duel on both phones, the result after
    sync, and the settled result the next day. Both phones agree.
  - The M2 and M5 simulations still pass on the engine. Their users now
    start with a shared block of words, the way placement would, because
    duel items need day-old words.

## Starting over (2026-10-01)

Marcel: zero the progress and start over; no flashcards, the reviews stay as
they are.

- The config has a `generation` (default 1). Raising it resets everything:
  each phone discards its local data (logs, checkpoints, remembered person,
  token) because the shared "space" changed, and syncs into
  `g<generation>/log/` in the data repository. Older generations' files are
  ignored, so no access to the private data repository is needed.
- Set to 2 on 2026-10-01.
