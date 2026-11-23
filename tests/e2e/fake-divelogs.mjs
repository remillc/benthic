// SPDX-License-Identifier: GPL-2.0
// A fake divelogs.de for the e2e tests of « Envoyer vers divelogs.de » (task 2026-11-23-337): the real service is never called.
// It answers the two requests of the upload (core/uploadDiveLogsDE.cpp): POST /api/login (a multipart form with `user` and
// `pass`) with a bearer token, POST /api/dives (a JSON array) with a 200. The account is « christian » / « secret ». It allows
// the browser's cross-origin calls (the page of the test is another origin). The test steers it with `control`.
import { createServer } from 'node:http';

/**
 * @param {number} port
 * @returns {Promise<{ url: string, requests: { url: string, headers: Record<string, any>, body: string }[], dives: any[], control: { delayMs: number, dropDives: boolean }, close: () => void }>}
 */
export async function startFakeDivelogs(port) {
  /** @type {{ url: string, headers: Record<string, any>, body: string }[]} */
  const requests = [];
  /** @type {any[]} */
  const dives = [];
  const control = { delayMs: 0, dropDives: false };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    const chunks = /** @type {Buffer[]} */ ([]);
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ url: req.url ?? '', headers: req.headers, body });
      setTimeout(() => {
        const reply = (/** @type {number} */ status, /** @type {string} */ text) => (res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }), res.end(text));
        if (req.url === '/api/login') {
          const user = /name="user"\r\n\r\n([^\r]*)/.exec(body)?.[1];
          const pass = /name="pass"\r\n\r\n([^\r]*)/.exec(body)?.[1];
          return user === 'christian' && pass === 'secret' ? reply(200, '{"bearer_token":"e2e-token"}') : reply(401, '{"error":"Unauthorized"}');
        }
        if (req.url === '/api/dives') {
          if (control.dropDives) return req.socket.destroy();
          if (req.headers.authorization !== 'Bearer e2e-token') return reply(401, '{}');
          dives.push(...JSON.parse(body));
          return reply(200, '{"ok":true}');
        }
        reply(404, '{}');
      }, control.delayMs);
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  return { url: `http://127.0.0.1:${port}`, requests, dives, control, close: () => server.close() };
}
