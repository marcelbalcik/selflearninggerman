/**
 * Test doubles for the Pages setup: a static file server (what GitHub Pages
 * does) and a fake GitHub API with the endpoints the sync uses (repository,
 * git trees and blobs, contents read/write with sha checks), in memory.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.sqlite': 'application/octet-stream',
};

function listen(server: Server, port: number): Promise<Server> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/** Serve `dir` like GitHub Pages; `overrides` replace single paths (e.g. the config). */
export function staticServer(
  dir: string,
  port: number,
  overrides: Record<string, string> = {},
): Promise<Server> {
  return listen(
    createServer((req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const override = overrides[path];
      if (override !== undefined) {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(override);
        return;
      }
      let file = normalize(join(dir, path));
      if (!file.startsWith(dir)) return void res.writeHead(403).end();
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    }),
    port,
  );
}

export interface FakeGitHub {
  server: Server;
  files: Map<string, { sha: string; content: string }>;
  writes: number;
}

/** GitHub's REST API for one repository, enough for runtime/github.ts. */
export async function fakeGitHub(
  port: number,
  owner: string,
  repo: string,
  token: string,
): Promise<FakeGitHub> {
  const files = new Map<string, { sha: string; content: string }>();
  const state: FakeGitHub = { server: null as unknown as Server, files, writes: 0 };
  const prefix = `/repos/${owner}/${repo}`;
  const sha = (text: string) => createHash('sha1').update(text).digest('hex');
  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
      'access-control-allow-methods': 'GET, PUT, OPTIONS',
    });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const body = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => resolve(data));
    });
  state.server = await listen(
    createServer((req, res) => {
      void (async () => {
        if (req.method === 'OPTIONS') return send(res, 204);
        if (req.headers.authorization !== `Bearer ${token}`)
          return send(res, 401, { message: 'Bad credentials' });
        const url = new URL(req.url ?? '/', 'http://x');
        const p = url.pathname;
        if (!p.startsWith(prefix)) return send(res, 404, { message: 'Not Found' });
        const rest = p.slice(prefix.length);
        if (rest === '' && req.method === 'GET')
          return send(res, 200, { default_branch: 'main', permissions: { push: true } });
        if (rest.startsWith('/git/trees/')) {
          if (files.size === 0) return send(res, 409, { message: 'Git Repository is empty.' });
          return send(res, 200, {
            tree: [...files.entries()].map(([path, f]) => ({ path, sha: f.sha, type: 'blob' })),
          });
        }
        if (rest.startsWith('/git/blobs/')) {
          const want = rest.slice('/git/blobs/'.length);
          const f = [...files.values()].find((x) => x.sha === want);
          if (!f) return send(res, 404, { message: 'Not Found' });
          return send(res, 200, {
            content: Buffer.from(f.content).toString('base64'),
            encoding: 'base64',
          });
        }
        if (rest.startsWith('/contents/')) {
          const path = decodeURIComponent(rest.slice('/contents/'.length));
          const f = files.get(path);
          if (req.method === 'GET') {
            if (!f) return send(res, 404, { message: 'Not Found' });
            return send(res, 200, {
              sha: f.sha,
              content: Buffer.from(f.content).toString('base64'),
            });
          }
          if (req.method === 'PUT') {
            const b = JSON.parse(await body(req)) as { content: string; sha?: string };
            if ((f && b.sha !== f.sha) || (!f && b.sha))
              return send(res, 409, { message: 'sha mismatch' });
            const content = Buffer.from(b.content, 'base64').toString();
            const next = { sha: sha(content + path), content };
            files.set(path, next);
            state.writes += 1;
            return send(res, f ? 200 : 201, { content: { sha: next.sha, path } });
          }
        }
        send(res, 404, { message: 'Not Found' });
      })();
    }),
    port,
  );
  return state;
}
