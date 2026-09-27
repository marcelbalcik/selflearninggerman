import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useT } from '../i18n';
import type { Lang } from '../i18n';
import type { Me, Outcome, PeriodResult, RoundTotals, RoundView, Size, Wettbewerb } from '../types';
import { promptSummary } from './Pruefen';
import { Exercise, FeedbackPanel } from './Session';

/** Short Berlin-time date for deadlines. */
export function fmtDate(iso: string, lang: Lang, withTime = true): string {
  return new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function isTotals(x: unknown): x is RoundTotals {
  return typeof x === 'object' && x !== null && 'correct' in x;
}

export function OutcomeLine({
  outcome,
  me,
}: {
  outcome: Outcome | null | undefined;
  me: Me;
}): ReactNode {
  const t = useT();
  if (!outcome) return null;
  if (outcome.kind === 'draw') return <p>{t('draw')}</p>;
  if (outcome.kind === 'none') return <p>{t('noResult')}</p>;
  return outcome.winner === me.id ? (
    <p>
      <strong>{t('youWin')}</strong>
    </p>
  ) : (
    <p>{t('youLose', { name: me.partner?.name ?? '' })}</p>
  );
}

export function ScoreLine({ r, mode }: { r: RoundTotals; mode?: string }): ReactNode {
  const t = useT();
  if (!r.played) return <span className="muted">{t('forfeit')}</span>;
  return (
    <span>
      {t('scoreTime', {
        correct: r.correct,
        total: r.total,
        seconds: Math.round(r.totalMs / 1000),
      })}
      {mode === 'vs_expected' && (
        <span className="muted">
          {' '}
          · {t('scoreExpected', { expected: r.expectedSum.toFixed(1) })}
        </span>
      )}
    </span>
  );
}

/** Duell or Monatsprüfung: items without feedback, full feedback at the end (spec §9.1, §9.3). */
export function RoundScreen({
  kind,
  me,
  version = 0,
  onDone,
}: {
  kind: 'duel' | 'exam';
  me: Me;
  /** Bumped when the other phone's actions arrive (shows their result). */
  version?: number;
  onDone: () => void;
}): ReactNode {
  const t = useT();
  const [view, setView] = useState<RoundView | null>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api.round(kind).then(setView, () => setFailed(true));
  }, [kind]);
  useEffect(load, [load]);
  // A finished round may now show the other result; a running one keeps its place.
  const finished = view?.status === 'finished' || view?.status === 'closed';
  useEffect(() => {
    if (finished) load();
  }, [version]);

  if (failed) return <p>{t('error')}</p>;
  if (!view) return <p className="muted">{t('loading')}</p>;
  const title = kind === 'duel' ? t('duelToday') : t('exam');

  if (view.status === 'none') {
    return (
      <div className="card">
        <h1>{title}</h1>
        <p>{kind === 'duel' ? t('duelNone') : t('noResult')}</p>
        <button type="button" className="btn btn-block" onClick={onDone}>
          {t('backToToday')}
        </button>
      </div>
    );
  }

  if ((view.status === 'ready' && !started) || !view.total) {
    return (
      <div className="card">
        <h1>{title}</h1>
        <p>
          {kind === 'duel'
            ? t('duelRules', { n: view.total ?? 0 })
            : t('examRules', { n: view.total ?? 0 })}
        </p>
        {view.closesAt && (
          <p className="muted">{t('examOpenUntil', { date: fmtDate(view.closesAt, me.uiLang) })}</p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => setStarted(true)}
        >
          {kind === 'duel' ? t('duelStart') : t('examStart')}
        </button>
      </div>
    );
  }

  if (view.next) {
    const next = view.next;
    const n = view.answered ?? 0;
    return (
      <div>
        <div className="progress" role="progressbar" aria-valuenow={n} aria-valuemax={view.total}>
          <span style={{ width: `${(n / view.total) * 100}%` }} />
        </div>
        <p className="muted" aria-live="polite">
          {title} · {t('progress', { n: n + 1, total: view.total })}
        </p>
        <Exercise
          key={`${kind}-${next.index}`}
          item={{
            sentenceId: 0,
            exerciseType: next.exerciseType,
            lemmaId: next.lemmaId,
            prompt: next.prompt,
          }}
          round={(a) => api.roundAnswer(kind, { ...a, index: next.index })}
          onNext={load}
        />
      </div>
    );
  }

  const other = view.other;
  return (
    <>
      <div className="card">
        <h1>{title}</h1>
        <p>
          <strong>{t('you')}:</strong> {view.mine && <ScoreLine r={view.mine} mode={view.mode} />}
        </p>
        {isTotals(other) ? (
          <>
            <p>
              <strong>{me.partner?.name}:</strong> <ScoreLine r={other} mode={view.mode} />
            </p>
            <OutcomeLine outcome={view.outcome} me={me} />
          </>
        ) : (
          <p className="muted">{t('duelWaiting', { name: me.partner?.name ?? '' })}</p>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
          {t('backToToday')}
        </button>
      </div>
      <h2>{t('roundFeedback')}</h2>
      {(view.feedback ?? []).map((f) =>
        f.feedback && f.prompt && f.exerciseType ? (
          <FeedbackPanel
            key={f.index}
            item={{
              sentenceId: f.sentenceId,
              exerciseType: f.exerciseType,
              lemmaId: f.lemmaId,
              prompt: f.prompt,
            }}
            feedback={f.feedback}
            context={
              f.exerciseType === 'fehlersuche' || f.exerciseType === 'wer_tut_was'
                ? undefined
                : promptSummary(f.prompt)
            }
          />
        ) : null,
      )}
    </>
  );
}

function resultText(r: PeriodResult, me: Me, t: ReturnType<typeof useT>): string {
  if (r.draw) return t('draw');
  if (r.winnerId === null) return t('noResult');
  return r.winnerId === me.id ? t('youWin') : t('youLose', { name: me.partner?.name ?? '' });
}

const SIZES: Size[] = ['S', 'M', 'L'];

/** Wettbewerb: stars, this week's standing, recent results and the ledger (spec §10). */
export function WettbewerbScreen({ me }: { me: Me }): ReactNode {
  const t = useT();
  const [data, setData] = useState<Wettbewerb | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.wettbewerb().then(setData, () => setFailed(true));
  }, []);
  if (failed) return <p>{t('error')}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  const name = (id: number) =>
    id === me.id ? t('you') : (data.players?.find((p) => p.id === id)?.name ?? '?');
  const scoreOf = (r: PeriodResult, id: number) => r.details?.results?.find((x) => x.userId === id);

  return (
    <>
      <div className="card">
        <h1>{t('navCompetition')}</h1>
        <h2>{t('stars')}</h2>
        <p>
          {data.stars.map((s) => (
            <span key={s.userId} style={{ marginRight: 16 }}>
              {name(s.userId)}: {'★'.repeat(s.free)}
              {'☆'.repeat(Math.max(0, data.starsPerVoucher - s.free))} ({s.total})
            </span>
          ))}
        </p>
        <p className="muted">{t('starsHint', { n: data.starsPerVoucher })}</p>
        {data.liveWeek && (
          <>
            <h2>{t('thisWeek')}</h2>
            <ul>
              {data.liveWeek.scores.map((s) => (
                <li key={s.userId}>
                  {name(s.userId)}: {s.w >= 0 ? '+' : ''}
                  {s.w.toFixed(1)}
                </li>
              ))}
            </ul>
            <p className="muted">{t('behaltenHint')}</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>{t('recentDuels')}</h2>
        {data.days.length === 0 && <p className="muted">—</p>}
        <ul className="plain">
          {data.days.map((r) => (
            <li key={r.period}>
              <span className="muted">{r.period.slice(5)}</span> {resultText(r, me, t)}
              {r.details?.results && (
                <span className="muted">
                  {' '}
                  (
                  {[me.id, me.partner?.id ?? 0]
                    .map((id) => scoreOf(r, id)?.correct ?? '–')
                    .join(' : ')}
                  )
                </span>
              )}
              {r.resettled && <span className="note"> · {t('resettled')}</span>}
            </li>
          ))}
        </ul>
      </div>

      {data.weeks.length > 0 && (
        <div className="card">
          <h2>{t('weeks')}</h2>
          <ul className="plain">
            {data.weeks.map((r) => (
              <li key={r.period}>
                <span className="muted">{r.period}</span> {resultText(r, me, t)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.months.length > 0 && (
        <div className="card">
          <h2>{t('months')}</h2>
          <ul className="plain">
            {data.months.map((r) => (
              <li key={r.period}>
                <span className="muted">{r.period}</span> {resultText(r, me, t)}
                {r.resettled && <span className="note"> · {t('resettled')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>{t('ledger')}</h2>
        {data.ledger.length === 0 && <p className="muted">—</p>}
        {data.ledger.map((m) => (
          <table key={m.month} className="decl" style={{ marginBottom: 12 }}>
            <caption style={{ textAlign: 'left', fontWeight: 600 }}>{m.month}</caption>
            <thead>
              <tr>
                <th />
                <th>{t('ledgerWon')}</th>
                <th>{t('ledgerReceived')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.users).map(([id, u]) => (
                <tr key={id}>
                  <th>{name(Number(id))}</th>
                  <td>{SIZES.map((s) => `${u.won[s]} ${s}`).join(' · ')}</td>
                  <td>{SIZES.map((s) => `${u.received[s]} ${s}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </>
  );
}
