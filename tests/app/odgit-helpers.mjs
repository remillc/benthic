// Helpers of the git-layer tests: a local git HTTP server (git's own http-backend over a bare repository, with a token
// check), the git layer built on a temporary folder, and a transport over Node's http.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createGitFs } from '../../app/src/lib/odgit/fs-adapter.js';
import { createGitHttp } from '../../app/src/lib/odgit/http-adapter.js';
import { nodeBackend } from '../../app/src/lib/odgit/node-backend.js';
import { openRepo } from '../../app/src/lib/odgit/repo.js';

export const TOKEN = 'test-token';

/** @returns {string|null} the path of git-http-backend, or null when git is not installed */
export function findHttpBackend() {
  try {
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    for (const name of ['git-http-backend.exe', 'git-http-backend']) {
      const p = path.join(exec, name);
      if (fs.existsSync(p)) return p;
    }
  } catch {
    // no git
  }
  return null;
}

export function tempDir(prefix = 'odgit-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * A server on a bare repository `owner/repo.git`. `requests` lists what it served; `failNext` makes the next n
 * requests answer 503.
 * @param {string} backend
 */
export async function startGitServer(backend) {
  const root = tempDir('odgit-srv-');
  const bare = path.join(root, 'owner', 'repo.git');
  fs.mkdirSync(bare, { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  execFileSync('git', ['config', 'http.receivepack', 'true'], { cwd: bare });
  const state = { requests: /** @type {string[]} */ ([]), failNext: 0, failPushAfter: -1, pushes: 0 };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    state.requests.push(`${req.method} ${u.pathname}${u.search}`);
    if (req.headers.authorization !== `token ${TOKEN}`) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' }).end();
      return;
    }
    const isPush = u.pathname.endsWith('git-receive-pack') && req.method === 'POST';
    if (state.failNext > 0 || (isPush && state.failPushAfter >= 0 && state.pushes >= state.failPushAfter)) {
      state.failNext = Math.max(0, state.failNext - 1);
      req.resume();
      res.writeHead(503).end();
      return;
    }
    if (isPush) state.pushes++;
    const child = spawn(backend, [], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        REQUEST_METHOD: req.method,
        PATH_INFO: u.pathname,
        QUERY_STRING: u.search.slice(1),
        CONTENT_TYPE: req.headers['content-type'] ?? '',
        CONTENT_LENGTH: '',
        REMOTE_USER: 'test',
        REMOTE_ADDR: '127.0.0.1',
        HTTP_CONTENT_ENCODING: req.headers['content-encoding'] ?? '',
        HTTP_GIT_PROTOCOL: String(req.headers['git-protocol'] ?? ''),
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.receivepack',
        GIT_CONFIG_VALUE_0: 'true',
      },
    });
    req.pipe(child.stdin);
    const out = [];
    child.stdout.on('data', (c) => out.push(c));
    child.on('close', () => {
      const all = Buffer.concat(out);
      let end = all.indexOf('\r\n\r\n');
      let sep = 4;
      if (end < 0) {
        end = all.indexOf('\n\n');
        sep = 2;
      }
      const head = all.subarray(0, end).toString().split(/\r?\n/);
      /** @type {Record<string, string>} */
      const headers = {};
      let status = 200;
      for (const line of head) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim();
        if (k.toLowerCase() === 'status') status = parseInt(v, 10);
        else headers[k] = v;
      }
      res.writeHead(status, headers).end(all.subarray(end + sep));
    });
    child.stdin.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  return {
    url: `http://127.0.0.1:${port}/owner/repo.git`,
    bare,
    state,
    /** The files of the host's branch. */
    files(branch = 'main') {
      try {
        return execFileSync('git', ['ls-tree', '-r', '--name-only', branch], { cwd: bare, encoding: 'utf8' }).split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
    commits(branch = 'main') {
      try {
        return Number(execFileSync('git', ['rev-list', '--count', branch], { cwd: bare, encoding: 'utf8' }));
      } catch {
        return 0;
      }
    },
    show(file, branch = 'main') {
      return execFileSync('git', ['show', `${branch}:${file}`], { cwd: bare, encoding: 'utf8' });
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A transport over Node's fetch, like the plain-browser one. @type {import('../../app/src/lib/odgit/http-adapter.js').BinaryTransport} */
export async function nodeTransport(request) {
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  /** @type {Record<string, string>} */
  const headers = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) };
}

/**
 * A git layer over a temporary folder and a transport.
 * @param {{ url: string, root?: string, token?: string, transport?: import('../../app/src/lib/odgit/http-adapter.js').BinaryTransport, dir?: string }} o
 */
export function makeRepo(o) {
  const root = o.root ?? tempDir('odgit-wc-');
  const repo = openRepo({
    fs: createGitFs(nodeBackend(root)),
    http: createGitHttp(o.transport ?? nodeTransport),
    dir: o.dir ?? '/wc',
    url: o.url,
    branch: 'main',
    token: o.token ?? TOKEN,
  });
  return { repo, root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
