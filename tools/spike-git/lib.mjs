// Shared helpers of the spike: Forgejo dev stack access, timing, files on disk. Credentials come from the
// environment (OD_FORGEJO_USER / OD_FORGEJO_PASSWORD), never from this repository.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DIRECT = process.env.OD_FORGEJO ?? 'http://127.0.0.1:3000';
export const USER = process.env.OD_FORGEJO_USER;
const PASSWORD = process.env.OD_FORGEJO_PASSWORD;
export const WORK = path.resolve(import.meta.dirname, '../../build/spike-git');
fs.mkdirSync(WORK, { recursive: true });

const basic = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
let tokenCache = null;
export async function token() {
  if (tokenCache) return tokenCache;
  const f = path.join(WORK, '.token');
  if (fs.existsSync(f)) return (tokenCache = fs.readFileSync(f, 'utf8'));
  const r = await fetch(`${DIRECT}/api/v1/users/${USER}/tokens`, { method: 'POST', headers: { Authorization: basic, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `spike-${Date.now()}`, scopes: ['write:repository', 'write:user'] }) });
  if (!r.ok) throw new Error(`token ${r.status} ${await r.text()}`);
  tokenCache = (await r.json()).sha1;
  fs.writeFileSync(f, tokenCache);
  return tokenCache;
}
export async function api(base, p, opts = {}) {
  const t = await token();
  return fetch(`${base}/api/v1${p}`, { ...opts, headers: { Authorization: `token ${t}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
}
let counter = 0;
export async function createRepo(prefix = 'spike') {
  const name = `${prefix}-${Date.now().toString(36)}-${counter++}`;
  const r = await api(DIRECT, '/user/repos', { method: 'POST', body: JSON.stringify({ name, private: true, default_branch: 'main' }) });
  if (!r.ok) throw new Error(`createRepo ${r.status} ${await r.text()}`);
  // the git host's API sees the pushed branch a moment later (hooks): wait for it
  for (let i = 0; i < 100; i++) {
    const r = await api(DIRECT, `/repos/${USER}/${name}/contents/opendives.json?ref=main`);
    if (r.ok && !Array.isArray(await r.json())) break;
    await new Promise((x) => setTimeout(x, 200));
  }
  return name;
}
export async function deleteRepo(name) {
  await api(DIRECT, `/repos/${USER}/${name}`, { method: 'DELETE' });
}
export const repoUrl = (base, name) => `${base}/${USER}/${name}.git`;
export async function authUrl(base, name) {
  const u = new URL(repoUrl(base, name));
  u.username = encodeURIComponent(USER);
  u.password = await token();
  return u.toString();
}

export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
export async function time(fn) {
  const t = performance.now();
  const value = await fn();
  return { ms: performance.now() - t, value };
}

export function writeTree(dir, files) {
  for (const [p, text] of files) {
    const f = path.join(dir, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}
export function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}
export function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}
export function gitCli(cwd, args, env = {}) {
  return execFileSync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
}
export const AUTHOR = { name: 'OpenDives', email: 'noreply@opendives.app' };

/** Prepares a repository on the server with a complete logbook (git CLI push, not measured). */
export async function seedRepo(files, ownerDir) {
  const name = await createRepo('seed');
  rmrf(ownerDir);
  fs.mkdirSync(ownerDir, { recursive: true });
  writeTree(ownerDir, files);
  const env = { GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email };
  gitCli(ownerDir, ['init', '-q', '-b', 'main']);
  gitCli(ownerDir, ['config', 'core.autocrlf', 'false']);
  gitCli(ownerDir, ['add', '-A'], env);
  gitCli(ownerDir, ['commit', '-q', '-m', 'Seed'], env);
  gitCli(ownerDir, ['push', '-q', await authUrl(DIRECT, name), 'main'], env);
  return name;
}
