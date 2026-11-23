// The divelogs.de upload (task 2026-11-23-337) against a fake server on the loopback: never the real divelogs.de.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BATCH_SIZE, createDivelogsUpload, divelogsBase, divelogsLogin, multipartBody } from '../../app/src/lib/divelogs-upload.js';

/** A fake divelogs.de: records the requests; `mode` changes the answers. */
async function fakeServer() {
  const state = { requests: [], mode: {}, dives: [] };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      state.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const reply = (status, text) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(text));
      if (req.url === '/api/login') {
        if (state.mode.login) return reply(...state.mode.login);
        const user = /name="user"\r\n\r\n([^\r]*)/.exec(body)?.[1];
        const pass = /name="pass"\r\n\r\n([^\r]*)/.exec(body)?.[1];
        return user === 'christian' && pass === 'secret' ? reply(200, '{"bearer_token":"tok-123"}') : reply(401, '{"error":"Unauthorized"}');
      }
      if (req.url === '/api/dives') {
        if (req.headers.authorization !== 'Bearer tok-123') return reply(401, '{}');
        if (state.mode.dives?.length) return reply(...state.mode.dives.shift());
        state.dives.push(...JSON.parse(body));
        return reply(200, '{"ok":true}');
      }
      reply(404, '{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const transport = async (request) => {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
    return { status: response.status, text: await response.text() };
  };
  return { state, base, transport, close: () => server.close() };
}

const ssrfOf = (ids) =>
  `<divelog><dives>${ids.map((id) => `<dive number='${id}' date='2025-01-01' time='10:00:00' duration='30:00 min'><divecomputer model='X'><sample time='0:00 min' depth='0.0 m'/><sample time='0:10 min' depth='2.0 m'/></divecomputer></dive>`).join('')}</dives></divelog>`;

test('the login is a multipart form with user and pass, and gives the token', async () => {
  const s = await fakeServer();
  try {
    const token = await divelogsLogin(s.transport, s.base, { user: 'christian', password: 'secret' });
    assert.equal(token, 'tok-123');
    const [login] = s.state.requests;
    assert.equal(login.method, 'POST');
    assert.match(login.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(login.body, /name="user"\r\n\r\nchristian\r\n/);
    assert.match(login.body, /name="pass"\r\n\r\nsecret\r\n/);
  } finally {
    s.close();
  }
});

test('refused credentials: 401 is LOGIN_FAILED, a reply without a token too', async () => {
  const s = await fakeServer();
  try {
    await assert.rejects(divelogsLogin(s.transport, s.base, { user: 'christian', password: 'wrong' }), { code: 'LOGIN_FAILED' });
    s.state.mode.login = [200, '{"message":"no"}'];
    await assert.rejects(divelogsLogin(s.transport, s.base, { user: 'a', password: 'b' }), { code: 'LOGIN_FAILED' });
    s.state.mode.login = [200, 'not json'];
    await assert.rejects(divelogsLogin(s.transport, s.base, { user: 'a', password: 'b' }), { code: 'SERVER' });
    s.state.mode.login = [500, '{}'];
    await assert.rejects(divelogsLogin(s.transport, s.base, { user: 'a', password: 'b' }), { code: 'SERVER' });
  } finally {
    s.close();
  }
});

test('a server that is not there is a network error', async () => {
  const s = await fakeServer();
  s.close();
  await assert.rejects(divelogsLogin(s.transport, s.base, { user: 'a', password: 'b' }), { code: 'NETWORK' });
});

test('the dives go in batches, with the token, as a JSON array; the progress counts the dives accepted', async () => {
  const s = await fakeServer();
  try {
    const ids = Array.from({ length: BATCH_SIZE * 2 + 3 }, (_, i) => i + 1);
    const upload = createDivelogsUpload({ transport: s.transport, base: s.base, ids, exportBatch: async (batch) => ssrfOf(batch) });
    await upload.login({ user: ' christian ', password: 'secret' });
    const progress = [];
    await upload.send((done, total) => progress.push([done, total]), () => false);
    assert.deepEqual(progress.map((p) => p[0]), [0, BATCH_SIZE, BATCH_SIZE * 2, ids.length]);
    assert.equal(progress.at(-1)[1], ids.length);
    assert.equal(upload.sent, ids.length);
    assert.equal(s.state.dives.length, ids.length);
    const posts = s.state.requests.filter((r) => r.url === '/api/dives');
    assert.equal(posts.length, 3);
    assert.equal(posts[0].headers.authorization, 'Bearer tok-123');
    assert.equal(posts[0].headers['content-type'], 'application/json');
    assert.equal(s.state.dives[0].duration, 1800);
    assert.deepEqual(s.state.dives[0].sampledata, [0, 2]);
  } finally {
    s.close();
  }
});

test('the user name and the password are in no request but the login', async () => {
  const s = await fakeServer();
  try {
    const upload = createDivelogsUpload({ transport: s.transport, base: s.base, ids: [1, 2], exportBatch: async (b) => ssrfOf(b) });
    await upload.login({ user: 'christian', password: 'secret' });
    await upload.send(() => {}, () => false);
    for (const r of s.state.requests.filter((r) => r.url !== '/api/login')) {
      assert.ok(!r.body.includes('secret') && !r.body.includes('christian'));
      assert.ok(!JSON.stringify(r.headers).includes('secret'));
    }
  } finally {
    s.close();
  }
});

test('a network error stops the upload; send again resumes at the batch that failed', async () => {
  const s = await fakeServer();
  try {
    const ids = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => i + 1);
    let failNext = false;
    const flaky = async (request) => {
      if (failNext && request.url.endsWith('/api/dives')) throw new Error('offline');
      return s.transport(request);
    };
    const upload = createDivelogsUpload({ transport: flaky, base: s.base, ids, exportBatch: async (b) => ssrfOf(b) });
    await upload.login({ user: 'christian', password: 'secret' });
    // The first batch goes, then the connection is lost.
    await assert.rejects(
      upload.send((done) => {
        if (done === BATCH_SIZE) failNext = true;
      }, () => false),
      { code: 'NETWORK' },
    );
    assert.equal(upload.sent, BATCH_SIZE);
    assert.equal(s.state.dives.length, BATCH_SIZE);
    failNext = false;
    await upload.send(() => {}, () => false);
    assert.equal(upload.sent, ids.length);
    assert.equal(s.state.dives.length, ids.length);
  } finally {
    s.close();
  }
});

test('a refused batch is a server error and counts nothing; cancel stops before the next batch', async () => {
  const s = await fakeServer();
  try {
    const ids = Array.from({ length: BATCH_SIZE * 2 }, (_, i) => i + 1);
    s.state.mode.dives = [[500, '{}']];
    const upload = createDivelogsUpload({ transport: s.transport, base: s.base, ids, exportBatch: async (b) => ssrfOf(b) });
    await upload.login({ user: 'christian', password: 'secret' });
    await assert.rejects(upload.send(() => {}, () => false), { code: 'SERVER' });
    assert.equal(upload.sent, 0);
    let stop = false;
    await assert.rejects(upload.send((done) => { if (done === BATCH_SIZE) stop = true; }, () => stop), { code: 'CANCELLED' });
    assert.equal(upload.sent, BATCH_SIZE);
  } finally {
    s.close();
  }
});

test('multipart bodies and the address', () => {
  assert.equal(multipartBody({ a: '1', b: 'x y' }, 'B'), '--B\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--B\r\nContent-Disposition: form-data; name="b"\r\n\r\nx y\r\n--B--\r\n');
  assert.equal(divelogsBase(''), 'https://divelogs.de');
  assert.equal(divelogsBase('http://127.0.0.1:9000/'), 'http://127.0.0.1:9000');
  assert.equal(divelogsBase('https://evil.example'), 'https://divelogs.de');
  assert.equal(divelogsBase('http://example.com'), 'https://divelogs.de');
});
