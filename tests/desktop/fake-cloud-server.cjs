// SPDX-License-Identifier: GPL-2.0
// A fake OAuth server and a fake Google Drive, Microsoft Graph and Dropbox in one HTTP server, for
// tests/desktop/cloud.test.mjs (task 2026-11-15-173). It checks what the real services check: the PKCE
// verifier against the challenge, the redirect address, the client keys, the bearer token. Nothing here
// is a real key or a real account.
'use strict';
const crypto = require('node:crypto');
const http = require('node:http');

const CLIENT = { googleDrive: { id: 'google-test-id', secret: 'google-test-secret' }, oneDrive: { id: 'ms-test-id' }, dropbox: { id: 'dropbox-test-key' } };
const ACCOUNT = { googleDrive: 'diver@example.test', oneDrive: 'diver@outlook.test', dropbox: 'diver@dropbox.test' };
const PREFIX = { googleDrive: '/google', oneDrive: '/ms', dropbox: '/db' };

/** @returns {Promise<{ url: string, endpoints: Record<string, Record<string, string>>, state: any, close: () => Promise<void> }>} */
async function startFakeCloud() {
  const state = {
    /** every request: { provider, method, path, headers } */
    log: [],
    /** authorisation codes: code -> { challenge, redirect, provider } */
    codes: new Map(),
    refreshTokens: new Map(), // refresh token -> provider
    accessTokens: new Set(),
    counter: 0,
    /** files by provider and path: { bytes, rev, modified, id } */
    files: { googleDrive: new Map(), oneDrive: new Map(), dropbox: new Map() },
    folders: new Map(), // Google: "parent/name" -> id
    sessions: new Map(), // upload sessions: id -> { provider, path, chunks, total }
    lastAuthorize: null,
    refreshCount: 0,
  };
  const next = (/** @type {string} */ prefix) => `${prefix}${++state.counter}`;
  const revision = (/** @type {string} */ provider) => (provider === 'oneDrive' ? `ctag-${++state.counter}` : provider === 'dropbox' ? `rev${++state.counter}` : `hrev-${++state.counter}`);

  /** Puts bytes at a path: a new revision. Used by the server and by the tests ("changed elsewhere"). */
  function putFile(/** @type {string} */ provider, /** @type {string} */ filePath, /** @type {Buffer} */ bytes) {
    const old = state.files[provider].get(filePath);
    const file = { bytes, rev: revision(provider), modified: new Date(Date.UTC(2026, 10, 15, 10, state.counter % 60)).toISOString(), id: old?.id || next('file-') };
    state.files[provider].set(filePath, file);
    return file;
  }

  const readBody = (/** @type {http.IncomingMessage} */ req) => new Promise((resolve) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const json = (/** @type {http.ServerResponse} */ res, /** @type {any} */ body, status = 200, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const provider = Object.keys(PREFIX).find((p) => url.pathname.startsWith(`${PREFIX[p]}/`));
    const method = req.method || 'GET';
    const body = await readBody(req);
    if (!provider) return json(res, { error: 'unknown' }, 404);
    const rest = url.pathname.slice(PREFIX[provider].length);
    state.log.push({ provider, method, path: rest, headers: req.headers, query: url.search });

    // --- OAuth ---
    if (rest === '/auth') {
      const q = url.searchParams;
      state.lastAuthorize = { provider, params: Object.fromEntries(q) };
      const code = next('code-');
      state.codes.set(code, { challenge: q.get('code_challenge'), method: q.get('code_challenge_method'), redirect: q.get('redirect_uri'), provider, clientId: q.get('client_id') });
      const target = new URL(q.get('redirect_uri') || '');
      target.searchParams.set('code', code);
      target.searchParams.set('state', q.get('state') || '');
      res.writeHead(302, { Location: target.toString() });
      return res.end();
    }
    if (rest === '/token') {
      const form = new URLSearchParams(body.toString());
      const client = CLIENT[provider];
      if (form.get('client_id') !== client.id) return json(res, { error: 'invalid_client' }, 401);
      if (provider === 'googleDrive' && form.get('client_secret') !== client.secret) return json(res, { error: 'invalid_client' }, 401);
      if (form.get('grant_type') === 'authorization_code') {
        const entry = state.codes.get(form.get('code') || '');
        state.codes.delete(form.get('code') || '');
        const verifier = form.get('code_verifier') || '';
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        if (!entry || entry.provider !== provider || entry.method !== 'S256' || entry.challenge !== challenge || entry.redirect !== form.get('redirect_uri')) return json(res, { error: 'invalid_grant' }, 400);
        const access = next('at-');
        const refresh = next('rt-');
        state.accessTokens.add(access);
        state.refreshTokens.set(refresh, provider);
        return json(res, { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'Bearer' });
      }
      if (form.get('grant_type') === 'refresh_token') {
        const refresh = form.get('refresh_token') || '';
        if (state.refreshTokens.get(refresh) !== provider) return json(res, { error: 'invalid_grant' }, 400);
        state.refreshCount += 1;
        const access = next('at-');
        state.accessTokens.add(access);
        const out = { access_token: access, expires_in: 3600, token_type: 'Bearer' };
        // Microsoft rotates the refresh token on every use.
        if (provider === 'oneDrive') {
          state.refreshTokens.delete(refresh);
          out.refresh_token = next('rt-');
          state.refreshTokens.set(out.refresh_token, provider);
        }
        return json(res, out);
      }
      return json(res, { error: 'unsupported_grant_type' }, 400);
    }

    // --- Uploads to an upload address carry no bearer token (Graph) or the session address (Drive) ---
    if (rest.startsWith('/session/')) {
      const session = state.sessions.get(rest.slice('/session/'.length));
      if (!session) return json(res, {}, 404);
      if (provider === 'oneDrive') {
        if (req.headers.authorization) return json(res, { error: 'authorization sent to the upload address' }, 400);
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(req.headers['content-range'] || ''));
        if (!range) return json(res, { error: 'range' }, 400);
        session.chunks.push({ from: Number(range[1]), to: Number(range[2]), length: body.length });
        session.parts.push(body);
        if (Number(range[2]) + 1 < Number(range[3])) return json(res, { nextExpectedRanges: [`${Number(range[2]) + 1}-`] }, 202);
        const file = putFile(provider, session.path, Buffer.concat(session.parts));
        return json(res, { id: file.id, cTag: file.rev, eTag: `etag-${file.rev}`, lastModifiedDateTime: file.modified }, 201);
      }
      if (!state.accessTokens.has((req.headers.authorization || '').replace(/^Bearer /, ''))) return json(res, {}, 401);
      const file = putFile(provider, session.path, body);
      session.fileId = file.id;
      return json(res, { id: file.id, headRevisionId: file.rev, modifiedTime: file.modified });
    }

    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!state.accessTokens.has(bearer)) return json(res, { error: 'unauthorized' }, 401);

    // --- Google Drive ---
    if (provider === 'googleDrive') {
      if (rest === '/drive/about') return json(res, { user: { displayName: 'Diver', emailAddress: ACCOUNT.googleDrive } });
      if (rest === '/drive/files' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const name = /name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1].replace(/\\(.)/g, '$1') || '';
        const parent = /'([^']+)' in parents/.exec(q)?.[1] || 'root';
        if (q.includes('application/vnd.google-apps.folder')) {
          const id = state.folders.get(`${parent}/${name}`);
          return json(res, { files: id ? [{ id }] : [] });
        }
        const found = [...state.files.googleDrive.entries()].find(([p]) => p === `${parent}/${name}`);
        return json(res, { files: found ? [{ id: found[1].id, headRevisionId: found[1].rev, modifiedTime: found[1].modified }] : [] });
      }
      if (rest === '/drive/files' && method === 'POST') {
        const data = JSON.parse(body.toString());
        const id = next('folder-');
        state.folders.set(`${data.parents[0]}/${data.name}`, id);
        return json(res, { id });
      }
      const one = /^\/drive\/files\/([^/]+)$/.exec(rest);
      if (one) {
        const entry = [...state.files.googleDrive.values()].find((f) => f.id === decodeURIComponent(one[1]));
        if (!entry) return json(res, {}, 404);
        if (url.searchParams.get('alt') === 'media') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          return res.end(entry.bytes);
        }
        return json(res, { id: entry.id, headRevisionId: entry.rev, modifiedTime: entry.modified });
      }
      if (rest === '/upload/files' && method === 'POST') {
        const data = JSON.parse(body.toString());
        const id = next('s');
        state.sessions.set(id, { path: `${data.parents[0]}/${data.name}`, chunks: [], parts: [] });
        return json(res, {}, 200, { Location: `http://${req.headers.host}${PREFIX.googleDrive}/session/${id}` });
      }
      const patch = /^\/upload\/files\/([^/]+)$/.exec(rest);
      if (patch && method === 'PATCH') {
        const found = [...state.files.googleDrive.entries()].find(([, f]) => f.id === decodeURIComponent(patch[1]));
        if (!found) return json(res, {}, 404);
        const id = next('s');
        state.sessions.set(id, { path: found[0], chunks: [], parts: [] });
        return json(res, {}, 200, { Location: `http://${req.headers.host}${PREFIX.googleDrive}/session/${id}` });
      }
    }

    // --- Microsoft Graph ---
    if (provider === 'oneDrive') {
      if (rest === '/v1.0/me') return json(res, { displayName: 'Diver', mail: null, userPrincipalName: ACCOUNT.oneDrive });
      const m = /^\/v1\.0\/me\/drive\/special\/approot:\/(.+?)(?::\/(content|createUploadSession))?$/.exec(decodeURIComponent(rest));
      if (m) {
        const filePath = m[1];
        const entry = state.files.oneDrive.get(filePath);
        if (m[2] === 'createUploadSession') {
          const id = next('s');
          state.sessions.set(id, { path: filePath, chunks: [], parts: [], conflict: JSON.parse(body.toString()).item?.['@microsoft.graph.conflictBehavior'] });
          return json(res, { uploadUrl: `http://${req.headers.host}${PREFIX.oneDrive}/session/${id}` });
        }
        if (!entry) return json(res, { error: { code: 'itemNotFound' } }, 404);
        if (m[2] === 'content') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          return res.end(entry.bytes);
        }
        return json(res, { id: entry.id, cTag: entry.rev, eTag: `etag-${entry.rev}`, lastModifiedDateTime: entry.modified });
      }
    }

    // --- Dropbox ---
    if (provider === 'dropbox') {
      if (rest === '/2/users/get_current_account') return json(res, { email: ACCOUNT.dropbox, name: { display_name: 'Diver' } });
      const arg = req.headers['dropbox-api-arg'] ? JSON.parse(String(req.headers['dropbox-api-arg'])) : body.length ? JSON.parse(body.toString()) : {};
      const filePath = String(arg.path || '').replace(/^\//, '');
      const entry = state.files.dropbox.get(filePath);
      if (rest === '/2/files/get_metadata') return entry ? json(res, { rev: entry.rev, server_modified: entry.modified }) : json(res, { error_summary: 'path/not_found/..' }, 409);
      if (rest === '/content/files/download') {
        if (!entry) return json(res, { error_summary: 'path/not_found/..' }, 409);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end(entry.bytes);
      }
      if (rest === '/content/files/upload') {
        if (arg.mode?.['.tag'] === 'update' && (!entry || entry.rev !== arg.mode.update)) return json(res, { error_summary: 'path/conflict/file/..' }, 409);
        if (arg.mode?.['.tag'] === 'add' && entry) return json(res, { error_summary: 'path/conflict/file/..' }, 409);
        const file = putFile('dropbox', filePath, body);
        state.lastUploadArg = String(req.headers['dropbox-api-arg']);
        return json(res, { rev: file.rev, server_modified: file.modified });
      }
    }
    return json(res, { error: 'not found', path: rest }, 404);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  const url = `http://127.0.0.1:${port}`;
  const endpoints = {
    googleDrive: { auth: `${url}/google/auth`, token: `${url}/google/token`, api: `${url}/google/drive`, upload: `${url}/google/upload` },
    oneDrive: { auth: `${url}/ms/auth`, token: `${url}/ms/token`, api: `${url}/ms/v1.0` },
    dropbox: { auth: `${url}/db/auth`, token: `${url}/db/token`, api: `${url}/db/2`, content: `${url}/db/content` },
  };
  return {
    url,
    endpoints,
    state: Object.assign(state, { putFile }),
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve(undefined));
    }),
  };
}

module.exports = { startFakeCloud, CLIENT, ACCOUNT };
