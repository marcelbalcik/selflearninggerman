import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { runtime } from '../runtime/runtime';
import type { SyncState } from '../runtime/runtime';
import { AnswerInput, WordDetail } from '../components/parts';
import { useT } from '../i18n';
import type { Home, Me, PlacementItem, RoundSummary, Today as TodayData } from '../types';
import { ScoreLine } from './Competition';
import { ChoreCatalog, RewardCatalog, SharedSettings } from './Mehr';

export function Loading(): ReactNode {
  const t = useT();
  return (
    <div className="card">
      <h1>{t('appName')}</h1>
      <p className="muted">{t('loadingData')}</p>
    </div>
  );
}

/** The shared password unlocks the sync token on this phone (asked once). */
export function Unlock(): ReactNode {
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(false);
        void runtime
          .unlock(password)
          .then((ok) => setError(!ok))
          .finally(() => setBusy(false));
      }}
    >
      <h1>{t('appName')}</h1>
      <div className="field">
        <label htmlFor="password">{t('password')}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p role="alert" className="correction">
          {t('passwordWrong')}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
        {t('unlock')}
      </button>
    </form>
  );
}

/** "Wer bist du?": which of the two uses this phone (remembered). */
export function WhoAreYou({
  users,
  configured,
}: {
  users: string[];
  configured: boolean;
}): ReactNode {
  const t = useT();
  return (
    <div className="card">
      {!configured && (
        <p className="note">
          {t('notConfigured')} <a href="#/einrichten">{t('setUp')}</a>
        </p>
      )}
      <h1>{t('whoAreYou')}</h1>
      <div className="btn-row" style={{ flexDirection: 'column' }}>
        {users.map((name, i) => (
          <button
            key={name}
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => runtime.choose(i + 1)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoundCard({
  kind,
  round,
  me,
  onPlay,
}: {
  kind: 'duel' | 'exam';
  round: RoundSummary;
  me: Me;
  onPlay: () => void;
}): ReactNode {
  const t = useT();
  const other = round.other;
  const otherDone = other !== null && other !== undefined && 'correct' in other;
  return (
    <div className="card">
      <h2>{kind === 'duel' ? t('duelToday') : t('exam')}</h2>
      {round.status === 'ready' && (
        <>
          <p>
            {kind === 'duel'
              ? t('duelRules', { n: round.total })
              : t('examRules', { n: round.total })}
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={onPlay}>
            {kind === 'duel' ? t('duelStart') : t('examStart')}
          </button>
        </>
      )}
      {round.status === 'playing' && (
        <button type="button" className="btn btn-primary btn-block" onClick={onPlay}>
          {t('duelContinue', { n: round.answered + 1, total: round.total })}
        </button>
      )}
      {(round.status === 'finished' || round.status === 'closed') && (
        <>
          {round.mine && (
            <p>
              <strong>{t('you')}:</strong> <ScoreLine r={round.mine} />
            </p>
          )}
          {otherDone ? (
            <p>
              <strong>{me.partner?.name}:</strong> <ScoreLine r={other} />
            </p>
          ) : (
            <p className="muted">{t('duelWaiting', { name: me.partner?.name ?? '' })}</p>
          )}
          <button type="button" className="btn btn-block" onClick={onPlay}>
            {t('duelResult')}
          </button>
        </>
      )}
    </div>
  );
}

export function Today({
  me,
  onStart,
  go,
}: {
  me: Me;
  onStart: (reviewsOnly: boolean) => void;
  go: (path: string) => void;
}): ReactNode {
  const t = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.today().then(
      (d) => {
        setData(d);
        // An empty queue counts toward an active day (spec §8.3); recorded once a day.
        if (d.dueItems === 0 && !d.clearedToday) void api.cleared().catch(() => undefined);
        // The home data needs the settlement that /api/today just ran.
        api.home().then(setHome, () => setHome(null));
      },
      () => setFailed(true),
    );
  }, []);
  if (failed) return <p>{t('error')}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  const nothing = data.dueItems === 0 && data.newRemaining === 0;
  const name = (id: number) => (id === me.id ? t('you') : (me.partner?.name ?? ''));
  return (
    <div>
      <h1>{t('hello', { name: me.name })}</h1>
      {home?.exam && home.exam.status !== 'none' && (
        <RoundCard kind="exam" round={home.exam} me={me} onPlay={() => go('/pruefung')} />
      )}
      {home?.duel ? (
        <RoundCard kind="duel" round={home.duel} me={me} onPlay={() => go('/duell')} />
      ) : (
        home && (
          <div className="card">
            <h2>{t('duelToday')}</h2>
            <p className="muted">{t('duelNone')}</p>
          </div>
        )
      )}
      <div className="card">
        <div className="stat">
          <strong>{data.dueItems}</strong> <span>{t('dueReviews')}</span>
        </div>
        <div className="stat">
          <strong>{data.newRemaining}</strong> <span>{t('newWords')}</span>
        </div>
        <div className="stat">
          <strong>{data.reviewsToday}</strong> <span>{t('reviewsDone')}</span>
        </div>
        {data.backlog && <p className="note">{t('backlogHint')}</p>}
        {nothing ? (
          <p style={{ marginTop: 12 }}>{t('nothingDue')}</p>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => onStart(false)}>
              {t('startSession')}
            </button>
            {data.backlog && (
              <button type="button" className="btn" onClick={() => onStart(true)}>
                {t('reviewsOnly')}
              </button>
            )}
          </div>
        )}
      </div>
      {home?.coop && (
        <button type="button" className="card card-link" onClick={() => go('/wochenziel')}>
          <h2>{t('weekGoal')}</h2>
          {home.coop.progress.map((p) => (
            <p key={p.userId}>
              <strong>{name(p.userId)}:</strong> {t('activeDays', { n: p.activeDays })} ·{' '}
              {t('kompositionCount', { n: p.kompositions })}
            </p>
          ))}
          <p>
            <strong>
              {home.coop.secured !== null
                ? t('secured', { eur: home.coop.secured })
                : t('securedNone')}
            </strong>{' '}
            · {t('balance', { eur: home.balanceEur })}
          </p>
        </button>
      )}
      {home && home.vouchers.open > 0 && (
        <button type="button" className="card card-link" onClick={() => go('/aufgaben')}>
          <h2>{t('chores')}</h2>
          <p>
            {t('toDo', { n: home.vouchers.toDo })}
            {home.vouchers.overdue > 0 && (
              <strong className="correction">
                {' '}
                · {t('overdueCount', { n: home.vouchers.overdue })}
              </strong>
            )}
          </p>
        </button>
      )}
      {home?.week && (
        <button type="button" className="card card-link" onClick={() => go('/wettbewerb')}>
          <h2>{t('thisWeek')}</h2>
          <p>
            {home.week.scores.map((s) => (
              <span key={s.userId} style={{ marginRight: 16 }}>
                {name(s.userId)}: {s.w >= 0 ? '+' : ''}
                {s.w.toFixed(1)}
              </span>
            ))}
          </p>
          <p className="muted">
            {t('stars')}: {home.stars.map((s) => `${name(s.userId)} ${s.total} ★`).join(' · ')}
          </p>
        </button>
      )}
    </div>
  );
}

export function Placement({ onDone }: { onDone: () => void }): ReactNode {
  const t = useT();
  const [sample, setSample] = useState<PlacementItem[] | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [answers, setAnswers] = useState<{ lemmaId: number; answer: string }[]>([]);
  const [result, setResult] = useState<number | null>(null);
  useEffect(() => {
    api.placementSample().then(
      (r) => setSample(r.sample),
      () => setSample([]),
    );
  }, []);

  const finish = (all: { lemmaId: number; answer: string }[]) => {
    void api.placement(all).then((r) => setResult(r.introduced));
  };

  if (result !== null) {
    return (
      <div className="card">
        <h1>{t('placementTitle')}</h1>
        <p>{t('placementDone', { n: result })}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
          {t('next')}
        </button>
      </div>
    );
  }
  if (!sample) return <p className="muted">{t('loading')}</p>;
  if (!started) {
    return (
      <div className="card">
        <h1>{t('placementTitle')}</h1>
        <p>{t('placementIntro')}</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>
            {t('placementStart')}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void api.skipPlacement().then(onDone)}
          >
            {t('placementSkip')}
          </button>
        </div>
      </div>
    );
  }
  const item = sample[index];
  const record = (value: string) => {
    const all = [...answers, { lemmaId: item?.lemmaId ?? 0, answer: value }];
    setAnswers(all);
    setAnswer('');
    if (index + 1 >= sample.length) finish(all);
    else setIndex(index + 1);
  };
  if (!item) return null;
  return (
    <div className="card">
      <p className="muted">{t('progress', { n: index + 1, total: sample.length })}</p>
      {item.sentence && <p className="de">{item.sentence}</p>}
      <p>{t('bedeutungTask', { word: item.text })}</p>
      <AnswerInput
        key={item.lemmaId}
        value={answer}
        onChange={setAnswer}
        onSubmit={() => record(answer)}
        placeholder={t('bedeutungPlaceholder')}
        label={t('bedeutungTask', { word: item.text })}
        umlauts={false}
        autoFocus
      />
      <div className="btn-row">
        <button type="button" className="btn btn-quiet" onClick={() => record('')}>
          {t('dontKnow')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => record(answer)}>
          {t('next')}
        </button>
      </div>
      <button type="button" className="link" onClick={() => finish(answers)}>
        {t('placementFinish')}
      </button>
    </div>
  );
}

function SyncStatus({ sync }: { sync: SyncState }): ReactNode {
  const t = useT();
  if (!sync.enabled) return <p className="muted">{t('syncLocal')}</p>;
  return (
    <div>
      <p className={sync.error ? 'correction' : 'muted'}>
        {sync.error
          ? t('syncError', { error: sync.error })
          : sync.lastSync
            ? t('syncLast', { time: new Date(sync.lastSync).toLocaleTimeString() })
            : t('syncNever')}
        {sync.pending > 0 && ` · ${t('syncPending', { n: sync.pending })}`}
      </p>
      <button
        type="button"
        className="btn btn-block"
        disabled={sync.busy}
        onClick={() => void runtime.syncNow()}
      >
        {t('syncNow')}
      </button>
    </div>
  );
}

export function Settings({
  me,
  sync,
  onLang,
  onLogout,
}: {
  me: Me;
  sync: SyncState;
  onLang: (lang: 'de' | 'en') => void;
  onLogout: () => void;
}): ReactNode {
  const t = useT();
  return (
    <>
      <div className="card">
        <h1>{t('settings')}</h1>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t('language')}</legend>
          <div className="btn-row" style={{ marginTop: 0 }}>
            {(['de', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                className="btn"
                aria-pressed={me.uiLang === lang}
                style={
                  me.uiLang === lang
                    ? { background: 'var(--ink-soft)', borderColor: 'var(--ink)' }
                    : {}
                }
                onClick={() => onLang(lang)}
              >
                {lang === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
        </fieldset>
        <p>
          <a href="#/pruefen">{t('toReview')} →</a>
        </p>
        <h2>{t('syncTitle')}</h2>
        <SyncStatus sync={sync} />
        <button type="button" className="btn btn-quiet btn-block" onClick={onLogout}>
          {t('switchPerson')}
        </button>
      </div>
      <SharedSettings me={me} />
      <RewardCatalog me={me} />
      <ChoreCatalog />
    </>
  );
}

export function Word({ lemmaId }: { lemmaId: number }): ReactNode {
  return (
    <div className="card">
      <WordDetail lemmaId={lemmaId} />
    </div>
  );
}
