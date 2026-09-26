import type { Feedback, LemmaDetail, Me, PlacementItem, SessionPlan, Today } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

export const api = {
  login: (name: string, password: string) =>
    call<{ ok: true }>('POST', '/api/login', { name, password }),
  logout: () => call<{ ok: true }>('POST', '/api/logout', {}),
  me: () => call<Me>('GET', '/api/me'),
  setLang: (uiLang: 'de' | 'en') => call<{ ok: true }>('PUT', '/api/me', { uiLang }),
  today: () => call<Today>('GET', '/api/today'),
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
};
