import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useT } from '../i18n';
import { insertAt } from '../text';
import type { Case, LemmaDetail, Mark, Row, VerbInfo } from '../types';

/** Answer field with the ä ö ü ß row above the keyboard (spec §6). */
export function AnswerInput(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
  umlauts?: boolean;
  autoFocus?: boolean;
}): ReactNode {
  const ref = useRef<HTMLInputElement>(null);
  const [upper, setUpper] = useState(false);
  const letters = upper ? ['Ä', 'Ö', 'Ü'] : ['ä', 'ö', 'ü', 'ß'];
  const insert = (ch: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? props.value.length;
    const end = el?.selectionEnd ?? props.value.length;
    const next = insertAt(props.value, start, end, ch);
    props.onChange(next.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <label htmlFor="answer" className="visually-hidden">
        {props.label}
      </label>
      {props.umlauts !== false && (
        <div className="umlauts">
          {letters.map((ch) => (
            <button
              key={ch}
              type="button"
              // Keep the keyboard open: do not take focus from the input.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(ch)}
            >
              {ch}
            </button>
          ))}
          <button
            type="button"
            aria-label="Großbuchstaben"
            aria-pressed={upper}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setUpper((u) => !u)}
          >
            ⇧
          </button>
        </div>
      )}
      <input
        id="answer"
        ref={ref}
        className="answer-input"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={props.autoFocus}
        enterKeyHint="done"
      />
    </form>
  );
}

/** The learner's answer in ink, wrong characters in red (spec §10). */
export function Marks({ marks }: { marks: Mark[] }): ReactNode {
  return (
    <span className="ink" data-testid="marks">
      {marks.map((m, i) =>
        m.status === 'ok' ? (
          <span key={i}>{m.text}</span>
        ) : m.status === 'wrong' ? (
          <span key={i} className="mark-wrong">
            {m.text}
          </span>
        ) : (
          <span key={i} className="mark-missing" aria-label={`fehlt: ${m.text}`}>
            {m.text}
          </span>
        ),
      )}
    </span>
  );
}

const CASES: Case[] = ['nom', 'akk', 'dat', 'gen'];

/** Every noun shows its case forms (spec §1.4). */
export function Declension({ forms }: { forms: { sg: Row | null; pl: Row | null } }): ReactNode {
  const t = useT();
  return (
    <table className="decl">
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">Kasus</span>
          </th>
          {forms.sg && <th scope="col">{t('singular')}</th>}
          {forms.pl && <th scope="col">{t('plural')}</th>}
        </tr>
      </thead>
      <tbody>
        {CASES.map((c) => (
          <tr key={c}>
            <th scope="row">{t(`case_${c}`)}</th>
            {forms.sg && <td>{forms.sg[c]}</td>}
            {forms.pl && <td>{forms.pl[c]}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CASE_ABBR: Record<string, string> = { akk: 'Akk.', dat: 'Dat.' };

export function frameText(frame: VerbInfo['frame']): string {
  if (!frame) return '';
  const parts = [
    ...frame.objects.map((o) => (o === 'dat' ? 'jdm. (Dat.)' : 'jdn./etw. (Akk.)')),
    ...(frame.preps ?? []).map((p) => `${p.prep} + ${CASE_ABBR[p.case] ?? p.case}`),
  ];
  return parts.join(', ');
}

export function VerbForms({ verb, infinitive }: { verb: VerbInfo; infinitive: string }): ReactNode {
  const t = useT();
  const aux = verb.aux === 'both' ? 'hat/ist' : verb.aux === 'sein' ? 'ist' : 'hat';
  const rows: [string, string | null][] = [
    [
      t('praesens'),
      [verb.praesens2sg && `du ${verb.praesens2sg}`, verb.praesens3sg && `er ${verb.praesens3sg}`]
        .filter(Boolean)
        .join(', '),
    ],
    [t('praeteritum'), verb.praeteritum3sg && `er ${verb.praeteritum3sg}`],
    [t('perfekt'), verb.partizip2 && `er ${aux} ${verb.partizip2}`],
    [t('zuInfinitiv'), verb.zuInfinitive],
    [
      t('frame'),
      verb.frameStatus === 'approved' && verb.frame ? frameText(verb.frame) || '—' : null,
    ],
  ];
  return (
    <table className="decl" aria-label={`${t('verbForms')}: ${infinitive}`}>
      <tbody>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

/** Word title with its article as one unit (spec §1.4). */
export function WordTitle({ article, text }: { article: string | null; text: string }): ReactNode {
  return (
    <p className="word-title">
      {article && <span className="article">{article} </span>}
      {text}
    </p>
  );
}

/** Wort screen content: forms, verb forms, examples, memory per facet. */
export function WordDetail({ lemmaId }: { lemmaId: number }): ReactNode {
  const t = useT();
  const [data, setData] = useState<LemmaDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.lemma(lemmaId).then(setData, () => setFailed(true));
  }, [lemmaId]);
  if (failed) return <p>{t('error')}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  return (
    <div>
      <WordTitle article={data.article} text={data.text} />
      <p className="muted">{data.gloss}</p>
      {data.forms && <Declension forms={data.forms} />}
      {data.verb && <VerbForms verb={data.verb} infinitive={data.text} />}
      {data.examples.length > 0 && (
        <>
          <h3>{t('examples')}</h3>
          {data.examples.map((e) => (
            <p key={e.de}>
              <span className="de">{e.de}</span>
              <br />
              <span className="muted">{e.en}</span>
            </p>
          ))}
        </>
      )}
      {data.facets.length > 0 && (
        <>
          <h3>{t('memory')}</h3>
          {data.facets.map((f) => (
            <div key={f.facet} style={{ marginBottom: 10 }}>
              <div className="stat">
                <span>{t(`facet_${f.facet}` as Parameters<typeof t>[0])}</span>
                <span className="muted">
                  {f.unlocked
                    ? t('stabilityDays', { days: Math.round(f.stabilityDays) })
                    : t('locked')}
                </span>
              </div>
              <div className="bar" role="presentation">
                <span
                  style={{ width: `${Math.round(Math.min(1, f.stabilityDays / 60) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function Overlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="overlay-inner">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          {t('close')}
        </button>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  );
}
