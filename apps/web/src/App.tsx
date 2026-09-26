import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from './api';
import { LangContext, translate } from './i18n';
import { Session } from './screens/Session';
import { Login, Placement, Settings, Today, Word } from './screens/Screens';
import type { Me } from './types';

type Route =
  | { name: 'heute' }
  | { name: 'session'; reviewsOnly: boolean }
  | { name: 'wort'; id: number }
  | { name: 'einstellungen' };

/** Tiny hash router: #/heute, #/session, #/wort/123, #/einstellungen. */
function parse(hash: string): Route {
  const [, name, arg] = hash.replace(/^#/u, '').split('/');
  if (name === 'session') return { name: 'session', reviewsOnly: arg === 'reviews' };
  if (name === 'wort' && arg) return { name: 'wort', id: Number(arg) };
  if (name === 'einstellungen') return { name: 'einstellungen' };
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
      <Today me={me} onStart={(reviewsOnly) => go(reviewsOnly ? '/session/reviews' : '/session')} />
    );
  }

  return (
    <LangContext.Provider value={lang}>
      <main>{screen}</main>
      {me && me.placementDone && route.name !== 'session' && (
        <nav className="tabs" aria-label="Navigation">
          <a href="#/heute" aria-current={route.name === 'heute' ? 'page' : undefined}>
            {t('today')}
          </a>
          <a
            href="#/einstellungen"
            aria-current={route.name === 'einstellungen' ? 'page' : undefined}
          >
            {t('settings')}
          </a>
        </nav>
      )}
    </LangContext.Provider>
  );
}
