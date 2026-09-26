/** Shapes of the server's JSON responses (apps/server). */

export type Case = 'nom' | 'akk' | 'dat' | 'gen';
export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'other';

export interface Me {
  id: number;
  name: string;
  uiLang: 'de' | 'en';
  placementDone: boolean;
  partner: { id: number; name: string } | null;
}

export interface Today {
  day: string;
  dueCount: number;
  dueItems: number;
  backlog: boolean;
  reviewsToday: number;
  newToday: number;
  newRemaining: number;
}

export type Row = Record<Case, string>;

export interface VerbInfo {
  prefix: string | null;
  separable: boolean;
  aux: string | null;
  partizip2: string | null;
  praeteritum3sg: string | null;
  praesens2sg: string | null;
  praesens3sg: string | null;
  frame: { objects: string[]; preps?: { prep: string; case: string }[] } | null;
  frameStatus: string;
  zuInfinitive: string | null;
}

export interface LemmaCard {
  id: number;
  text: string;
  pos: Pos;
  gloss: string;
  article: string | null;
  forms: { sg: Row | null; pl: Row | null } | null;
  verb: VerbInfo | null;
  example: { de: string; en: string | null } | null;
  audioUrl: string | null;
}

export interface LemmaDetail extends LemmaCard {
  facets: {
    facet: string;
    unlocked: boolean;
    stabilityDays: number;
    recallNow: number;
    due: string;
  }[];
  examples: { de: string; en: string | null }[];
}

export type Prompt =
  | { type: 'kasus_luecke'; tokens: string[]; gapIndex: number; cue: string; en: string | null }
  | { type: 'fehlersuche'; tokens: string[] }
  | {
      type: 'bedeutung';
      de: string;
      tokens: string[];
      highlightIndex: number;
      word: string;
      hint: string;
    }
  | { type: 'en_de_chunk'; prompt: string; pos: Pos }
  | { type: 'umformen'; instruction: 'dat_pl' | 'perfekt' | 'du_form'; source: string }
  | { type: 'satzbau'; chunks: string[]; frame: 'hauptsatz' | 'nebensatz' | 'perfekt' | 'zu' }
  | { type: 'wer_tut_was'; de: string; options: string[] }
  | { type: 'diktat'; speak: string; words: number };

export interface ExerciseItem {
  kind: 'exercise';
  sentenceId: number;
  exerciseType: Prompt['type'];
  lemmaId: number;
  pos: Pos;
  prompt: Prompt;
  afterIntro?: boolean;
}

export interface IntroItem {
  kind: 'intro';
  lemmaId: number;
  pos: Pos;
  lemma: LemmaCard;
}

export type SessionItem = ExerciseItem | IntroItem;

export interface SessionPlan {
  day: string;
  dueCount: number;
  backlog: boolean;
  newRemaining: number;
  items: SessionItem[];
  deferred: number;
  untrainable: number;
  komposition: KompositionTask | null;
}

export interface KompositionTask {
  lemmas: { id: number; text: string; pos: Pos; article: string | null }[];
  requiredCase: 'dat' | null;
}

export interface LtMatch {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  ruleId: string;
}

export interface TargetCheck {
  lemmaId: number;
  found: boolean;
  span: [number, number] | null;
  dative: boolean;
  ltIssue: string | null;
}

export interface KompositionResult {
  id: number;
  checks: TargetCheck[];
  languageTool: LtMatch[] | null;
}

export interface ReviewData {
  disputes: {
    id: number;
    by: string;
    note: string;
    answer: string;
    exerciseType: string;
    prompt: Prompt | null;
    accepted: string[];
  }[];
  myDisputes: { id: number; status: string; answer_raw: string }[];
  reports: { id: number; sentence_id: number; reason: string; name: string; de: string }[];
  frames: {
    lemmaId: number;
    text: string;
    gloss: string;
    proposal: VerbInfo['frame'];
    corpus: { uses: number; counts: Record<string, number> } | null;
  }[];
  lemmas: { id: number; text: string; pos: string; review_reasons: string[] | null }[];
  kompositions: {
    id: number;
    by: string;
    text: string;
    targets: string[];
    checks: TargetCheck[];
    languageTool: LtMatch[] | null;
    createdAt: string;
  }[];
}

export interface Mark {
  text: string;
  status: 'ok' | 'wrong' | 'missing';
}

export interface Feedback {
  attemptId: number;
  correct: boolean;
  expected: string;
  answer: string;
  errorClass: string | null;
  secondary: string[];
  notes: string[];
  marks: Mark[];
  followUp: { kind: 'gender'; lemma: string; options: ('m' | 'f' | 'n')[] } | null;
  ratings: { facet: string; rating: string }[];
  forms: { sg: Row | null; pl: Row | null } | null;
}

export interface PlacementItem {
  lemmaId: number;
  text: string;
  pos: Pos;
  sentence: string | null;
}

// M5: competition, chores, joint goal, rewards, settings.

export interface RoundTotals {
  userId: number;
  played: boolean;
  finished: boolean;
  correct: number;
  total: number;
  expectedSum: number;
  totalMs: number;
}

export type Outcome =
  { kind: 'win'; winner: number; loser: number } | { kind: 'draw' } | { kind: 'none' };

export interface RoundView {
  status: 'none' | 'ready' | 'playing' | 'finished' | 'closed';
  id?: number;
  key?: string;
  mode?: string;
  total?: number;
  closesAt?: string;
  answered?: number;
  next?: {
    index: number;
    exerciseType: Prompt['type'];
    lemmaId: number;
    pos: Pos;
    prompt: Prompt;
  } | null;
  mine?: RoundTotals | null;
  other?: RoundTotals | { userId: number; finished: boolean } | null;
  outcome?: Outcome | null;
  feedback?: {
    index: number;
    sentenceId: number;
    lemmaId: number;
    voided: boolean;
    exerciseType: Prompt['type'] | null;
    prompt: Prompt | null;
    feedback: Feedback | null;
  }[];
}

export interface RoundSummary {
  status: RoundView['status'];
  total: number;
  answered: number;
  mine: RoundTotals | null;
  other: RoundView['other'];
  closesAt: string;
}

export interface CoopTier {
  valueEur: number;
  minActiveDays: number;
  minKomposition: number;
}

export interface CoopLive {
  week: string;
  progress: {
    userId: number;
    name: string;
    activeDays: number;
    days: { day: string; active: boolean }[];
    kompositions: number;
  }[];
  secured: number | null;
  tiers: CoopTier[];
  daysLeft: number;
}

export interface WeekScore {
  userId: number;
  w: number;
  snapshots: number;
}

export interface Home {
  duel: RoundSummary | null;
  exam: RoundSummary | null;
  coop: CoopLive | null;
  balanceEur: number;
  vouchers: { toDo: number; overdue: number; open: number };
  week: { week: string; scores: WeekScore[] } | null;
  stars: { userId: number; total: number; free: number }[];
  starsPerVoucher: number;
}

export interface PeriodResult {
  period: string;
  winnerId: number | null;
  draw: boolean;
  details: {
    results?: RoundTotals[];
    scores?: WeekScore[];
    mode?: string;
    outcome?: string;
  } | null;
  resettled: boolean;
}

export type Size = 'S' | 'M' | 'L';
export type SizeCounts = Record<Size, number>;

export interface Wettbewerb {
  players: { id: number; name: string }[] | null;
  epoch: string | null;
  days: PeriodResult[];
  weeks: PeriodResult[];
  months: PeriodResult[];
  liveWeek: { week: string; scores: WeekScore[] } | null;
  stars: { userId: number; total: number; free: number }[];
  starsPerVoucher: number;
  duelMode: string;
  ledger: { month: string; users: Record<string, { won: SizeCounts; received: SizeCounts }> }[];
}

export interface Chore {
  id: number;
  size: Size;
  titleDe: string;
  titleEn: string;
  sentenceDe: string;
  noun: string | null;
  verb: string | null;
  active: boolean;
  nounForms: { gender: string | null; table: { sg: Row | null; pl: Row | null } } | null;
  verbSplit: string | null;
}

export interface Voucher {
  id: number;
  kind: string;
  fromPeriod: string;
  size: Size;
  winnerId: number;
  loserId: number;
  winner: string;
  loser: string;
  status: 'choose' | 'open' | 'done' | 'confirmed';
  chooseBy: string;
  deadline: string | null;
  doneAt: string | null;
  auto: string | null;
  overdue: boolean;
  createdAt: string;
  chore: Chore | null;
}

export interface Reward {
  id: number;
  budgetEur: number;
  kind: 'together' | 'buy';
  titleDe: string;
  titleEn: string;
  missionDe: string;
  season: 'any' | 'outdoor';
  needsBabysitter: boolean;
  estCostNote: string;
  active: boolean;
  proposedBy: number | null;
  pending: boolean;
  lastDrawnAt: string | null;
}

export interface Redemption {
  id: number;
  status: 'pending' | 'drawn' | 'planned' | 'done' | 'undone';
  totalEur: number;
  bandEur: number;
  drawnBandEur: number | null;
  changeEur: number;
  startedBy: number;
  rerollsLeft: number;
  rerollRequests: number[];
  undoRequests: number[];
  plannedFor: string | null;
  note: string | null;
  createdAt: string;
  reward: Reward | null;
}

export interface Wochenziel {
  coop: CoopLive | null;
  balanceEur: number;
  vouchers: {
    id: number;
    valueEur: number;
    source: string;
    weekKey: string | null;
    reserved: boolean;
    createdAt: string;
  }[];
  redemptions: Redemption[];
  bands: number[];
}

export interface SettingEntry {
  key:
    | 'NEW_PER_DAY'
    | 'DUEL_MODE'
    | 'STARS_PER_S_VOUCHER'
    | 'COOP_TIERS'
    | 'REWARD_BANDS'
    | 'BABYSITTER_AVAILABLE';
  value: unknown;
  dualApproval: boolean;
  pending: { value: unknown; proposedBy: number } | null;
  scheduled: { value: unknown; effectiveFrom: string } | null;
}
