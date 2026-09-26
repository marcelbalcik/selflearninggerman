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
