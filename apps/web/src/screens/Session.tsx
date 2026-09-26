import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api';
import {
  AnswerInput,
  AudioButton,
  Declension,
  Marks,
  Overlay,
  VerbForms,
  WordDetail,
  WordTitle,
} from '../components/parts';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { joinTokens } from '../text';
import type { ExerciseItem, Feedback, IntroItem, SessionItem, SessionPlan } from '../types';
import { KompositionTaskView } from './Komposition';

export function Session({
  reviewsOnly,
  onDone,
}: {
  reviewsOnly: boolean;
  onDone: () => void;
}): ReactNode {
  const t = useT();
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [failed, setFailed] = useState(false);
  const [kompositionDone, setKompositionDone] = useState(false);

  useEffect(() => {
    api.session(reviewsOnly).then(setPlan, () => setFailed(true));
  }, [reviewsOnly]);

  if (failed) return <p>{t('error')}</p>;
  if (!plan) return <p className="muted">{t('loading')}</p>;
  const item: SessionItem | undefined = plan.items[index];
  if (!item && plan.komposition && !kompositionDone) {
    return <KompositionTaskView task={plan.komposition} onDone={() => setKompositionDone(true)} />;
  }
  if (!item) {
    return (
      <div className="card">
        <h1>{t('sessionDone')}</h1>
        {score.total > 0 ? (
          <p>{t('sessionSummary', { correct: score.correct, total: score.total })}</p>
        ) : (
          <p>{t('nothingDue')}</p>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
          {t('backToToday')}
        </button>
      </div>
    );
  }
  const next = () => setIndex((i) => i + 1);
  return (
    <div>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={index}
        aria-valuemax={plan.items.length}
      >
        <span style={{ width: `${(index / plan.items.length) * 100}%` }} />
      </div>
      <p className="muted" aria-live="polite">
        {t('progress', { n: index + 1, total: plan.items.length })}
      </p>
      {item.kind === 'intro' ? (
        <Intro key={`i${item.lemmaId}`} item={item} onNext={next} />
      ) : (
        <Exercise
          key={`e${index}`}
          item={item}
          onNext={(correct) => {
            setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
            next();
          }}
        />
      )}
    </div>
  );
}

/** Read a sentence aloud with the device's German voice (spec §6.5). */
function speak(text: string, rate: number): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = rate;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

function Intro({ item, onNext }: { item: IntroItem; onNext: () => void }): ReactNode {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const l = item.lemma;
  return (
    <div className="card">
      <p className="muted">{t('newWord')}</p>
      <WordTitle article={l.article} text={l.text} />
      <p>{l.gloss}</p>
      <AudioButton url={l.audioUrl} />
      {l.example && (
        <p style={{ marginTop: 12 }}>
          <span className="de">{l.example.de}</span>
          <br />
          <span className="muted">{l.example.en}</span>
        </p>
      )}
      {l.forms && <Declension forms={l.forms} />}
      {l.verb && <VerbForms verb={l.verb} infinitive={l.text} />}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          api.intro(item.lemmaId).then(onNext, () => setBusy(false));
        }}
      >
        {t('next')}
      </button>
    </div>
  );
}

function Exercise({
  item,
  onNext,
}: {
  item: ExerciseItem;
  onNext: (correct: boolean) => void;
}): ReactNode {
  const t = useT();
  const shownAt = useRef(performance.now());
  const [answer, setAnswer] = useState('');
  const [tapped, setTapped] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = (override?: string) => {
    const typed = override ?? answer;
    if (busy || feedback) return;
    if (item.exerciseType === 'fehlersuche' && tapped === null) {
      setMessage(t('fehlerTapFirst'));
      return;
    }
    setBusy(true);
    api
      .attempt({
        sentenceId: item.sentenceId,
        answer: typed,
        latencyMs: Math.round(performance.now() - shownAt.current),
        ...(tapped !== null ? { tappedIndex: tapped } : {}),
        ...(hint ? { hintUsed: true } : {}),
      })
      .then(setFeedback, (e: unknown) => setMessage(e instanceof ApiError ? e.message : t('error')))
      .finally(() => setBusy(false));
  };

  if (feedback) {
    return (
      <FeedbackPanel item={item} feedback={feedback} onNext={() => onNext(feedback.correct)} />
    );
  }

  const p = item.prompt;
  return (
    <div className="card">
      {p.type === 'kasus_luecke' && (
        <>
          <p className="muted">{t('kasusTask')}</p>
          <p className="de">
            {joinTokens(p.tokens.slice(0, p.gapIndex))}
            <span className="gap" aria-label="Lücke">
              &nbsp;
            </span>
            {joinTokens(['', ...p.tokens.slice(p.gapIndex + 1)])}
          </p>
          <p className="cue">({p.cue})</p>
          <AnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={() => submit()}
            placeholder={t('answerPlaceholder')}
            label={t('answerPlaceholder')}
            autoFocus
          />
        </>
      )}
      {p.type === 'fehlersuche' && (
        <>
          <p className="muted">{t('fehlerTask')}</p>
          <div className="tokens" role="group">
            {p.tokens.map((tok, i) =>
              /^[.,!?;:]$/u.test(tok) ? (
                <span key={i} className="de">
                  {tok}
                </span>
              ) : (
                <button
                  key={i}
                  type="button"
                  className="token"
                  aria-pressed={tapped === i}
                  onClick={() => {
                    setTapped(i);
                    setMessage(null);
                  }}
                >
                  {tok}
                </button>
              ),
            )}
          </div>
          {tapped !== null && (
            <>
              <p style={{ marginTop: 12 }}>{t('fehlerCorrection')}</p>
              <AnswerInput
                value={answer}
                onChange={setAnswer}
                onSubmit={() => submit()}
                placeholder={t('answerPlaceholder')}
                label={t('fehlerCorrection')}
                autoFocus
              />
            </>
          )}
        </>
      )}
      {p.type === 'bedeutung' && (
        <>
          <p className="de">
            {p.tokens.map((tok, i) => (
              <span key={i}>
                {i > 0 && !/^[.,!?;:]/u.test(tok) ? ' ' : ''}
                <span className={i === p.highlightIndex ? 'highlight' : undefined}>{tok}</span>
              </span>
            ))}
          </p>
          <p>{t('bedeutungTask', { word: p.word })}</p>
          {hint && <p className="muted">{t('hintShown', { letter: p.hint })}</p>}
          <AnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={() => submit()}
            placeholder={t('bedeutungPlaceholder')}
            label={t('bedeutungTask', { word: p.word })}
            umlauts={false}
            autoFocus
          />
        </>
      )}
      {p.type === 'en_de_chunk' && (
        <>
          <p className="muted">{p.pos === 'noun' ? t('chunkTask') : t('chunkTaskWord')}</p>
          <p className="de" lang="en">
            {p.prompt}
          </p>
          <AnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={() => submit()}
            placeholder={t('answerPlaceholder')}
            label={p.prompt}
            autoFocus
          />
        </>
      )}
      {p.type === 'umformen' && (
        <>
          <p className="muted">{t(`umformen_${p.instruction}`)}</p>
          <p className="de">{p.source}</p>
          <AnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={() => submit()}
            placeholder={t('answerPlaceholder')}
            label={t(`umformen_${p.instruction}`)}
            autoFocus
          />
        </>
      )}
      {p.type === 'satzbau' && (
        <>
          <p className="muted">{t(`satzbau_${p.frame}`)}</p>
          <p className="muted" style={{ marginBottom: 6 }}>
            {t('satzbauChunks')}
          </p>
          <div className="tokens" aria-label={t('satzbauChunks')}>
            {p.chunks.map((c) => (
              <span key={c} className="token" style={{ cursor: 'default' }}>
                {c}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <AnswerInput
              value={answer}
              onChange={setAnswer}
              onSubmit={() => submit()}
              placeholder={p.frame === 'nebensatz' ? '…, weil …' : t('answerPlaceholder')}
              label={t(`satzbau_${p.frame}`)}
              autoFocus
            />
          </div>
        </>
      )}
      {p.type === 'wer_tut_was' && (
        <>
          <p className="muted">{t('werTask')}</p>
          <p className="de">{p.de}</p>
          <div className="btn-row" style={{ flexDirection: 'column' }}>
            {p.options.map((o, i) => (
              <button
                key={o}
                type="button"
                className="btn"
                lang="en"
                disabled={busy}
                onClick={() => submit(String(i))}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}
      {p.type === 'diktat' && (
        <>
          <p className="muted">{t('diktatTask')}</p>
          <div className="btn-row" style={{ marginTop: 0, marginBottom: 12 }}>
            <button type="button" className="btn" onClick={() => speak(p.speak, 0.95)}>
              <span aria-hidden="true">▶</span> {t('diktatPlay')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => speak(p.speak, 0.7)}>
              {t('diktatSlow')}
            </button>
          </div>
          <AnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={() => submit()}
            placeholder={t('answerPlaceholder')}
            label={t('diktatTask')}
          />
        </>
      )}
      {message && (
        <p role="alert" className="correction">
          {message}
        </p>
      )}
      <div className="btn-row">
        {p.type === 'bedeutung' && !hint && (
          <button type="button" className="btn btn-quiet" onClick={() => setHint(true)}>
            {t('hint')}
          </button>
        )}
        {p.type === 'bedeutung' && (
          <button type="button" className="btn btn-quiet" onClick={() => submit('')}>
            {t('dontKnow')}
          </button>
        )}
        {p.type !== 'wer_tut_was' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => submit()}
          >
            {t('check')}
          </button>
        )}
      </div>
    </div>
  );
}

function FeedbackPanel({
  item,
  feedback,
  onNext,
}: {
  item: ExerciseItem;
  feedback: Feedback;
  onNext: () => void;
}): ReactNode {
  const t = useT();
  const [followUpDone, setFollowUpDone] = useState(feedback.followUp === null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const [showWord, setShowWord] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputed, setDisputed] = useState(false);
  const canDispute =
    !feedback.correct && item.exerciseType !== 'wer_tut_was' && feedback.answer.trim() !== '';
  const errorKey = feedback.errorClass ? (`err_${feedback.errorClass}` as MessageKey) : null;

  return (
    <div className="card feedback" aria-live="polite">
      <h2>
        {feedback.correct ? (
          <>
            <span className="tick" aria-hidden="true">
              ✓
            </span>
            {t('correct')}
          </>
        ) : (
          t('wrong')
        )}
      </h2>
      {item.exerciseType === 'fehlersuche' && item.prompt.type === 'fehlersuche' && (
        <p className="de">{joinTokens(item.prompt.tokens)}</p>
      )}
      <p className="label">{t('yourAnswer')}</p>
      <p className="de">
        {item.prompt.type === 'wer_tut_was' ? (
          <span className="ink">{item.prompt.options[Number(feedback.answer)] ?? '—'}</span>
        ) : feedback.answer ? (
          <Marks marks={feedback.marks} />
        ) : (
          '—'
        )}
      </p>
      {!feedback.correct && (
        <>
          <p className="label">{t('correctAnswer')}</p>
          <p className="de">{feedback.expected}</p>
        </>
      )}
      {errorKey && <p>{t(errorKey)}</p>}
      {feedback.secondary.map((s) => (
        <p key={s}>{t(`err_${s}` as MessageKey)}</p>
      ))}
      {feedback.notes.map((n) => (
        <p key={n} className="note">
          {t(`note_${n}` as MessageKey)}
        </p>
      ))}

      {!followUpDone && feedback.followUp && (
        <div>
          <p>
            <strong>{t('genderQuestion', { lemma: feedback.followUp.lemma })}</strong>
          </p>
          <div className="btn-row">
            {(['m', 'f', 'n'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className="btn"
                onClick={() => {
                  void api.followUp(feedback.attemptId, g).then(() => setFollowUpDone(true));
                }}
              >
                {{ m: 'der', f: 'die', n: 'das' }[g]}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedback.forms && <Declension forms={feedback.forms} />}

      {disputed && <p className="note">{t('disputeSent')}</p>}
      {disputing && !disputed && (
        <div>
          <label htmlFor="dispute">{t('disputeNote')}</label>
          <textarea
            id="dispute"
            className="answer-input"
            rows={2}
            value={disputeNote}
            onChange={(e) => setDisputeNote(e.target.value)}
            style={{ fontStyle: 'normal', color: 'inherit' }}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-quiet" onClick={() => setDisputing(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void api.dispute(feedback.attemptId, disputeNote).then(() => setDisputed(true))
              }
            >
              {t('dispute')}
            </button>
          </div>
        </div>
      )}
      {reported ? (
        <p className="note">{t('reported')}</p>
      ) : reporting ? (
        <div>
          <label htmlFor="reason">{t('reportReason')}</label>
          <textarea
            id="reason"
            className="answer-input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ fontStyle: 'normal', color: 'inherit' }}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-quiet" onClick={() => setReporting(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void api.report(item.sentenceId, reason).then(() => setReported(true));
              }}
            >
              {t('reportSend')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="btn-row">
        <button type="button" className="btn btn-quiet" onClick={() => setShowWord(true)}>
          {t('showWord')}
        </button>
        {canDispute && !disputing && !disputed && (
          <button type="button" className="btn btn-quiet" onClick={() => setDisputing(true)}>
            {t('dispute')}
          </button>
        )}
        {!reported && !reporting && (
          <button type="button" className="btn btn-quiet" onClick={() => setReporting(true)}>
            {t('report')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!followUpDone}
          onClick={onNext}
          autoFocus={followUpDone}
        >
          {t('next')}
        </button>
      </div>
      {showWord && (
        <Overlay onClose={() => setShowWord(false)}>
          <WordDetail lemmaId={item.lemmaId} />
        </Overlay>
      )}
    </div>
  );
}
