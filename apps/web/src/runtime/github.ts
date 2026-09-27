/**
 * The shared state lives in a private GitHub repository: one file per person
 * and day, `log/<person>/<day>.json`, each a JSON array of that person's
 * actions. Only its author writes a file, so the two phones never overwrite
 * each other; the same person on two devices is merged on conflict.
 */
import { fromBase64, toBase64 } from './crypto';

export interface SyncConfig {
  apiBase?: string;
  owner: string;
  repo: string;
}

export interface RemoteFile {
  path: string;
  sha: string;
}

export class Conflict extends Error {}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class GitHub {
  private branch: string | null = null;

  constructor(
    private readonly cfg: SyncConfig,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private url(path: string): string {
    return `${this.cfg.apiBase ?? 'https://api.github.com'}/repos/${this.cfg.owner}/${this.cfg.repo}${path}`;
  }

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    const res = await this.fetchFn(this.url(path), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as T) : null };
  }

  /** Check the token and find the default branch. */
  async connect(): Promise<void> {
    const r = await this.req<{ default_branch: string; permissions?: { push?: boolean } }>(
      'GET',
      '',
    );
    if (r.status !== 200 || !r.data) throw new GitHubError(r.status, 'repository not reachable');
    if (r.data.permissions && r.data.permissions.push === false)
      throw new GitHubError(403, 'the token cannot write');
    this.branch = r.data.default_branch;
  }

  /** Every log file with its content hash (one request). */
  async list(): Promise<RemoteFile[]> {
    if (!this.branch) await this.connect();
    const r = await this.req<{ tree: { path: string; sha: string; type: string }[] }>(
      'GET',
      `/git/trees/${encodeURIComponent(this.branch ?? 'main')}?recursive=1`,
    );
    // 404/409: the repository is still empty.
    if (r.status === 404 || r.status === 409) return [];
    if (r.status !== 200 || !r.data) throw new GitHubError(r.status, 'listing failed');
    return r.data.tree
      .filter((t) => t.type === 'blob' && t.path.startsWith('log/'))
      .map((t) => ({ path: t.path, sha: t.sha }));
  }

  async read(sha: string): Promise<string> {
    const r = await this.req<{ content: string }>('GET', `/git/blobs/${sha}`);
    if (r.status !== 200 || !r.data) throw new GitHubError(r.status, 'read failed');
    return dec.decode(fromBase64(r.data.content.replace(/\s/gu, '')));
  }

  /** Current content of a path, or null. */
  async readPath(path: string): Promise<{ sha: string; text: string } | null> {
    const r = await this.req<{ sha: string; content: string }>('GET', `/contents/${path}`);
    if (r.status === 404) return null;
    if (r.status !== 200 || !r.data) throw new GitHubError(r.status, 'read failed');
    return { sha: r.data.sha, text: dec.decode(fromBase64(r.data.content.replace(/\s/gu, ''))) };
  }

  /** Create or replace a file; `sha` is the version being replaced. Returns the new sha. */
  async write(path: string, text: string, sha: string | null): Promise<string> {
    const r = await this.req<{ content: { sha: string } }>('PUT', `/contents/${path}`, {
      message: `wortduell: ${path}`,
      content: toBase64(enc.encode(text)),
      ...(sha ? { sha } : {}),
    });
    if (r.status === 409 || r.status === 422) throw new Conflict(path);
    if ((r.status !== 200 && r.status !== 201) || !r.data)
      throw new GitHubError(r.status, 'write failed');
    return r.data.content.sha;
  }
}
