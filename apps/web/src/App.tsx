import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from './api';
import { LangContext, translate } from './i18n';
import { AufgabenScreen } from './screens/Aufgaben';
import { RoundScreen, WettbewerbScreen } from './screens/Competition';
import { Pruefen } from './screens/Pruefen';
import { WochenzielScreen } from './screens/Wochenziel';
import { Session } from './screens/Session';
import { Login, Placement, Settings, Today, Word } from './screens/Screens';
import type { Me } from './types';

type Route =
  | { name: 'heute' }
  | { name: 'session'; reviewsOnly: boolean }
  | { name: 'wort'; id: number }
  | { name: 'einstellungen' }
  | { name: 'pruefen' }
  | { name: 'duell' }
  | { name: 'pruefung' }
  | { name: 'wettbewerb' }
  | { name: 'wochenziel' }
  | { name: 'aufgaben' };

/** Tiny hash router: #/heute, #/session, #/wort/123, #/pruefen, #/einstellungen. */
function parse(hash: string): Route {
  const [, name, arg] = hash.replace(/^#/u, '').split('/');
  if (name === 'session') return { name: 'session', reviewsOnly: arg === 'reviews' };
  if (name === 'wort' && arg) return { name: 'wort', id: Number(arg) };
  if (name === 'einstellungen') return { name: 'einstellungen' };
  if (name === 'pruefen') return { name: 'pruefen' };
  if (
    name === 'duell' ||
    name === 'pruefung' ||
    name === 'wettbewerb' ||
    name === 'wochenziel' ||
    name === 'aufgaben'
  )
    return { name };
  return { name: 'heute' };
}

function go(path: string): void {
  window.location.hash = path;
}

export function App(): ReactNode {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  const [failed, setFailed] = useState(false);

  const loadMe = useCallback(() => {
    setFailed(false);
    api.me().then(setMe, (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else setFailed(true);
    });
  }, []);

  useEffect(() => {
    loadMe();
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [loadMe]);

  const lang = me?.uiLang ?? 'de';
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);

  let screen: ReactNode;
  if (failed) {
    screen = (
      <div className="card">
        <p>{t('error')}</p>
        <button type="button" className="btn" onClick={loadMe}>
          {t('retry')}
        </button>
      </div>
    );
  } else if (me === undefined) {
    screen = <p className="muted">{t('loading')}</p>;
  } else if (me === null) {
    screen = <Login onLogin={loadMe} />;
  } else if (!me.placementDone) {
    screen = <Placement onDone={loadMe} />;
  } else if (route.name === 'session') {
    screen = <Session reviewsOnly={route.reviewsOnly} onDone={() => go('/heute')} />;
  } else if (route.name === 'wort') {
    screen = <Word lemmaId={route.id} />;
  } else if (route.name === 'pruefen') {
    screen = <Pruefen />;
  } else if (route.name === 'duell' || route.name === 'pruefung') {
    screen = (
      <RoundScreen
        key={route.name}
        kind={route.name === 'duell' ? 'duel' : 'exam'}
        me={me}
        onDone={() => go('/heute')}
      />
    );
  } else if (route.name === 'wettbewerb') {
    screen = <WettbewerbScreen me={me} />;
  } else if (route.name === 'wochenziel') {
    screen = <WochenzielScreen me={me} />;
  } else if (route.name === 'aufgaben') {
    screen = <AufgabenScreen me={me} />;
  } else if (route.name === 'einstellungen') {
    screen = (
      <Settings
        me={me}
        onLang={(uiLang) => void api.setLang(uiLang).then(() => setMe({ ...me, uiLang }))}
        onLogout={() => void api.logout().then(() => setMe(null))}
      />
    );
  } else {
    screen = (
      <Today
        me={me}
        go={go}
        onStart={(reviewsOnly) => go(reviewsOnly ? '/session/reviews' : '/session')}
      />
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <main>{screen}</main>
      {me &&
        me.placementDone &&
        route.name !== 'session' &&
        route.name !== 'duell' &&
        route.name !== 'pruefung' && (
          <nav className="tabs" aria-label="Navigation">
            {(
              [
                ['heute', 'today'],
                ['wettbewerb', 'navCompetition'],
                ['wochenziel', 'navGoal'],
                ['aufgaben', 'navChores'],
                ['einstellungen', 'navMore'],
              ] as const
            ).map(([path, label]) => (
              <a
                key={path}
                href={`#/${path}`}
                aria-current={
                  route.name === path || (path === 'einstellungen' && route.name === 'pruefen')
                    ? 'page'
                    : undefined
                }
              >
                {t(label)}
              </a>
            ))}
          </nav>
        )}
    </LangContext.Provider>
  );
}
