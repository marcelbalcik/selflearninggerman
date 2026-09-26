import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api';
import { AnswerInput, WordDetail } from '../components/parts';
import { useT } from '../i18n';
import type { Me, PlacementItem, Today as TodayData } from '../types';

export function Login({ onLogin }: { onLogin: () => void }): ReactNode {
  const t = useT();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        api
          .login(name.trim(), password)
          .then(onLogin, (err: unknown) =>
            setError(
              err instanceof ApiError && err.status === 429
                ? t('tooManyAttempts')
                : t('loginFailed'),
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <h1>{t('appName')}</h1>
      <div className="field">
        <label htmlFor="name">{t('name')}</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
        />
      </div>
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
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {t('login')}
      </button>
    </form>
  );
}

export function Today({
  me,
  onStart,
}: {
  me: Me;
  onStart: (reviewsOnly: boolean) => void;
}): ReactNode {
  const t = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.today().then(setData, () => setFailed(true));
  }, []);
  if (failed) return <p>{t('error')}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  const nothing = data.dueItems === 0 && data.newRemaining === 0;
  return (
    <div>
      <h1>{t('hello', { name: me.name })}</h1>
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
      <p className="muted">{t('comingSoon')}</p>
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

export function Settings({
  me,
  onLang,
  onLogout,
}: {
  me: Me;
  onLang: (lang: 'de' | 'en') => void;
  onLogout: () => void;
}): ReactNode {
  const t = useT();
  return (
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
      <button type="button" className="btn btn-quiet btn-block" onClick={onLogout}>
        {t('logout')}
      </button>
    </div>
  );
}

export function Word({ lemmaId }: { lemmaId: number }): ReactNode {
  return (
    <div className="card">
      <WordDetail lemmaId={lemmaId} />
    </div>
  );
}
