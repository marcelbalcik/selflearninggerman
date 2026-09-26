import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api';
import { Declension } from '../components/parts';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import type { Chore, Me, Voucher } from '../types';
import { fmtDate } from './Competition';

/** The chore as vocabulary: the sentence, the separable split and the noun's declension strip (spec §9.4). */
export function ChoreText({ chore, lang }: { chore: Chore; lang: Me['uiLang'] }): ReactNode {
  return (
    <>
      <p className="de ink" style={{ fontSize: '1.2rem' }}>
        {chore.sentenceDe}
      </p>
      <p className="muted">
        {lang === 'de' ? chore.titleDe : chore.titleEn}
        {chore.verbSplit && chore.verbSplit.includes('|') && (
          <>
            {' · '}
            <span className="de">{chore.verbSplit}</span>
          </>
        )}
      </p>
      {chore.nounForms && <Declension forms={chore.nounForms.table} />}
    </>
  );
}

function VoucherCard({
  v,
  chores,
  me,
  reload,
}: {
  v: Voucher;
  chores: Chore[];
  me: Me;
  reload: () => void;
}): ReactNode {
  const t = useT();
  const [pick, setPick] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iWon = v.winnerId === me.id;
  const act = (p: Promise<unknown>) =>
    void p.then(reload, (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')));
  const options = chores.filter((c) => c.size === v.size && c.active);

  return (
    <div className={v.overdue ? 'card card-overdue' : 'card'}>
      <p className="muted">
        <span className="size">{v.size}</span> {t(`from_${v.kind}` as MessageKey)} ·{' '}
        {iWon ? t('choreTheyDo', { name: v.loser }) : t('choreYouDo')} ·{' '}
        {t(`status_${v.status}` as MessageKey)}
        {v.overdue && <strong className="correction"> · {t('overdue')}</strong>}
      </p>
      {v.status === 'choose' &&
        (iWon ? (
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend>
              {t('choreChoose', { size: v.size })}{' '}
              <span className="muted">
                {t('choreChooseBy', { date: fmtDate(v.chooseBy, me.uiLang) })}
              </span>
            </legend>
            {options.map((c) => (
              <label key={c.id} className="chore-option">
                <input
                  type="radio"
                  name={`chore-${v.id}`}
                  checked={pick === c.id}
                  onChange={() => setPick(c.id)}
                />{' '}
                <span className="de">{c.sentenceDe}</span>
              </label>
            ))}
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={pick === null}
              onClick={() => pick !== null && act(api.chooseChore(v.id, pick))}
            >
              {t('save')}
            </button>
          </fieldset>
        ) : (
          <p>{t('choreWaitChoose', { name: v.winner, date: fmtDate(v.chooseBy, me.uiLang) })}</p>
        ))}
      {v.chore && <ChoreText chore={v.chore} lang={me.uiLang} />}
      {v.status === 'open' && v.deadline && (
        <p className={v.overdue ? 'correction' : 'muted'}>
          {t('choreDeadline', { date: fmtDate(v.deadline, me.uiLang) })}
        </p>
      )}
      {v.status === 'open' && !iWon && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => act(api.voucherAction(v.id, 'done'))}
        >
          {t('choreDone')}
        </button>
      )}
      {v.status === 'done' &&
        (iWon ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => act(api.voucherAction(v.id, 'confirm'))}
            >
              {t('choreConfirm')}
            </button>
            <p className="muted">{t('choreConfirmAuto')}</p>
          </>
        ) : (
          <p className="muted">{t('choreWaitConfirm', { name: v.winner })}</p>
        ))}
      {v.status === 'confirmed' && <p className="tick">✓ {t('choreConfirmed')}</p>}
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
    </div>
  );
}

/** Aufgaben: chore vouchers won and received; overdue ones in red. */
export function AufgabenScreen({ me }: { me: Me }): ReactNode {
  const t = useT();
  const [data, setData] = useState<{ vouchers: Voucher[]; chores: Chore[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api.vouchers().then(setData, () => setFailed(true));
  }, []);
  useEffect(load, [load]);
  if (failed) return <p>{t('error')}</p>;
  if (!data) return <p className="muted">{t('loading')}</p>;
  const open = data.vouchers.filter((v) => v.status !== 'confirmed');
  const closed = data.vouchers.filter((v) => v.status === 'confirmed').slice(0, 10);
  return (
    <>
      <div className="card">
        <h1>{t('chores')}</h1>
        {open.length === 0 && <p>{t('choreNone')}</p>}
      </div>
      {open.map((v) => (
        <VoucherCard key={v.id} v={v} chores={data.chores} me={me} reload={load} />
      ))}
      {closed.length > 0 && <h2>{t('history')}</h2>}
      {closed.map((v) => (
        <VoucherCard key={v.id} v={v} chores={data.chores} me={me} reload={load} />
      ))}
    </>
  );
}
