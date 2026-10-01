import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n';
import type { Chore, CoopTier, Me, Reward, SettingEntry, Size } from '../types';
import { fmtDate } from './Competition';

/** Show a setting value in a form both people can read. */
function show(key: SettingEntry['key'], value: unknown, t: ReturnType<typeof useT>): string {
  if (key === 'DUEL_MODE') return t(`mode_${String(value)}` as MessageKey);
  if (key === 'BABYSITTER_AVAILABLE') return value ? t('yes') : t('no');
  if (key === 'REWARD_BANDS') return (value as number[]).join(', ');
  if (key === 'COOP_TIERS')
    return (value as CoopTier[])
      .map((x) => `${x.valueEur}:${x.minActiveDays}:${x.minKomposition}`)
      .join(', ');
  return String(value);
}

/** Parse what was typed back into a setting value (the server validates it). */
function parse(key: SettingEntry['key'], text: string): unknown {
  if (key === 'NEW_PER_DAY' || key === 'STARS_PER_S_VOUCHER') return Number(text);
  if (key === 'REWARD_BANDS')
    return text
      .split(/[,\s]+/u)
      .filter(Boolean)
      .map(Number);
  if (key === 'COOP_TIERS')
    return text
      .split(/,\s*/u)
      .filter(Boolean)
      .map((part) => {
        const [valueEur, minActiveDays, minKomposition] = part.split(':').map(Number);
        return { valueEur, minActiveDays, minKomposition: minKomposition ?? 0 };
      });
  return text;
}

function SettingRow({ s, me, reload }: { s: SettingEntry; me: Me; reload: () => void }): ReactNode {
  const t = useT();
  const [text, setText] = useState(() =>
    s.key === 'DUEL_MODE' ? String(s.value) : show(s.key, s.value, t),
  );
  const [error, setError] = useState<string | null>(null);
  const partner = me.partner?.name ?? '';
  const act = (p: Promise<unknown>) =>
    void p.then(reload, (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')));
  const label = t(`setting_${s.key}` as MessageKey);

  if (s.key === 'BABYSITTER_AVAILABLE') {
    return (
      <div className="field">
        <label className="chore-option">
          <input
            type="checkbox"
            checked={s.value === true}
            onChange={(e) => act(api.proposeSetting(s.key, e.target.checked))}
          />{' '}
          {label}
        </label>
      </div>
    );
  }
  return (
    <div className="setting">
      <p>
        <strong>{label}:</strong> {show(s.key, s.value, t)}
      </p>
      {s.scheduled && (
        <p className="note">
          {t('scheduled', {
            date: fmtDate(s.scheduled.effectiveFrom, me.uiLang),
            value: show(s.key, s.scheduled.value, t),
          })}
        </p>
      )}
      {s.pending &&
        (s.pending.proposedBy === me.id ? (
          <p className="note">
            {t('pendingMine', { value: show(s.key, s.pending.value, t), name: partner })}
          </p>
        ) : (
          <>
            <p className="note">
              {t('pendingBy', { name: partner, value: show(s.key, s.pending.value, t) })}
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => act(api.decideSetting(s.key, false))}
              >
                {t('reject')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act(api.decideSetting(s.key, true))}
              >
                {t('approve')}
              </button>
            </div>
          </>
        ))}
      <div className="inline-form">
        {s.key === 'DUEL_MODE' ? (
          <select aria-label={label} value={text} onChange={(e) => setText(e.target.value)}>
            <option value="raw">{t('mode_raw')}</option>
            <option value="vs_expected">{t('mode_vs_expected')}</option>
          </select>
        ) : (
          <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <button
          type="button"
          className="btn"
          onClick={() => act(api.proposeSetting(s.key, parse(s.key, text)))}
        >
          {t('proposeChange')}
        </button>
      </div>
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
    </div>
  );
}

export function SharedSettings({ me }: { me: Me }): ReactNode {
  const t = useT();
  const [list, setList] = useState<SettingEntry[] | null>(null);
  const load = useCallback(() => {
    void api.settings().then((r) => setList(r.settings));
  }, []);
  useEffect(load, [load]);
  if (!list) return null;
  return (
    <div className="card">
      <h2>{t('settingsShared')}</h2>
      <p className="muted">{t('settingsSharedHint')}</p>
      {list.map((s) => (
        <SettingRow key={`${s.key}:${JSON.stringify(s.value)}`} s={s} me={me} reload={load} />
      ))}
    </div>
  );
}

const EMPTY_REWARD = {
  budgetEur: 3,
  kind: 'together' as const,
  titleDe: '',
  titleEn: '',
  missionDe: '',
  season: 'any' as const,
  needsBabysitter: false,
  estCostNote: '',
};

export function RewardCatalog({ me }: { me: Me }): ReactNode {
  const t = useT();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [draft, setDraft] = useState<
    typeof EMPTY_REWARD | Omit<Reward, 'id' | 'active' | 'proposedBy' | 'pending' | 'lastDrawnAt'>
  >(EMPTY_REWARD);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void api.rewards().then((r) => setRewards(r.rewards));
  }, []);
  useEffect(load, [load]);
  if (!rewards) return null;
  const act = (p: Promise<unknown>) =>
    void p.then(load, (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')));
  const bands = [...new Set(rewards.map((r) => r.budgetEur))].sort((a, b) => a - b);

  return (
    <div className="card">
      <h2>{t('rewardsTitle')}</h2>
      <p className="muted">{t('estimate')}</p>
      {bands.map((b) => (
        <div key={b}>
          <h3>{b} €</h3>
          <ul className="plain">
            {rewards
              .filter((r) => r.budgetEur === b)
              .map((r) => (
                <li key={r.id} className="reward-row">
                  <span className="de">{me.uiLang === 'de' ? r.titleDe : r.titleEn}</span>{' '}
                  <span className="muted">
                    {r.pending
                      ? t('rewardPending')
                      : r.active
                        ? t('rewardActive')
                        : t('rewardInactive')}
                  </span>
                  {r.pending && r.proposedBy !== me.id && (
                    <span className="btn-row" style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => act(api.decideReward(r.id, false))}
                      >
                        {t('reject')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => act(api.decideReward(r.id, true))}
                      >
                        {t('approve')}
                      </button>
                    </span>
                  )}
                  {!r.pending && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => act(api.setRewardActive(r.id, !r.active))}
                    >
                      {r.active ? t('deactivate') : t('activate')}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <h3>{t('rewardPropose')}</h3>
      <div className="field">
        <label htmlFor="rw-de">{t('rewardTitleDe')}</label>
        <input
          id="rw-de"
          lang="de"
          value={draft.titleDe}
          onChange={(e) => setDraft({ ...draft, titleDe: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="rw-en">{t('rewardTitleEn')}</label>
        <input
          id="rw-en"
          value={draft.titleEn}
          onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="rw-m">{t('rewardMission')}</label>
        <input
          id="rw-m"
          lang="de"
          value={draft.missionDe}
          onChange={(e) => setDraft({ ...draft, missionDe: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="rw-b">{t('band')}</label>
        <select
          id="rw-b"
          value={draft.budgetEur}
          onChange={(e) => setDraft({ ...draft, budgetEur: Number(e.target.value) })}
        >
          {bands.map((b) => (
            <option key={b} value={b}>
              {b} €
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rw-k">{t('rewardKind')}</label>
        <select
          id="rw-k"
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as Reward['kind'] })}
        >
          <option value="together">{t('kind_together')}</option>
          <option value="buy">{t('kind_buy')}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="rw-c">{t('rewardCost')}</label>
        <input
          id="rw-c"
          value={draft.estCostNote}
          onChange={(e) => setDraft({ ...draft, estCostNote: e.target.value })}
        />
      </div>
      <label className="chore-option">
        <input
          type="checkbox"
          checked={draft.season === 'outdoor'}
          onChange={(e) => setDraft({ ...draft, season: e.target.checked ? 'outdoor' : 'any' })}
        />{' '}
        {t('rewardOutdoor')}
      </label>
      <label className="chore-option">
        <input
          type="checkbox"
          checked={draft.needsBabysitter}
          onChange={(e) => setDraft({ ...draft, needsBabysitter: e.target.checked })}
        />{' '}
        {t('rewardBabysitter')}
      </label>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!draft.titleDe.trim() || !draft.titleEn.trim()}
        onClick={() => act(api.proposeReward(draft).then(() => setDraft(EMPTY_REWARD)))}
      >
        {t('rewardPropose')}
      </button>
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
    </div>
  );
}

const EMPTY_CHORE = {
  size: 'S' as Size,
  titleDe: '',
  sentenceDe: '',
  titleEn: '',
  noun: '',
  verb: '',
  active: true,
};

export function ChoreCatalog(): ReactNode {
  const t = useT();
  const [chores, setChores] = useState<Chore[] | null>(null);
  const [draft, setDraft] = useState(EMPTY_CHORE);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void api.vouchers().then((r) => setChores(r.chores));
  }, []);
  useEffect(load, [load]);
  if (!chores) return null;
  const act = (p: Promise<unknown>) =>
    void p.then(load, (e: unknown) => setError(e instanceof ApiError ? e.message : t('error')));
  const save = (c: Chore, active: boolean) =>
    act(
      api.saveChore(c.id, {
        size: c.size,
        titleDe: c.titleDe,
        sentenceDe: c.sentenceDe,
        titleEn: c.titleEn,
        noun: c.noun,
        verb: c.verb,
        active,
      }),
    );
  return (
    <div className="card">
      <h2>{t('choresTitle')}</h2>
      <ul className="plain">
        {chores.map((c) => (
          <li key={c.id} className="reward-row">
            <span className="size">{c.size}</span> <span className="de">{c.sentenceDe}</span>{' '}
            <button type="button" className="link" onClick={() => save(c, !c.active)}>
              {c.active ? t('deactivate') : t('activate')}
            </button>
          </li>
        ))}
      </ul>
      <h3>{t('choreAdd')}</h3>
      <div className="field">
        <label htmlFor="ch-size">{t('band')}</label>
        <select
          id="ch-size"
          value={draft.size}
          onChange={(e) => setDraft({ ...draft, size: e.target.value as Size })}
        >
          {(['S', 'M', 'L'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {(
        [
          ['titleDe', 'rewardTitleDe'],
          ['titleEn', 'rewardTitleEn'],
          ['sentenceDe', 'choreSentence'],
          ['noun', 'choreNoun'],
          ['verb', 'choreVerb'],
        ] as const
      ).map(([field, label]) => (
        <div className="field" key={field}>
          <label htmlFor={`ch-${field}`}>{t(label)}</label>
          <input
            id={`ch-${field}`}
            value={draft[field]}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!draft.titleDe.trim() || !draft.sentenceDe.trim() || !draft.titleEn.trim()}
        onClick={() =>
          act(
            api
              .saveChore(null, {
                ...draft,
                noun: draft.noun.trim() || null,
                verb: draft.verb.trim() || null,
              })
              .then(() => setDraft(EMPTY_CHORE)),
          )
        }
      >
        {t('save')}
      </button>
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
    </div>
  );
}
