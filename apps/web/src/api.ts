import { RequestError, runtime } from './runtime/runtime';
import type {
  Chore,
  Home,
  Reward,
  RoundView,
  SettingEntry,
  Voucher,
  Wettbewerb,
  Wochenziel,
  Feedback,
  KompositionResult,
  LemmaDetail,
  Me,
  PlacementItem,
  ReviewData,
  SessionPlan,
  Today,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Every call is answered on the phone by the local engine (runtime/runtime.ts);
 * the paths are the ones the server used to serve.
 */
function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  try {
    return Promise.resolve(runtime.request<T>(method, url, body));
  } catch (err) {
    if (err instanceof RequestError) return Promise.reject(new ApiError(err.status, err.message));
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

export const api = {
  me: () => call<Me>('GET', '/api/me'),
  setLang: (uiLang: 'de' | 'en') => call<{ ok: true }>('PUT', '/api/me', { uiLang }),
  today: () => call<Today>('GET', '/api/today'),
  /** Heute found no due exercises: counts toward an active day. */
  cleared: () => call<{ ok: true }>('POST', '/api/day/cleared', {}),
  session: (reviewsOnly: boolean) =>
    call<SessionPlan>('GET', reviewsOnly ? '/api/session?mode=reviews' : '/api/session'),
  intro: (lemmaId: number) =>
    call<{ introduced: boolean }>('POST', `/api/lemmas/${lemmaId}/intro`, {}),
  lemma: (lemmaId: number) => call<LemmaDetail>('GET', `/api/lemmas/${lemmaId}`),
  attempt: (body: {
    sentenceId: number;
    answer: string;
    latencyMs: number;
    tappedIndex?: number;
    hintUsed?: boolean;
  }) => call<Feedback>('POST', '/api/attempts', body),
  followUp: (attemptId: number, gender: 'm' | 'f' | 'n') =>
    call<{ ratings: unknown[] }>('POST', `/api/attempts/${attemptId}/follow-up`, { gender }),
  report: (sentenceId: number, reason: string) =>
    call<{ voidedAttempts: number }>('POST', '/api/reports', { sentenceId, reason }),
  placementSample: () => call<{ sample: PlacementItem[] }>('GET', '/api/placement'),
  placement: (answers: { lemmaId: number; answer: string }[]) =>
    call<{ introduced: number; passed: number }>('POST', '/api/placement', { answers }),
  skipPlacement: () => call<{ ok: true }>('POST', '/api/placement/skip', {}),
  dispute: (attemptId: number, note: string) =>
    call<{ id: number }>('POST', '/api/disputes', { attemptId, note }),
  komposition: (lemmaIds: number[], requiredCase: 'dat' | null, text: string) =>
    call<KompositionResult>('POST', '/api/komposition', { lemmaIds, requiredCase, text }),
  review: () => call<ReviewData>('GET', '/api/review'),
  decideDispute: (id: number, approve: boolean) =>
    call<{ status: string }>('POST', `/api/disputes/${id}/decision`, { approve }),
  decideReport: (id: number, action: 'reject' | 'fixed') =>
    call<{ ok: true }>('POST', `/api/reports/${id}/decision`, { action }),
  decideFrame: (lemmaId: number, status: 'approved' | 'rejected') =>
    call<{ addedCards: number }>('POST', `/api/frames/${lemmaId}`, { status }),
  reviewKomposition: (
    id: number,
    marks: { start: number; end: number; type: string; correction: string }[],
  ) => call<{ ratings: unknown[] }>('POST', `/api/komposition/${id}/review`, { marks }),
  // M5
  home: () => call<Home>('GET', '/api/home'),
  round: (kind: 'duel' | 'exam') => call<RoundView>('GET', `/api/${kind}`),
  roundAnswer: (
    kind: 'duel' | 'exam',
    a: { index: number; answer: string; tappedIndex?: number; latencyMs: number },
  ) => call<{ index: number; finished: boolean }>('POST', `/api/${kind}/answer`, a),
  wettbewerb: () => call<Wettbewerb>('GET', '/api/wettbewerb'),
  vouchers: () => call<{ vouchers: Voucher[]; chores: Chore[] }>('GET', '/api/vouchers'),
  chooseChore: (id: number, choreId: number) =>
    call<{ ok: true }>('POST', `/api/vouchers/${id}/choose`, { choreId }),
  voucherAction: (id: number, action: 'done' | 'confirm') =>
    call<{ ok: true }>('POST', `/api/vouchers/${id}/${action}`, {}),
  saveChore: (id: number | null, c: Omit<Chore, 'id' | 'nounForms' | 'verbSplit'>) =>
    id === null
      ? call<{ id: number }>('POST', '/api/chores', c)
      : call<{ id: number }>('PUT', `/api/chores/${id}`, c),
  wochenziel: () => call<Wochenziel>('GET', '/api/wochenziel'),
  redeem: (voucherIds: number[], band: number | null) =>
    call<{ id: number }>('POST', '/api/redemptions', { voucherIds, band }),
  redemption: (id: number, action: 'confirm' | 'reroll' | 'undo') =>
    call<{ ok?: true; rerolled?: boolean; undone?: boolean }>(
      'POST',
      `/api/redemptions/${id}/${action}`,
      {},
    ),
  planRedemption: (id: number, date: string) =>
    call<{ ok: true }>('POST', `/api/redemptions/${id}/plan`, { date }),
  finishRedemption: (id: number, note: string) =>
    call<{ ok: true }>('POST', `/api/redemptions/${id}/done`, { note }),
  rewards: () => call<{ rewards: Reward[] }>('GET', '/api/rewards'),
  proposeReward: (r: Omit<Reward, 'id' | 'active' | 'proposedBy' | 'pending' | 'lastDrawnAt'>) =>
    call<{ id: number }>('POST', '/api/rewards', r),
  decideReward: (id: number, approve: boolean) =>
    call<{ ok: true }>('POST', `/api/rewards/${id}/decision`, { approve }),
  setRewardActive: (id: number, active: boolean) =>
    call<{ ok: true }>('POST', `/api/rewards/${id}/active`, { active }),
  settings: () => call<{ settings: SettingEntry[] }>('GET', '/api/settings'),
  proposeSetting: (key: SettingEntry['key'], value: unknown) =>
    call<{ ok: true }>('POST', `/api/settings/${key}`, { value }),
  decideSetting: (key: SettingEntry['key'], approve: boolean) =>
    call<{ effectiveFrom: string | null }>('POST', `/api/settings/${key}/decision`, { approve }),
};
