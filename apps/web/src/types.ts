/** Shapes of the server's JSON responses (apps/server). */

export type Case = 'nom' | 'akk' | 'dat' | 'gen';
export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'other';

export interface Me {
  id: number;
  name: string;
  uiLang: 'de' | 'en';
  placementDone: boolean;
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
