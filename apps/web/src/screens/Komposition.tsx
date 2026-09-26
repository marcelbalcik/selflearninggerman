import { useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useT } from '../i18n';
import type { KompositionResult, KompositionTask, LtMatch } from '../types';

/** The text with LanguageTool's findings underlined in correction red. */
export function LtText({ text, matches }: { text: string; matches: LtMatch[] }): ReactNode {
  const parts: ReactNode[] = [];
  let at = 0;
  const sorted = [...matches].sort((a, b) => a.offset - b.offset);
  for (const [i, m] of sorted.entries()) {
    if (m.offset < at) continue;
    parts.push(text.slice(at, m.offset));
    parts.push(
      <span key={i} className="mark-wrong" title={m.message}>
        {text.slice(m.offset, m.offset + m.length)}
      </span>,
    );
    at = m.offset + m.length;
  }
  parts.push(text.slice(at));
  return <p className="de ink">{parts}</p>;
}

export function LtList({ matches }: { matches: LtMatch[] }): ReactNode {
  return (
    <ul>
      {matches.map((m, i) => (
        <li key={i}>
          {m.message}
          {m.replacements.length > 0 && (
            <>
              {' → '}
              <span className="correction">{m.replacements.slice(0, 3).join(', ')}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Spec §6.8: two sentences with three target words, checked, then partner-reviewed. */
export function KompositionTaskView({
  task,
  onDone,
}: {
  task: KompositionTask;
  onDone: () => void;
}): ReactNode {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KompositionResult | null>(null);
  const [failed, setFailed] = useState(false);

  const submit = () => {
    setBusy(true);
    setFailed(false);
    api
      .komposition(
        task.lemmas.map((l) => l.id),
        task.requiredCase,
        text.trim(),
      )
      .then(setResult, () => setFailed(true))
      .finally(() => setBusy(false));
  };

  const nameOf = (id: number) => task.lemmas.find((l) => l.id === id);

  return (
    <div className="card">
      <h1>{t('kompositionTitle')}</h1>
      <p>{t('kompositionTask')}</p>
      <p className="de" style={{ fontSize: '1.25rem' }}>
        {task.lemmas.map((l, i) => (
          <span key={l.id}>
            {i > 0 && ' · '}
            {l.article && <span className="article">{l.article} </span>}
            <strong>{l.text}</strong>
          </span>
        ))}
      </p>
      {task.requiredCase === 'dat' && <p className="note">{t('kompositionDative')}</p>}
      {!result ? (
        <>
          <label htmlFor="komposition" className="visually-hidden">
            {t('yourAnswer')}
          </label>
          <textarea
            id="komposition"
            className="answer-input"
            rows={4}
            value={text}
            lang="de"
            autoCapitalize="sentences"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
          {failed && (
            <p role="alert" className="correction">
              {t('error')}
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-quiet" onClick={onDone}>
              {t('skip')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || text.trim().length < 5}
              onClick={submit}
            >
              {t('kompositionSend')}
            </button>
          </div>
        </>
      ) : (
        <div className="feedback">
          {result.languageTool ? (
            <LtText text={text.trim()} matches={result.languageTool} />
          ) : (
            <p className="de ink">{text.trim()}</p>
          )}
          <ul>
            {result.checks.map((c) => {
              const l = nameOf(c.lemmaId);
              return (
                <li key={c.lemmaId}>
                  {l?.text}:{' '}
                  {c.found ? (
                    <span className="tick">✓ {t('kompositionFound')}</span>
                  ) : (
                    <span className="correction">{t('kompositionMissing')}</span>
                  )}
                  {c.ltIssue && <span className="correction"> · {c.ltIssue}</span>}
                </li>
              );
            })}
          </ul>
          {task.requiredCase === 'dat' &&
            (result.checks.some((c) => c.dative) ? (
              <p className="tick">✓ {t('kompositionDativeOk')}</p>
            ) : (
              <p className="correction">{t('kompositionDativeMissing')}</p>
            ))}
          <h2>{t('kompositionLt')}</h2>
          {result.languageTool && result.languageTool.length > 0 ? (
            <LtList matches={result.languageTool} />
          ) : (
            <p className="muted">{result.languageTool ? t('correct') : t('kompositionNoLt')}</p>
          )}
          <p className="note">{t('kompositionPartner')}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
