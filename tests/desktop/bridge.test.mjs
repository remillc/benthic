// SPDX-License-Identifier: GPL-2.0
// The main-process bridge (desktop/bridge.cjs), with a fake Electron and a fake host process
// (fake-host.cjs): the setup calls, the allow-list, the path policy, restarts, credentials and files.
// Run: node --test tests/desktop/bridge.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { setupBridge, HostProcess, forwardCoreStderr } = require('../../desktop/bridge.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const fakeHost = path.join(here, 'fake-host.cjs');

let root;
let bridge;
let userData;
let temp;
let resources;
const handlers = new Map();
let encryption = true;

const rejection = (promise) => promise.then(() => assert.fail('it must reject'), (e) => e);
/** What the preload does with an ipc answer. */
const invoke = async (channel, ...args) => {
  const answer = await handlers.get(channel)({}, ...args);
  if (!answer.ok) throw Object.assign(new Error(answer.error), { code: answer.code });
  return answer.value;
};

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'od-bridge-'));
  userData = path.join(root, 'userData');
  resources = path.join(root, 'resources');
  mkdirSync(resources);
  const app = {
    getPath: (name) => (name === 'userData' ? userData : path.join(root, 'tmp')),
    getVersion: () => '9.9.9',
    isPackaged: false,
    on: () => {},
    quit: () => {},
  };
  const safeStorage = {
    isEncryptionAvailable: () => encryption,
    // Not encryption: it only has to differ from the text, and fail on garbage.
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buffer) => {
      const text = buffer.toString();
      if (!text.startsWith('enc:')) throw new Error('cannot decrypt');
      return text.slice(4);
    },
  };
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn), on: (channel, fn) => handlers.set(`on:${channel}`, fn) };
  bridge = setupBridge({
    ipcMain,
    app,
    safeStorage,
    hostPath: process.execPath,
    hostArgs: [fakeHost],
    resourcesDir: resources,
    broadcast: () => {},
  });
  temp = path.join(root, 'tmp', 'opendives');
});

after(async () => {
  await bridge.stop();
  rmSync(root, { recursive: true, force: true });
});

test('the paths: userData, temp, resources, stylesheets and the certificate file', () => {
  const event = {};
  handlers.get('on:od:paths')(event);
  assert.equal(event.returnValue.userData, userData);
  assert.equal(event.returnValue.temp, temp);
  assert.equal(event.returnValue.resourcesDir, resources);
  assert.equal(event.returnValue.xsltDir, path.join(resources, 'xslt'));
  assert.equal(event.returnValue.caFile, path.join(userData, 'cacerts.pem'));
  assert.equal(event.returnValue.platform, process.platform);
  assert.ok(existsSync(path.join(temp, 'import')) && existsSync(path.join(temp, 'share')));
});

test('the host is set up before the first call: init, certificates, stylesheets', async () => {
  // The fake host answers any method with its name; the first call starts it.
  assert.equal(await invoke('od:core', 'listLoadedDives'), 'listLoadedDives');
  assert.ok(existsSync(path.join(userData, 'cacerts.pem')));
  assert.match(readFileSync(path.join(userData, 'cacerts.pem'), 'utf8'), /BEGIN CERTIFICATE/);
});

test('the setup calls come first and carry the right arguments', async () => {
  const seen = [];
  const host = new HostProcess({
    hostPath: process.execPath,
    hostArgs: [fakeHost],
    log: () => {},
    onStart: async (send) => {
      await send('init', { home: '/h' });
      await send('setCaFile', { path: '/ca' });
    },
  });
  try {
    seen.push(...(await host.call('received')));
    assert.deepEqual(seen, ['init', 'setCaFile', 'received']);
  } finally {
    await host.stop();
  }
});

test('only the host methods can be called, and the setup ones cannot', async () => {
  for (const method of ['init', 'setCaFile', 'setXsltDir', 'downloadDives', 'constructor', '__proto__', 42]) {
    assert.match((await rejection(invoke('od:core', method, {}))).message, /Unknown method/, String(method));
  }
  assert.match((await rejection(invoke('od:core', 'getDive', [1]))).message, /BAD_ARGUMENT/);
});

test('path arguments of core calls: userData and temp only, resources to read, no secrets', async () => {
  const repo = `${path.join(userData, 'carnet')}[main]`;
  assert.equal(await invoke('od:core', 'logExists', { repo }), 'logExists');
  assert.equal(await invoke('od:core', 'importFile', { source: path.join(resources, 'SampleDivesV2.ssrf'), repo }), 'importFile');
  assert.equal(await invoke('od:core', 'exportDives', { ids: [1], format: 'ssrf', path: path.join(temp, 'share', 'a.ssrf') }), 'exportDives');
  for (const [method, args] of [
    ['logExists', { repo: '/etc[main]' }],
    ['listDives', { repo: path.join(userData, '..', 'elsewhere') }],
    ['importFile', { source: path.join(root, 'secret.xml'), repo }],
    ['exportDives', { ids: [1], format: 'ssrf', path: path.join(resources, 'x') }],
    ['exportDives', { ids: [1], format: 'ssrf', path: path.join(userData, 'cloud-account.bin') }],
    ['importCount', { path: path.join(userData, 'cloud-dev.env') }],
    ['cloudCreateLog', { importPath: '/home/x/log.xml' }],
  ]) {
    assert.match((await rejection(invoke('od:core', method, args))).message, /BAD_ARGUMENT/, `${method} ${JSON.stringify(args)}`);
  }
  // An empty path means none.
  assert.equal(await invoke('od:core', 'cloudCreateLog', { importPath: '' }), 'cloudCreateLog');
});

test('git working copies: the page names a folder under userData/odgit, nothing else', async () => {
  assert.equal(await invoke('od:core', 'odgitStatus', { dir: 'server/main' }), 'odgitStatus');
  assert.equal(await invoke('od:core', 'odgitCancel', {}), 'odgitCancel');
  for (const dir of ['', '..', '../carnet', 'a/../../x', '/etc', 'a\\b', undefined]) {
    assert.match((await rejection(invoke('od:core', 'odgitStatus', { dir }))).message, /BAD_PATH/, String(dir));
  }
});

test('host process: results, errors, events and exact text', async () => {
  const events = [];
  const host = new HostProcess({ hostPath: process.execPath, hostArgs: [fakeHost], log: () => {}, onEvent: (n, d) => events.push([n, d]) });
  try {
    const text = { a: 1, text: 'café "x"\n🐠' };
    assert.deepEqual(await host.call('echo', text), text);
    assert.match((await rejection(host.call('fail'))).message, /CORE: it failed/);
    assert.equal(await host.call('progress'), null);
    assert.deepEqual(events, [['syncProgress', { message: 'Sync with cloud storage' }]]);
    const calls = await Promise.all([host.call('slow'), host.call('echo', { n: 1 }), host.call('echo', { n: 2 })]);
    assert.deepEqual(calls, ['done', { n: 1 }, { n: 2 }]);
  } finally {
    await host.stop();
  }
});

test('host stderr: only the exact missing CCR diluent diagnostic is ignored, even across chunks', async () => {
  const input = new PassThrough();
  const output = [];
  forwardCoreStderr(input, (text) => output.push(text.slice('[core] '.length)));
  const ignored = 'ERROR: Dive: 42, dive computer: Ordinateur é: CCR dive, but no diluent cylinder found. Please add or select the correct cylinder use.';
  const other = [
    'ERROR: Dive: 42, dive computer: Model: PSCR dive, but no drive gas cylinder found. Please add or select the correct cylinder use.',
    'ERROR: Dive: 42, dive computer: Model: CCR dive, but no diluent cylinder found. A different error.',
    `Other: ${ignored}`,
    'INFO: Create full text index',
  ];
  const bytes = Buffer.from(`${ignored}\r\n${other.join('\n')}\n${ignored}\n`);
  for (const byte of bytes) input.write(Buffer.from([byte]));
  input.end('ERROR: unfinished diagnostic');
  await new Promise((resolve) => input.on('end', resolve));
  assert.equal(output.join(''), `${other.join('\n')}\nERROR: unfinished diagnostic`);
});

test('host stderr: unrelated partial and long lines remain visible without waiting for a newline', async () => {
  const input = new PassThrough();
  const output = [];
  forwardCoreStderr(input, (text) => output.push(text.slice('[core] '.length)));
  input.write('INFO: progress');
  assert.equal(output.join(''), 'INFO: progress');
  const longLine = `ERROR: Dive: ${'x'.repeat(65537)}`;
  input.write(`\n${longLine}`);
  assert.equal(output.join(''), `INFO: progress\n${longLine}`);
  input.end('\n');
  await new Promise((resolve) => input.on('end', resolve));
  assert.equal(output.join(''), `INFO: progress\n${longLine}\n`);
});

test('host process: a crash fails the pending calls, tells the windows, and the next call restarts it', async () => {
  const exits = [];
  let starts = 0;
  const host = new HostProcess({
    hostPath: process.execPath,
    hostArgs: [fakeHost],
    log: () => {},
    onStart: async () => {
      starts += 1;
    },
    onExit: (reason) => exits.push(reason),
  });
  try {
    assert.equal(await host.call('echo', 1), 1);
    const pending = host.call('slow');
    const crash = rejection(host.call('crash'));
    assert.match((await crash).message, /The core stopped/);
    assert.match((await rejection(pending)).message, /The core stopped/);
    assert.equal(exits.length, 1);
    assert.equal(await host.call('echo', 'again'), 'again');
    assert.equal(starts, 2);
  } finally {
    await host.stop();
  }
});

test('host process: a program that cannot start fails the calls, then stops trying', async () => {
  const host = new HostProcess({ hostPath: path.join(root, 'no-such-program'), log: () => {} });
  for (let i = 0; i < 5; i++) assert.match((await rejection(host.call('ping'))).message, /Cannot run the core|not running/);
  assert.match((await rejection(host.call('ping'))).message, /cannot start/);
});

test('host process: stop lets the queued requests finish', async () => {
  const host = new HostProcess({ hostPath: process.execPath, hostArgs: [fakeHost], log: () => {} });
  const slow = host.call('slow');
  await host.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stopped = host.stop();
  assert.equal(await slow, 'done');
  await stopped;
});

test('credentials: stored encrypted, read back, cleared; incomplete or unencrypted refused', async () => {
  assert.equal(await invoke('od:credentials', 'get', 'cloud'), null);
  await invoke('od:credentials', 'set', 'cloud', { email: 'a@b.c', password: 'pw', extra: 'dropped' });
  const file = path.join(userData, 'cloud-account.bin');
  assert.ok(readFileSync(file, 'utf8').startsWith('enc:'));
  assert.ok(!readFileSync(file, 'utf8').includes('dropped'));
  assert.deepEqual(await invoke('od:credentials', 'get', 'cloud'), { email: 'a@b.c', password: 'pw' });
  await invoke('od:credentials', 'set', 'git', { url: 'https://h/p[main]', username: 'u', branch: 'main', token: 't' });
  assert.equal((await invoke('od:credentials', 'get', 'git')).token, 't');
  assert.match((await rejection(invoke('od:credentials', 'set', 'cloud', { email: 'a' }))).message, /incomplete/);
  assert.match((await rejection(invoke('od:credentials', 'get', 'nope'))).message, /unknown credentials kind/);
  writeFileSync(file, 'garbage');
  assert.equal(await invoke('od:credentials', 'get', 'cloud'), null); // a key lost: as no account
  encryption = false;
  assert.equal((await rejection(invoke('od:credentials', 'set', 'cloud', { email: 'a', password: 'b' }))).message, 'CREDENTIALS_NOT_SAVED');
  assert.equal(await invoke('od:credentials', 'get', 'git'), null);
  encryption = true;
  await invoke('od:credentials', 'clear', 'cloud');
  assert.ok(!existsSync(file));
  assert.ok(existsSync(path.join(userData, 'git-remote.bin')));
  await invoke('od:credentials', 'clear');
  assert.ok(!existsSync(path.join(userData, 'git-remote.bin')));
});

test('files: staged in temp, read back, deleted; names reduced; nothing outside', async () => {
  const { path: staged } = await invoke('od:fs', 'writeFile', { area: 'import', name: '../../evil/a:b.xml', base64: Buffer.from('<x/>').toString('base64') });
  assert.equal(path.dirname(staged), path.join(temp, 'import'));
  assert.equal(path.basename(staged), 'a_b.xml');
  assert.equal(Buffer.from(await invoke('od:fs', 'readFile', { path: staged }), 'base64').toString(), '<x/>');
  assert.equal(await invoke('od:fs', 'exists', { path: staged }), true);
  assert.equal(await invoke('od:fs', 'remove', { path: staged }), true);
  assert.equal(await invoke('od:fs', 'remove', { path: staged }), false);
  assert.match((await rejection(invoke('od:fs', 'writeFile', { area: 'elsewhere', name: 'a', base64: '' }))).message, /unknown area/);
  assert.match((await rejection(invoke('od:fs', 'readFile', { path: path.join(userData, 'cloud-account.bin') }))).message, /not an allowed path/);
  assert.match((await rejection(invoke('od:fs', 'remove', { path: path.join(root, 'outside') }))).message, /not an allowed path/);
  assert.match((await rejection(invoke('od:fs', 'exists', { path: path.join(root, 'outside') }))).message, /not an allowed path/);
});

test('files: appendFile adds bytes to a staged file, in temp only', async () => {
  const b64 = (t) => Buffer.from(t).toString('base64');
  const { path: staged } = await invoke('od:fs', 'writeFile', { area: 'share', name: 'export.zip', base64: b64('ab') });
  assert.equal(await invoke('od:fs', 'appendFile', { path: staged, base64: b64('cd') }), true);
  assert.equal(Buffer.from(await invoke('od:fs', 'readFile', { path: staged }), 'base64').toString(), 'abcd');
  await invoke('od:fs', 'remove', { path: staged });
  assert.match((await rejection(invoke('od:fs', 'appendFile', { path: path.join(root, 'outside'), base64: b64('x') }))).message, /not an allowed path/);
});

test('files: a big file is read in pieces (readChunk) and built from ranges and text (assemble), in temp only', async () => {
  const b64 = (t) => Buffer.from(t).toString('base64');
  const { path: staged } = await invoke('od:fs', 'writeFile', { area: 'import', name: 'import-1-big.ssrf', base64: b64('<divelog><dives/></divelog>') });
  const piece = await invoke('od:fs', 'readChunk', { path: staged, offset: 9, length: 7 });
  assert.deepEqual({ text: Buffer.from(piece.data, 'base64').toString(), size: piece.size }, { text: '<dives/', size: 27 });
  // Past the end: what is left; a length of 0 gives only the size; never more than 4 MB at once.
  assert.equal(Buffer.from((await invoke('od:fs', 'readChunk', { path: staged, offset: 20, length: 100 })).data, 'base64').toString(), 'ivelog>');
  assert.equal((await invoke('od:fs', 'readChunk', { path: staged, offset: 0, length: 0 })).size, 27);
  const joined = await invoke('od:fs', 'assemble', { name: 'import-2-big.ssrf', parts: [{ path: staged, start: 0, end: 9 }, { text: '<divesites/>' }, { path: staged, start: 9, end: 27 }] });
  assert.equal(path.dirname(joined.path), path.join(temp, 'import'));
  assert.equal(readFileSync(joined.path, 'utf8'), '<divelog><divesites/><dives/></divelog>');
  const outside = path.join(root, 'outside');
  assert.match((await rejection(invoke('od:fs', 'readChunk', { path: outside, offset: 0, length: 1 }))).message, /not an allowed path/);
  assert.match((await rejection(invoke('od:fs', 'assemble', { name: 'x.ssrf', parts: [{ path: outside, start: 0, end: 1 }] }))).message, /not an allowed path/);
  assert.ok(!existsSync(path.join(temp, 'import', 'x.ssrf')), 'a refused assembly leaves no file');
  await invoke('od:fs', 'remove', { path: staged });
  await invoke('od:fs', 'remove', { path: joined.path });
});

test('files: only logbook folders of userData are removed or renamed', async () => {
  const kept = path.join(userData, 'carnet.new');
  mkdirSync(kept);
  writeFileSync(path.join(kept, 'x'), '1');
  await invoke('od:fs', 'rename', { from: kept, to: path.join(userData, 'carnet.before-1') });
  assert.ok(existsSync(path.join(userData, 'carnet.before-1', 'x')));
  await invoke('od:fs', 'removeTree', { path: path.join(userData, 'carnet.before-1') });
  assert.ok(!existsSync(path.join(userData, 'carnet.before-1')));
  for (const bad of [userData, root, path.join(userData, 'cacerts.pem'), path.join(userData, 'carnet', 'sub'), path.join(userData, '..', 'carnet')]) {
    assert.match((await rejection(invoke('od:fs', 'removeTree', { path: bad }))).message, /not a logbook folder/, bad);
  }
});

test('files: the development env files, read and deleted by name only', async () => {
  assert.equal(await invoke('od:fs', 'readDevEnv', { name: 'cloud-test.env' }), '');
  writeFileSync(path.join(userData, 'cloud-test.env'), 'BENTHIC_CLOUD_TEST_EMAIL=t@t.t\n');
  assert.match(await invoke('od:fs', 'readDevEnv', { name: 'cloud-test.env' }), /t@t\.t/);
  assert.match((await rejection(invoke('od:fs', 'readDevEnv', { name: 'cloud-account.bin' }))).message, /unknown file/);
  assert.match((await rejection(invoke('od:fs', 'deleteDevEnv', { name: 'cloud-test.env' }))).message, /unknown file/);
  writeFileSync(path.join(userData, 'cloud-dev.env'), 'x');
  await invoke('od:fs', 'deleteDevEnv', { name: 'cloud-dev.env' });
  assert.ok(!existsSync(path.join(userData, 'cloud-dev.env')));
});

test('places search only goes to Nominatim; htmlToPdf needs html and a name', async () => {
  assert.match((await rejection(invoke('od:placesSearch', { url: 'https://example.com/' }))).message, /bad address/);
  assert.match((await rejection(invoke('od:htmlToPdf', { html: 'x' }))).message, /missing html or name/);
});
