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
  and the audio files stay out of git; they are rebuilt with
  `python -m wortduell_pipeline all`.
