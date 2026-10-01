import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api';
import { useT } from '../i18n';
import type { CoopLive, Me, Redemption, Reward, Wochenziel } from '../types';
import { fmtDate } from './Competition';

/** Both people's active days and texts this week, and the tier it secures (spec §9.5). */
export function CoopProgress({ coop, me }: { coop: CoopLive; me: Me }): ReactNode {
  const t = useT();
  return (
    <>
      {coop.progress.map((p) => (
        <div key={p.userId} style={{ marginBottom: 8 }}>
          <strong>{p.userId === me.id ? t('you') : p.name}</strong>
          <div className="days" aria-label={t('activeDays', { n: p.activeDays })}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = p.days[i];
              return (
                <span key={i} className={d?.active ? 'day day-on' : 'day'}>
                  {d?.active ? '✓' : ''}
                </span>
              );
            })}
          </div>
          <span className="muted">
            {t('activeDays', { n: p.activeDays })} · {t('kompositionCount', { n: p.kompositions })}
          </span>
        </div>
      ))}
      <p>
        <strong>
          {coop.secured !== null ? t('secured', { eur: coop.secured }) : t('securedNone')}
        </strong>
      </p>
    </>
  );
}

/** The reward card: turns over once when it first appears (the app's one show-off motion). */
function RewardCard({ reward, lang }: { reward: Reward; lang: Me['uiLang'] }): ReactNode {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setFlipped(true), 50);
    return () => window.clearTimeout(id);
  }, [reward.id]);
  return (
    <div className="reveal" data-flipped={flipped}>
      <div className="reveal-inner">
        <div className="reveal-back" aria-hidden="true">
          ?
        </div>
        <div className="reveal-front">
          <p className="muted">
            {reward.budgetEur} € · {t(`kind_${reward.kind}`)}
          </p>
          <h2 className="de">{lang === 'de' ? reward.titleDe : reward.titleEn}</h2>
          {reward.missionDe && (
            <p>
              <span className="label">{t('mission')}: </span>
              <span className="de ink">{reward.missionDe}</span>
            </p>
          )}
          {reward.estCostNote && <p className="muted">{reward.estCostNote}</p>}
        </div>
      </div>
    </div>
  );
}

function RedemptionCard({
  r,
  me,
  reload,
}: {
  r: Redemption;
  me: Me;
  reload: () => void;
}): ReactNode {
  const t = useT();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const partner = me.partner?.name ?? '';
  const act = (p: Promise<unknown>) =>
    void p.then(reload, (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')));

  return (
    <div className="card">
      <p className="muted">
        {t('total', { eur: r.totalEur })} · {t('band')}: {r.drawnBandEur ?? r.bandEur} €
        {r.changeEur > 0 && ` · ${t('change', { eur: r.changeEur })}`}
      </p>
      {r.status === 'pending' &&
        (r.startedBy === me.id ? (
          <>
            <p>{t('waitingFor', { name: partner })}</p>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => act(api.redemption(r.id, 'undo'))}
            >
              {t('withdraw')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => act(api.redemption(r.id, 'confirm'))}
          >
            {t('redeemConfirm')}
          </button>
        ))}
      {r.reward && r.status !== 'pending' && <RewardCard reward={r.reward} lang={me.uiLang} />}
      {r.status === 'drawn' && (
        <>
          <p className="muted">{t('estimate')}</p>
          {r.rerollRequests.includes(me.id) && (
            <p className="note">{t('rerollAsked', { name: partner })}</p>
          )}
          {r.rerollRequests.some((id) => id !== me.id) && (
            <p className="note">{t('rerollWaiting', { name: partner })}</p>
          )}
          {r.undoRequests.includes(me.id) && (
            <p className="note">{t('undoAsked', { name: partner })}</p>
          )}
          {r.undoRequests.some((id) => id !== me.id) && (
            <p className="note">{t('undoWaiting', { name: partner })}</p>
          )}
          <div className="field">
            <label htmlFor={`plan-${r.id}`}>{t('plan')}</label>
            <input
              id={`plan-${r.id}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="btn-row">
            {r.rerollsLeft > 0 && !r.rerollRequests.includes(me.id) && (
              <button
                type="button"
                className="btn"
                onClick={() => act(api.redemption(r.id, 'reroll'))}
              >
                {t('reroll')}
              </button>
            )}
            {!r.undoRequests.includes(me.id) && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => act(api.redemption(r.id, 'undo'))}
              >
                {t('undo')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!date}
              onClick={() => act(api.planRedemption(r.id, date))}
            >
              {t('plan')}
            </button>
          </div>
        </>
      )}
      {r.status === 'planned' && (
        <>
          <p>{t('planned', { date: r.plannedFor ?? '' })}</p>
          <div className="field">
            <label htmlFor={`note-${r.id}`}>{t('doneNote')}</label>
            <input id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => act(api.finishRedemption(r.id, note))}
          >
            {t('markDone')}
          </button>
        </>
      )}
      {r.status === 'done' && r.note && <p className="ink de">{r.note}</p>}
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
    </div>
  );
}

/** Wochenziel: progress, Gutschein-Konto, select-and-combine redemption, reveal, history. */
export function WochenzielScreen({ me }: { me: Me }): ReactNode {
  const t = useT();
  const [data, setData] = useState<Wochenziel | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [band, setBand] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api.wochenziel().then(setData, () => setFailed(true));
  }, []);
  useEffect(load, [load]);
  if (!data) return failed ? <p>{t('error')}</p> : <p className="muted">{t('loading')}</p>;

  const free = data.vouchers.filter((v) => !v.reserved);
  const total = free.filter((v) => selected.includes(v.id)).reduce((s, v) => s + v.valueEur, 0);
  const fitting = data.bands.filter((b) => b <= total);
  const chosen =
    band !== null && fitting.includes(band) ? band : (fitting[fitting.length - 1] ?? null);
  const active = data.redemptions.filter((r) => r.status !== 'done' && r.status !== 'undone');
  const history = data.redemptions.filter((r) => r.status === 'done');

  return (
    <>
      <div className="card">
        <h1>{t('weekGoal')}</h1>
        {data.coop && <CoopProgress coop={data.coop} me={me} />}
        <ul className="plain muted">
          {(data.coop?.tiers ?? []).map((tier) => (
            <li key={tier.valueEur}>
              {tier.minKomposition > 0
                ? t('tierLineKomp', {
                    eur: tier.valueEur,
                    days: tier.minActiveDays,
                    komp: tier.minKomposition,
                  })
                : t('tierLine', { eur: tier.valueEur, days: tier.minActiveDays })}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>{t('konto')}</h2>
        <p>
          <strong>{t('balance', { eur: data.balanceEur })}</strong>
        </p>
        {free.length === 0 ? (
          <p className="muted">{t('noVouchers')}</p>
        ) : (
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="muted">{t('selectVouchers')}</legend>
            <div className="voucher-chips">
              {free.map((v) => (
                <label key={v.id} className="chip">
                  <input
                    type="checkbox"
                    checked={selected.includes(v.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, v.id] : selected.filter((x) => x !== v.id),
                      )
                    }
                  />{' '}
                  {v.valueEur} €
                </label>
              ))}
            </div>
            {total > 0 && (
              <>
                <p>{t('total', { eur: total })}</p>
                {fitting.length > 0 && (
                  <div className="field">
                    <label htmlFor="band">{t('band')}</label>
                    <select
                      id="band"
                      value={chosen ?? ''}
                      onChange={(e) => setBand(Number(e.target.value))}
                    >
                      {fitting.map((b) => (
                        <option key={b} value={b}>
                          {b} €
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {chosen !== null && total - chosen > 0 && (
                  <p className="muted">{t('change', { eur: total - chosen })}</p>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={chosen === null}
                  onClick={() =>
                    void api.redeem(selected, chosen).then(
                      () => {
                        setSelected([]);
                        setBand(null);
                        load();
                      },
                      (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')),
                    )
                  }
                >
                  {t('proposeRedeem')}
                </button>
              </>
            )}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="correction">
            {error}
          </p>
        )}
      </div>

      {active.map((r) => (
        <RedemptionCard key={r.id} r={r} me={me} reload={load} />
      ))}

      {history.length > 0 && (
        <div className="card">
          <h2>{t('history')}</h2>
          <ul className="plain">
            {history.map((r) => (
              <li key={r.id}>
                <span className="muted">{fmtDate(r.createdAt, me.uiLang, false)}</span>{' '}
                {r.reward ? (me.uiLang === 'de' ? r.reward.titleDe : r.reward.titleEn) : ''}
                {r.note && <span className="ink"> – {r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
