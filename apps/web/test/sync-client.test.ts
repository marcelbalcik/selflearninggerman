// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { fakeGitHub } from '../e2e/harness';
import { open, seal } from '../src/runtime/crypto';
import { Conflict, GitHub, GitHubError } from '../src/runtime/github';

describe('the sealed token', () => {
  it('opens with the right password only', async () => {
    const sealed = await seal('github_pat_example', 'ein langer gemeinsamer Satz', 1000);
    expect(await open(sealed, 'ein langer gemeinsamer Satz')).toBe('github_pat_example');
    expect(await open(sealed, 'falsch')).toBeNull();
    expect(JSON.stringify(sealed)).not.toContain('github_pat_example');
  });
});

describe('GitHub sync client', async () => {
  const fake = await fakeGitHub(4031, 'me', 'data', 'tok');
  afterAll(() => fake.server.close());
  const cfg = { apiBase: 'http://127.0.0.1:4031', owner: 'me', repo: 'data' };

  it('lists, writes, reads and detects conflicting writes', async () => {
    const gh = new GitHub(cfg, 'tok');
    expect(await gh.list()).toEqual([]);
    const sha1 = await gh.write('log/1/2027-01-04.json', '[{"id":"a"}]', null);
    const listed = await gh.list();
    expect(listed).toEqual([{ path: 'log/1/2027-01-04.json', sha: sha1 }]);
    expect(await gh.read(sha1)).toBe('[{"id":"a"}]');
    // Umlauts survive the base64 round trip.
    const sha2 = await gh.write('log/1/2027-01-04.json', '[{"id":"ä"}]', sha1);
    expect((await gh.readPath('log/1/2027-01-04.json'))?.text).toBe('[{"id":"ä"}]');
    // A stale sha (another device wrote meanwhile) is a conflict.
    await expect(gh.write('log/1/2027-01-04.json', '[]', sha1)).rejects.toBeInstanceOf(Conflict);
    expect(sha2).not.toBe(sha1);
  });

  it('reports a wrong token', async () => {
    await expect(new GitHub(cfg, 'wrong').connect()).rejects.toBeInstanceOf(GitHubError);
  });
});
