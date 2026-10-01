import { useState } from 'react';
import type { ReactNode } from 'react';
import { seal } from '../runtime/crypto';
import { GitHub } from '../runtime/github';

/**
 * One-time setup in the browser (no tools to install): the token is checked
 * against GitHub and encrypted with the shared password right here; nothing
 * is sent anywhere else. The result is the file to add to the repository as
 * apps/web/public/wortduell.config.json.
 */
export function Einrichten(): ReactNode {
  const [names, setNames] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('wortduell-data');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const make = async () => {
    setError(null);
    const users = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (users.length !== 2) return setError('Bitte genau zwei Namen, mit Komma getrennt.');
    if (!owner.trim() || !repo.trim()) return setError('Bitte Konto und Repository angeben.');
    if (password.length < 12)
      return setError('Bitte ein Passwort mit mindestens 12 Zeichen – am besten ein ganzer Satz.');
    if (password !== again) return setError('Die beiden Passwörter sind verschieden.');
    setBusy(true);
    try {
      await new GitHub({ owner: owner.trim(), repo: repo.trim() }, token.trim()).connect();
    } catch {
      setBusy(false);
      return setError(
        'GitHub lehnt den Token ab oder findet das Repository nicht. Prüfe Konto, Repository-Namen und die Token-Rechte (Contents: Read and write).',
      );
    }
    const config = {
      users,
      sync: { owner: owner.trim(), repo: repo.trim(), token: await seal(token.trim(), password) },
    };
    setToken('');
    setResult(`${JSON.stringify(config, null, 2)}\n`);
    setBusy(false);
  };

  if (result) {
    const download = () => {
      const url = URL.createObjectURL(new Blob([result], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wortduell.config.json';
      a.click();
      URL.revokeObjectURL(url);
    };
    return (
      <div className="card">
        <h1>Fertig</h1>
        <p>
          Der Token ist darin nur verschlüsselt enthalten. Diese Datei kann öffentlich im Repository
          liegen.
        </p>
        <ol>
          <li>
            Im App-Repository auf GitHub: <strong>Add file → Create new file</strong>.
          </li>
          <li>
            Als Namen eingeben: <code>apps/web/public/wortduell.config.json</code>
          </li>
          <li>Den Text unten hineinkopieren und auf „Commit changes“ tippen.</li>
          <li>Ein, zwei Minuten warten, bis die Seite neu gebaut ist, dann die App öffnen.</li>
        </ol>
        <label htmlFor="config">wortduell.config.json</label>
        <textarea id="config" className="answer-input" rows={12} readOnly value={result} />
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => void navigator.clipboard.writeText(result)}
          >
            Kopieren
          </button>
          <button type="button" className="btn" onClick={download}>
            Herunterladen
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void make();
      }}
    >
      <h1>Einrichten</h1>
      <p className="muted">
        Einmalig. Alles passiert hier im Browser; der Token wird nur verschlüsselt ausgegeben.
      </p>
      <div className="field">
        <label htmlFor="su-names">Eure zwei Namen (mit Komma)</label>
        <input
          id="su-names"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder="Marcel, Anna"
        />
      </div>
      <div className="field">
        <label htmlFor="su-owner">GitHub-Konto des Daten-Repositorys</label>
        <input
          id="su-owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          autoCapitalize="off"
        />
      </div>
      <div className="field">
        <label htmlFor="su-repo">Name des privaten Daten-Repositorys</label>
        <input
          id="su-repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          autoCapitalize="off"
        />
      </div>
      <div className="field">
        <label htmlFor="su-token">GitHub-Token</label>
        <input
          id="su-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="su-pw">Gemeinsames Passwort (mindestens 12 Zeichen)</label>
        <input
          id="su-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="field">
        <label htmlFor="su-pw2">Passwort wiederholen</label>
        <input
          id="su-pw2"
          type="password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p role="alert" className="correction">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !token}>
        {busy ? 'Prüfe …' : 'Prüfen und Datei erzeugen'}
      </button>
    </form>
  );
}
