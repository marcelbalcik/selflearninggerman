/**
 * Every tunable number of Wortduell lives here (spec §0.4). Settings marked
 * "dual approval" are only defaults: at runtime both users must approve a
 * change (spec §10), and the server stores the effective value.
 */
import type { ExerciseType } from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TIME = {
  TIMEZONE: 'Europe/Berlin',
  /** Local hour at which a new learning day starts (spec §8.1). */
  DAY_BOUNDARY_HOUR: 3,
} as const;

export const FSRS = {
  REQUEST_RETENTION: 0.9,
  ENABLE_SHORT_TERM: true,
  ENABLE_FUZZ: true,
  /** `meaning_prod` unlocks once `meaning_recv` stability reaches this (spec §5.1). */
  PROD_UNLOCK_STABILITY_DAYS: 3,
} as const;

export const RATING = {
  /** Correct answers slower than SLOW_FACTOR × rolling median latency rate Hard. */
  SLOW_FACTOR: 2.0,
  /** Rolling median over the last N attempts per user and exercise type. */
  LATENCY_WINDOW: 200,
  /** Below this many attempts the default medians below are used. */
  LATENCY_MIN_SAMPLES: 30,
  /** Initial guesses; replaced by each user's own median after LATENCY_MIN_SAMPLES. */
  DEFAULT_MEDIAN_LATENCY_MS: {
    kasus_luecke: 8_000,
    wer_tut_was: 6_000,
    satzbau: 30_000,
    umformen: 15_000,
    diktat: 20_000,
    en_de_chunk: 10_000,
    fehlersuche: 15_000,
    komposition: 180_000,
    bedeutung: 8_000,
  } satisfies Record<ExerciseType, number>,
} as const;

export const GRADING = {
  /** Typo tolerance applies only to expected words at least this long (spec §7.2). */
  TYPO_MIN_WORD_LENGTH: 5,
  /** Maximum Damerau-Levenshtein distance for a tolerated typo. */
  TYPO_MAX_DISTANCE: 1,
  /** The last N characters (the ending) must be typed exactly. */
  TYPO_PROTECTED_SUFFIX: 2,
  /** `diktat`: the rest of the sentence passes at normalised edit distance ≤ this. */
  DIKTAT_MAX_NORMALISED_DISTANCE: 0.1,
  /** An unknown noun still counts as an attempt at the lemma (not `wrong_word`) when it is
   *  a stem of at least MIN_STEM letters plus at most MAX_EXTRA_CHARS ending letters. */
  ATTEMPTED_FORM_MIN_STEM: 3,
  ATTEMPTED_FORM_MAX_EXTRA_CHARS: 3,
} as const;

export const PLACEMENT = {
  /** Both users start at A2.1: core-deck words ranked below this count as A1 and are
   *  introduced through a placement check instead of one by one (docs/DECISIONS.md). */
  START_RANK: 500,
  /** Placement asks typed DE→EN recall for every Nth A1 word; a failed sample puts its
   *  neighbours back into the normal new-word queue. */
  SAMPLE_EVERY: 5,
} as const;

export const SESSION = {
  /** New lemmas per user per day, core + personal (spec §8.2). Dual approval. */
  NEW_PER_DAY: 5,
  /** No exercise type may exceed this share of a session. */
  MAX_EXERCISE_TYPE_SHARE: 0.4,
  /** Above this many due facets the app offers a reviews-only session. */
  BACKLOG_THRESHOLD: 150,
  /** A new word comes back as a `meaning_recv` item after this many other items. */
  INTRO_REAPPEAR_MIN_ITEMS: 3,
  INTRO_REAPPEAR_MAX_ITEMS: 5,
  /** `komposition`: target lemmas per task and sentences the user writes. */
  KOMPOSITION_TARGET_LEMMAS: 3,
  KOMPOSITION_SENTENCES: 2,
  /** Active day: duel played and due queue cleared or at least this many reviews (spec §8.3). */
  ACTIVE_DAY_MIN_REVIEWS: 40,
} as const;

export const DUEL = {
  ITEMS: 10,
  /** Dual approval. `vs_expected` is recommended after VS_EXPECTED_AFTER_DAYS of data. */
  MODE: 'raw' as 'raw' | 'vs_expected',
  VS_EXPECTED_AFTER_DAYS: 14,
  /** Preferred band of both users' predicted recall for duel items. */
  PREFERRED_R_MIN: 0.6,
  PREFERRED_R_MAX: 0.95,
  /** A lemma may not reappear in a duel within this many days. */
  LEMMA_COOLDOWN_DAYS: 7,
  /** `vs_expected`: score differences below this are a draw. */
  VS_EXPECTED_DRAW_MARGIN: 0.25,
  /** Duel wins (stars) per S chore voucher. Dual approval. */
  STARS_PER_S_VOUCHER: 3,
  /** Local hour of the "duel not played yet" push reminder. */
  REMINDER_HOUR: 19,
} as const;

export const BEHALTEN = {
  /** B_u sums R(Δt + HORIZON_DAYS; S) over lexical facets (spec §9.2). */
  HORIZON_DAYS: 7,
  SNAPSHOTS_PER_WEEK: 7,
  /** |W₁ − W₂| below this is a draw. */
  DRAW_MARGIN: 0.5,
} as const;

export const EXAM = {
  ITEMS: 40,
  /** The exam window covers the first N days of the following month. */
  WINDOW_DAYS: 3,
  /** Facets must have been introduced at least this many days before the window opens. */
  MIN_FACET_AGE_DAYS: 7,
  /** A difference of at most this many correct items is a draw. */
  DRAW_MAX_ITEM_DIFF: 1,
} as const;

export const CHORES = {
  /** The winner picks a chore within this time, else the server picks one. */
  CHOOSE_WINDOW_MS: 24 * HOUR_MS,
  DEADLINE_MS: { S: 48 * HOUR_MS, M: 7 * DAY_MS, L: 14 * DAY_MS },
  /** A `done` voucher auto-confirms after this long. */
  AUTO_CONFIRM_MS: 48 * HOUR_MS,
} as const;

export const COOP = {
  /** Weekly joint-goal tiers, highest first; both users must meet a tier. Dual approval. */
  TIERS: [
    { valueEur: 10, minActiveDays: 6, minKomposition: 3 },
    { valueEur: 5, minActiveDays: 5, minKomposition: 0 },
    { valueEur: 3, minActiveDays: 4, minKomposition: 0 },
  ],
  MAX_WEEKLY_VOUCHER_EUR: 10,
  /** Reward bands in euros. Dual approval. */
  REWARD_BANDS: [3, 5, 10, 15, 20, 30],
  /** Rewards drawn within this many weeks are excluded from the draw. */
  REWARD_COOLDOWN_WEEKS: 8,
  /** `outdoor` rewards are drawn only in these months (1 = January). */
  OUTDOOR_FIRST_MONTH: 4,
  OUTDOOR_LAST_MONTH: 10,
  REROLLS_PER_REDEMPTION: 1,
} as const;

export const PIPELINE = {
  CORE_LEMMA_TARGET: 2000,
  /** Lemma count for the M1 trial run (Marcel: the 500 most frequent words). */
  TRIAL_LEMMA_COUNT: 500,
  /** Parts of speech in the vocabulary deck; function words are taught as grammar skills. */
  DECK_POS: ['noun', 'verb', 'adj', 'adv'],
  /** CEFR hint from frequency rank (no free official list): rank < limit → level. */
  CEFR_BANDS: [
    { maxRank: 500, level: 'A1' },
    { maxRank: 1200, level: 'A2' },
    { maxRank: 2500, level: 'B1' },
  ],
  SENTENCES_PER_TARGET: 3,
  MAX_REGENERATIONS: 2,
  /** A suffix gender rule is shown only at this accuracy and sample size (spec §4.4). */
  GENDER_RULE_MIN_ACCURACY: 0.9,
  GENDER_RULE_MIN_N: 20,
  GENDER_RULE_MIN_SYLLABLES: 2,
  /** Frames of the N most frequent verbs always go to the review queue. */
  FRAME_REVIEW_TOP_N: 300,
  /** Corpus sentences (Tatoeba, Wiktionary examples) outside this token range are skipped. */
  SENTENCE_MIN_TOKENS: 4,
  SENTENCE_MAX_TOKENS: 14,
  /** A frame proposed from corpus counts needs this many parsed example sentences. */
  FRAME_MIN_CORPUS_EXAMPLES: 5,
  /** A case enters a proposed frame when this share of the verb's corpus uses has it. */
  FRAME_MIN_SHARE: 0.2,
  /** Commons API politeness: pause between batched licence queries. */
  COMMONS_REQUEST_INTERVAL_MS: 1_000,
} as const;

export const FEEDBACK = {
  /** LanguageTool language code for `komposition` checks (self-hosted server, spec change). */
  LANGUAGETOOL_LANGUAGE: 'de-DE',
  /** Give up on LanguageTool after this long and show deterministic feedback only. */
  LANGUAGETOOL_TIMEOUT_MS: 5_000,
} as const;

export const OPS = {
  BACKUP_RETENTION_DAYS: 30,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
} as const;
