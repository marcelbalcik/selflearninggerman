import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { frameText } from '../components/parts';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { joinTokens } from '../text';
import type { Prompt, ReviewData } from '../types';
import { LtList, LtText } from './Komposition';

const MARK_TYPES = ['gender', 'case', 'frame', 'ending', 'other'] as const;
type MarkType = (typeof MARK_TYPES)[number];
interface DraftMark {
  start: number;
  end: number;
  type: MarkType;
  correction: string;
  wrong: string;
}

/** One line that shows what the exercise asked. */
export function promptSummary(p: Prompt | null): string {
  if (!p) return '';
  switch (p.type) {
    case 'kasus_luecke':
      return `${joinTokens(p.tokens.map((tok, i) => (i === p.gapIndex ? '___' : tok)))} (${p.cue})`;
    case 'fehlersuche':
      return joinTokens(p.tokens);
    case 'bedeutung':
      return `${p.de} → ${p.word}`;
    case 'en_de_chunk':
      return p.prompt;
    case 'umformen':
      return p.source;
    case 'satzbau':
      return p.chunks.join(' / ');
    case 'wer_tut_was':
      return p.de;
    case 'diktat':
      return p.speak;
  }
}

function KompositionReview({
  k,
  onDone,
}: {
  k: ReviewData['kompositions'][number];
  onDone: () => void;
}): ReactNode {
  const t = useT();
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [wrong, setWrong] = useState('');
  const [type, setType] = useState<MarkType>('case');
  const [correction, setCorrection] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = () => {
    const piece = wrong.trim();
    // The first occurrence not already marked.
    let start = k.text.indexOf(piece);
    while (start >= 0 && marks.some((m) => m.start === start))
      start = k.text.indexOf(piece, start + 1);
    if (!piece || start < 0) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setMarks([
      ...marks,
      { start, end: start + piece.length, type, correction: correction.trim(), wrong: piece },
    ]);
    setWrong('');
    setCorrection('');
  };

  return (
    <div className="card">
      <p className="muted">
        {k.by} · {k.targets.join(', ')}
      </p>
      {k.languageTool ? (
        <LtText text={k.text} matches={k.languageTool} />
      ) : (
        <p className="de ink">{k.text}</p>
      )}
      {k.languageTool && k.languageTool.length > 0 && <LtList matches={k.languageTool} />}
      {marks.length > 0 && (
        <ul>
          {marks.map((m, i) => (
            <li key={i}>
              <span className="mark-wrong">{m.wrong}</span> →{' '}
              <span className="correction">{m.correction}</span> (
              {t(`markType_${m.type}` as MessageKey)}){' '}
              <button
                type="button"
                className="link"
                onClick={() => setMarks(marks.filter((_, j) => j !== i))}
              >
                {t('cancel')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <label htmlFor={`wrong-${k.id}`}>{t('reviewMarkWrong')}</label>
        <input
          id={`wrong-${k.id}`}
          value={wrong}
          lang="de"
          onChange={(e) => setWrong(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`type-${k.id}`}>{t('reviewMarkType')}</label>
        <select
          id={`type-${k.id}`}
          value={type}
          onChange={(e) => setType(e.target.value as MarkType)}
        >
          {MARK_TYPES.map((m) => (
            <option key={m} value={m}>
              {t(`markType_${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`corr-${k.id}`}>{t('reviewMarkCorrection')}</label>
        <input
          id={`corr-${k.id}`}
          value={correction}
          lang="de"
          onChange={(e) => setCorrection(e.target.value)}
        />
      </div>
      {notFound && (
        <p role="alert" className="correction">
          {t('reviewNotFound')}
        </p>
      )}
      <div className="btn-row">
        <button type="button" className="btn" onClick={add}>
          {t('reviewAddMark')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api
              .reviewKomposition(
                k.id,
                marks.map(({ start, end, type: mt, correction: c }) => ({
                  start,
                  end,
                  type: mt,
                  correction: c,
                })),
              )
              .then(onDone)
              .finally(() => setBusy(false));
          }}
        >
          {t('reviewDone')}
        </button>
      </div>
    </div>
  );
}

/** Prüfen: disputes, partner texts, reports, frames and open word questions (spec §6.9, §8). */
export function Pruefen(): ReactNode {
  const t = useT();
  const [data, setData] = useState<ReviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const load = useCallback(() => {
    setFailed(false);
    api.review().then(setData, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed)
    return (
      <div className="card">
        <p>{t('error')}</p>
        <button type="button" className="btn" onClick={load}>
          {t('retry')}
        </button>
      </div>
    );
  if (!data) return <p className="muted">{t('loading')}</p>;

  // Long lists (190 verb frames at first) show a few items until expanded.
  const LIMIT = 5;
  const few = <T,>(key: string, list: T[]): T[] => (expanded[key] ? list : list.slice(0, LIMIT));
  const more = (key: string, n: number) =>
    !expanded[key] && n > LIMIT ? (
      <button
        type="button"
        className="btn btn-quiet btn-block"
        onClick={() => setExpanded({ ...expanded, [key]: true })}
      >
        {t('showAll', { n })}
      </button>
    ) : null;
  const act = (p: Promise<unknown>) => void p.then(load, () => setFailed(true));
  const empty =
    data.disputes.length +
      data.kompositions.length +
      data.reports.length +
      data.frames.length +
      data.lemmas.length ===
    0;

  return (
    <>
      <div className="card">
        <h1>{t('review')}</h1>
        {empty && <p>{t('reviewEmpty')}</p>}
      </div>

      {data.disputes.length > 0 && <h2>{t('reviewDisputes')}</h2>}
      {data.disputes.map((d) => (
        <div className="card" key={d.id}>
          <p className="de">{promptSummary(d.prompt)}</p>
          <p className="muted">{t('reviewDisputeBy', { name: d.by })}</p>
          <p className="de ink">{d.answer}</p>
          {d.note && <p className="note">{d.note}</p>}
          <p>
            <span className="label">{t('correctAnswer')}: </span>
            <span className="de">{d.accepted.join(' · ')}</span>
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => act(api.decideDispute(d.id, false))}
            >
              {t('reject')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act(api.decideDispute(d.id, true))}
            >
              {t('approve')}
            </button>
          </div>
        </div>
      ))}

      {data.kompositions.length > 0 && <h2>{t('reviewKompositions')}</h2>}
      {data.kompositions.map((k) => (
        <KompositionReview key={k.id} k={k} onDone={load} />
      ))}

      {data.reports.length > 0 && <h2>{t('reviewReports')}</h2>}
      {few('reports', data.reports).map((r) => (
        <div className="card" key={r.id}>
          <p className="de">{r.de}</p>
          <p className="muted">
            {r.name}
            {r.reason ? `: ${r.reason}` : ''}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => act(api.decideReport(r.id, 'reject'))}
            >
              {t('reportReject')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act(api.decideReport(r.id, 'fixed'))}
            >
              {t('reportFixed')}
            </button>
          </div>
        </div>
      ))}
      {more('reports', data.reports.length)}

      {data.frames.length > 0 && (
        <h2>
          {t('reviewFrames')} ({data.frames.length})
        </h2>
      )}
      {few('frames', data.frames).map((f) => (
        <div className="card" key={f.lemmaId}>
          <p>
            <strong className="de">{f.text}</strong> <span className="muted">{f.gloss}</span>
          </p>
          <p className="de">{frameText(f.proposal) || t('frameNone')}</p>
          {f.corpus && (
            <p className="muted">
              {Object.entries(f.corpus.counts)
                .map(([k, n]) => `${k}: ${n}/${f.corpus?.uses ?? 0}`)
                .join(' · ')}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => act(api.decideFrame(f.lemmaId, 'rejected'))}
            >
              {t('reject')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act(api.decideFrame(f.lemmaId, 'approved'))}
            >
              {t('approve')}
            </button>
          </div>
        </div>
      ))}
      {more('frames', data.frames.length)}

      {data.lemmas.length > 0 && (
        <div className="card">
          <h2>
            {t('reviewLemmas')} ({data.lemmas.length})
          </h2>
          <ul>
            {few('lemmas', data.lemmas).map((l) => (
              <li key={l.id}>
                <a href={`#/wort/${l.id}`} className="de">
                  {l.text}
                </a>{' '}
                <span className="muted">{(l.review_reasons ?? []).join(', ')}</span>
              </li>
            ))}
          </ul>
          {more('lemmas', data.lemmas.length)}
        </div>
      )}

      {data.myDisputes.length > 0 && (
        <div className="card">
          <h2>{t('myDisputes')}</h2>
          <ul>
            {data.myDisputes.map((d) => (
              <li key={d.id}>
                <span className="de">{d.answer_raw}</span> –{' '}
                {t(`disputeStatus_${d.status}` as MessageKey)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
