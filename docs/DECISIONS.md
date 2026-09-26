# Decisions

Decisions taken on top of [SPEC.md](SPEC.md), agreed with Marcel on
2026-09-26 ("defaults ok"). Later changes are appended with a date.

## Answers to the spec questions

1. **DE→EN recall gets its own exercise, `bedeutung`.** The German word is shown
   in a sentence, and the user types the English meaning. Answers are matched against
   the Wiktionary glosses (US/UK spelling, a leading "to"/"the"/"a" ignored). If
   nothing matches, Claude gives a JSON verdict that is cached per answer and can
   be disputed. It is not duel-eligible, because its grading is not fully
   deterministic. `meaning_recv` is exercised by `bedeutung`.
2. **A later starting point uses placement.** Core-deck words before a user's
   starting point are introduced in bulk after a short typed placement check, so
   they have FSRS cards and count as introduced. On a day with fewer than 10
   eligible shared duel items there is no duel: no result and no forfeit, and
   "played the duel" is dropped from that day's active-day condition.
3. **On a wrong answer, only blamed facets are rated.** The facets the error class
   names get Again. The other implicated facets are left unrated and stay due.
   This never rewards a lucky guess.
4. **`komposition` moves from M6 to M4**, next to `satzbau`, since both use the
   same Claude-verdict machinery. This makes the 10 € tier reachable by M5.

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
