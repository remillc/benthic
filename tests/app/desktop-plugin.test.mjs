// The desktop implementation of the BenthicCore plugin (plugins/benthic-core/desktop.js),
// with a fake window.benthicDesktop: what it sends to the core and what it resolves, as the Android
// plugin does (BenthicCorePlugin.kt).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BenthicCoreDesktop, fileUrl, flatRules, joinPath, parseEnv } from '../../plugins/benthic-core/desktop.js';

const paths = { userData: '/data/Benthic', temp: '/tmp/benthic', resourcesDir: '/app/resources', xsltDir: '/app/resources/xslt', caFile: '/data/Benthic/cacerts.pem' };

/** A bridge that records the core calls and answers from `answers` (a value, or a function of the args). */
function fakeBridge(answers = {}) {
  const calls = [];
  const secrets = {};
  const files = new Map();
  const handlers = new Map();
  const bridge = {
    platform: 'linux',
    paths,
    calls,
    secrets,
    files,
    env: {},
    async core(method, args) {
      calls.push({ method, args });
      const answer = answers[method];
      const value = typeof answer === 'function' ? answer(args) : answer;
      if (value instanceof Error) throw value;
      return value === undefined ? null : value;
    },
    onCoreEvent(name, callback) {
      handlers.set(name, callback);
      return () => handlers.delete(name);
    },
    emit: (name, data) => handlers.get(name)?.(data),
    credentials: {
      async get(kind) {
        return secrets[kind] ?? null;
      },
      async set(kind, value) {
        secrets[kind] = value;
      },
      async clear(kind) {
        if (kind) delete secrets[kind];
        else for (const k of Object.keys(secrets)) delete secrets[k];
      },
    },
    fs: {
      async writeFile({ area, name, base64 }) {
        const path = `${paths.temp}/${area}/${name}`;
        files.set(path, base64);
        return { path };
      },
      async readFile({ path }) {
        return files.get(path);
      },
      async appendFile({ path, base64 }) {
        files.set(path, Buffer.concat([Buffer.from(files.get(path) ?? '', 'base64'), Buffer.from(base64, 'base64')]).toString('base64'));
        return true;
      },
      async readChunk({ path, offset, length }) {
        const bytes = Buffer.from(files.get(path) ?? '', 'base64');
        return { data: bytes.subarray(offset, offset + length).toString('base64'), size: bytes.length };
      },
      async assemble({ name, parts }) {
        const path = `${paths.temp}/import/${name}`;
        const out = parts.map((p) => (typeof p.text === 'string' ? Buffer.from(p.text) : Buffer.from(files.get(p.path), 'base64').subarray(p.start, p.end)));
        files.set(path, Buffer.concat(out).toString('base64'));
        return { path };
      },
      async remove({ path }) {
        return files.delete(path);
      },
      async exists({ path }) {
        return files.has(path);
      },
      async removeTree({ path }) {
        files.delete(path);
        return true;
      },
      async rename({ from, to }) {
        files.set(to, files.get(from));
        files.delete(from);
        return true;
      },
      async readDevEnv({ name }) {
        return bridge.env[name] ?? '';
      },
      async deleteDevEnv({ name }) {
        delete bridge.env[name];
        return true;
      },
    },
    async htmlToPdf({ name }) {
      return { path: `${paths.temp}/share/${name}` };
    },
    async placesSearch() {
      return { status: 200, body: '[]' };
    },
  };
  return bridge;
}

let bridge;
let plugin;

function install(answers) {
  bridge = fakeBridge(answers);
  globalThis.benthicDesktop = bridge;
  plugin = new BenthicCoreDesktop();
}

beforeEach(() => install({}));
afterEach(() => {
  delete globalThis.benthicDesktop;
});

const rejection = (promise) => promise.then(() => assert.fail('it must reject'), (e) => e);
const lastCall = () => bridge.calls[bridge.calls.length - 1];

test('without the desktop bridge every call rejects with UNAVAILABLE', async () => {
  delete globalThis.benthicDesktop;
  const error = await rejection(new BenthicCoreDesktop().listDives());
  assert.equal(error.code, 'UNAVAILABLE');
});

test('a core error rejects with its message and the code CORE_ERROR', async () => {
  install({ getDive: new Error('Dive not found') });
  const error = await rejection(plugin.getDive({ id: 9 }));
  assert.equal(error.message, 'Dive not found');
  assert.equal(error.code, 'CORE_ERROR');
});

test('importSample imports the bundled sample into <userData>/carnet[main]', async () => {
  install({ importFile: 12 });
  assert.deepEqual(await plugin.importSample(), { count: 12 });
  assert.deepEqual(lastCall(), { method: 'importFile', args: { source: '/app/resources/SampleDivesV2.ssrf', repo: '/data/Benthic/carnet[main]' } });
});

test('listDives gives the dives as JSON text, or an empty list without a log', async () => {
  install({ logExists: false });
  assert.deepEqual(await plugin.listDives(), { exists: false, json: '[]' });
  install({ logExists: true, listDives: '[{"id":1}]' });
  assert.deepEqual(await plugin.listDives(), { exists: true, json: '[{"id":1}]' });
});

test('getDive parses the dive; a missing id is BAD_ARGUMENT', async () => {
  install({ getDive: '{"id":3,"salinity":1030}' });
  assert.deepEqual(await plugin.getDive({ id: 3 }), { id: 3, salinity: 1030 });
  assert.equal((await rejection(plugin.getDive({}))).code, 'BAD_ARGUMENT');
});

test('objects are sent to the core as JSON text', async () => {
  install({ editDive: '{"dive":{}}', setPrefs: null, planDive: '{}', createDive: '{}', resolveConflicts: null, savePlan: '{}' });
  await plugin.editDive({ id: 4, changes: { notes: 'a' } });
  assert.deepEqual(lastCall().args, { id: 4, changes: '{"notes":"a"}' });
  await plugin.setPrefs({ changes: { gfLow: 30 } });
  assert.deepEqual(lastCall().args, { changes: '{"gfLow":30}' });
  await plugin.planDive({ request: { a: 1 } });
  assert.deepEqual(lastCall().args, { request: '{"a":1}' });
  await plugin.resolveConflicts({ choices: { 'a/b': 'cloud' } });
  assert.deepEqual(lastCall().args, { choices: '{"a/b":"cloud"}' });
  await plugin.savePlan({ request: { x: 1 }, title: 'T' });
  assert.deepEqual(lastCall().args, { request: '{"x":1}', replaceId: 0, title: 'T' });
  assert.equal((await rejection(plugin.editDive({ id: 4 }))).code, 'BAD_ARGUMENT');
});

test('filter rules go as five strings each', async () => {
  assert.deepEqual(flatRules([{ type: 'site', stringMode: 'substring', rangeMode: '', negate: true, data: 'Reef' }]), ['site', 'substring', '', '1', 'Reef']);
  assert.deepEqual(flatRules(null), []);
  install({ filterQuery: '[1,2]', filterPresets: '{}' });
  await plugin.filterQuery({ kind: 'dives', fulltext: 'x', mode: 'exact', rules: [{ type: 'tag', data: 'a' }] });
  assert.deepEqual(lastCall().args, { kind: 'dives', fulltext: 'x', mode: 'exact', rules: ['tag', '', '', '0', 'a'] });
  await plugin.filterPresets({ action: 'delete', index: 2 });
  assert.equal(lastCall().args.index, 2);
});

test('deleteDive takes one id or several; renumberDives needs a start', async () => {
  install({ deleteDive: '{}', renumberDives: '{}' });
  await plugin.deleteDive({ id: 5 });
  assert.deepEqual(lastCall().args, { ids: [5] });
  await plugin.deleteDive({ ids: [1, 2] });
  assert.deepEqual(lastCall().args, { ids: [1, 2] });
  assert.equal((await rejection(plugin.deleteDive({ ids: [] }))).code, 'BAD_ARGUMENT');
  assert.equal((await rejection(plugin.renumberDives({}))).code, 'BAD_ARGUMENT');
  await plugin.renumberDives({ start: 3 });
  assert.deepEqual(lastCall().args, { ids: [], start: 3, numbers: [] });
});

test('the loaded dive list can include hidden invalid dives', async () => {
  install({ listLoadedDives: '[]' });
  await plugin.listLoadedDives();
  assert.deepEqual(lastCall().args, {});
  await plugin.listLoadedDives({ includeInvalid: true });
  assert.deepEqual(lastCall().args, { includeInvalid: true });
});

test('site identifiers above 2^31 reach the core as numbers', async () => {
  install({ siteQuery: '{}', siteAction: '{}' });
  await plugin.siteQuery({ kind: 'site', uuid: 4000000000 });
  assert.equal(lastCall().args.uuid, 4000000000);
  await plugin.siteAction({ action: 'delete', uuids: [4000000001, 7] });
  assert.deepEqual(lastCall().args.uuids, [4000000001, 7]);
});

test('statsQuery sends the criteria as JSON text, or the field name', async () => {
  install({ statsQuery: '{}' });
  await plugin.statsQuery({ kind: 'stats', criteria: { suits: ['x'] } });
  assert.deepEqual(lastCall().args, { kind: 'stats', text: '{"suits":["x"]}' });
  await plugin.statsQuery({ kind: 'values', field: 'suits' });
  assert.deepEqual(lastCall().args, { kind: 'values', text: 'suits' });
});

test('configureCloud: the stored account, then the write lock from cloud-test.env', async () => {
  install({ cloudConfigure: null, setCloudTestEmail: null });
  bridge.secrets.cloud = { email: 'a@b.c', password: 'pw' };
  bridge.env['cloud-test.env'] = '# test\nBENTHIC_CLOUD_TEST_EMAIL=test@b.c\n';
  assert.deepEqual(await plugin.configureCloud(), { available: true, email: 'a@b.c' });
  assert.deepEqual(bridge.calls.map((c) => c.method), ['cloudConfigure', 'setCloudTestEmail']);
  assert.deepEqual(bridge.calls[1].args, { email: 'test@b.c' });
});

test('configureCloud without an account is not available; with a repository it is in git mode', async () => {
  install({ setCloudTestEmail: null });
  assert.deepEqual(await plugin.configureCloud(), { available: false, email: '' });
  install({ gitConfigure: null });
  bridge.secrets.git = { url: 'https://host/path[main]', username: 'u', branch: 'main', token: 't' };
  assert.deepEqual(await plugin.configureCloud(), { available: true, email: 'u', mode: 'git', repository: 'host/path' });
  assert.deepEqual(lastCall().args, { url: 'https://host/path', username: 'u', token: 't', branch: 'main' });
});

test('listCloudDives: cached, development credentials, none', async () => {
  install({ cloudListCachedDives: '' });
  assert.deepEqual(await plugin.listCloudDives({ cached: true }), { available: true, json: '' });
  install({ cloudListDives: '{}' });
  assert.deepEqual(await plugin.listCloudDives(), { available: false });
  bridge.env['cloud-dev.env'] = 'BENTHIC_CLOUD_EMAIL=d@e.f\nBENTHIC_CLOUD_PASSWORD=x\n';
  assert.deepEqual(await plugin.listCloudDives(), { available: true, json: '{}' });
  assert.deepEqual(lastCall().args, { email: 'd@e.f', password: 'x' });
});

test('signIn lowercases the email, stores the account when its logbook exists, keeps it in memory otherwise', async () => {
  install({ setCloudTestEmail: null, cloudConfigure: null, cloudProbe: '{"exists":true}' });
  assert.deepEqual(await plugin.signIn({ email: '  Me@Mail.COM ', password: 'pw' }), { exists: true, email: 'me@mail.com' });
  assert.deepEqual(bridge.secrets.cloud, { email: 'me@mail.com', password: 'pw' });
  install({ setCloudTestEmail: null, cloudConfigure: null, cloudProbe: '{"exists":false}' });
  assert.deepEqual(await plugin.signIn({ email: 'x@y.z', password: 'pw' }), { exists: false, email: 'x@y.z' });
  assert.equal(bridge.secrets.cloud, undefined);
  assert.deepEqual(plugin.pendingAccount, { email: 'x@y.z', password: 'pw' });
});

test('signIn: INCORRECT when the credentials are refused, NETWORK otherwise, the previous account set again', async () => {
  install({ setCloudTestEmail: null, cloudConfigure: null, cloudProbe: new Error('Credentials rejected by the server') });
  bridge.secrets.cloud = { email: 'old@o.o', password: 'old' };
  const refused = await rejection(plugin.signIn({ email: 'a@b.c', password: 'bad' }));
  assert.equal(refused.code, 'INCORRECT');
  assert.deepEqual(lastCall(), { method: 'cloudConfigure', args: { email: 'old@o.o', password: 'old' } });
  install({ setCloudTestEmail: null, cloudConfigure: null, cloudProbe: new Error('timeout') });
  assert.equal((await rejection(plugin.signIn({ email: 'a@b.c', password: 'x' }))).code, 'NETWORK');
});

test('create account, confirmation code, first logbook', async () => {
  install({ setCloudTestEmail: null, cloudConfigure: null, cloudCreateAccount: '{"status":"need_pin"}', cloudVerifyPin: '{"status":"verified"}', cloudCreateLog: '{"dives":0}' });
  assert.equal((await rejection(plugin.verifyPin({ pin: '1' }))).code, 'NO_ACCOUNT');
  assert.deepEqual(await plugin.createAccount({ email: 'N@E.W', password: 'pw' }), { status: 'need_pin', email: 'n@e.w' });
  assert.deepEqual(await plugin.resendCode(), { status: 'need_pin' });
  assert.deepEqual(await plugin.verifyPin({ pin: ' 1234 ' }), { status: 'verified' });
  assert.equal(bridge.calls.find((c) => c.method === 'cloudVerifyPin').args.pin, '1234');
  assert.deepEqual(await plugin.createLog({ source: 'empty' }), { json: '{"dives":0}' });
  assert.deepEqual(bridge.secrets.cloud, { email: 'n@e.w', password: 'pw' });
  assert.equal(plugin.pendingAccount, null);
});

test('createLog: the device log, and only our own staged files', async () => {
  install({ setCloudTestEmail: null, cloudConfigure: null, logExists: true, cloudCreateLog: '{}' });
  plugin.pendingAccount = { email: 'a@b.c', password: 'pw' };
  await plugin.createLog({ source: 'device' });
  assert.equal(lastCall().args.importPath, '/data/Benthic/carnet[main]');
  plugin.pendingAccount = { email: 'a@b.c', password: 'pw' };
  assert.equal((await rejection(plugin.createLog({ source: 'import', path: '/etc/passwd' }))).code, 'BAD_REQUEST');
  assert.equal((await rejection(plugin.createLog({ source: 'nope' }))).code, 'BAD_REQUEST');
});

test('stageImport, importCount and discardImport work on files of the import folder only', async () => {
  install({ importCount: '{"dives":3}' });
  const { path } = await plugin.stageImport({ name: 'C:\\dir\\my log.xml', data: 'QQ==' });
  assert.match(path, /^\/tmp\/benthic\/import\/import-\d+-my_log\.xml$/);
  assert.deepEqual(await plugin.importCount({ path }), { dives: 3 });
  assert.equal((await rejection(plugin.importCount({ path: '/tmp/benthic/share/x' }))).code, 'BAD_REQUEST');
  await plugin.discardImport({ path });
  assert.equal(bridge.files.has(path), false);
  assert.equal((await rejection(plugin.stageImport({ name: 'a' }))).code, 'BAD_REQUEST');
});

test('a logbook goes to the core by path: stageImport in pieces, readFileChunk, assembleFile, importDives({ path })', async () => {
  install({ importDives: '{"dive":{}}' });
  const first = await plugin.stageImport({ name: 'big.ssrf', data: Buffer.from('<divelog>').toString('base64') });
  const next = await plugin.stageImport({ path: first.path, data: Buffer.from('<dives/></divelog>').toString('base64'), append: true });
  assert.equal(next.path, first.path);
  const piece = await plugin.readFileChunk({ path: first.path, offset: 3, length: 4 });
  assert.deepEqual({ text: Buffer.from(piece.data, 'base64').toString(), size: piece.size }, { text: 'velo', size: 27 });
  const joined = await plugin.assembleFile({ name: 'big.ssrf', parts: [{ path: first.path, start: 0, end: 9 }, { text: '<divesites/>' }, { path: first.path, start: 9, end: 27 }] });
  assert.equal(Buffer.from(bridge.files.get(joined.path), 'base64').toString(), '<divelog><divesites/><dives/></divelog>');
  // Only files of the import folder: nothing else is read, appended to, assembled or imported by path.
  assert.equal((await rejection(plugin.readFileChunk({ path: '/etc/passwd', offset: 0, length: 4 }))).code, 'BAD_REQUEST');
  assert.equal((await rejection(plugin.stageImport({ path: '/etc/passwd', data: 'QQ==', append: true }))).code, 'BAD_REQUEST');
  assert.equal((await rejection(plugin.assembleFile({ parts: [{ path: '/etc/passwd', start: 0, end: 4 }] }))).code, 'BAD_REQUEST');
  assert.equal((await rejection(plugin.importDives({ name: 'x.ssrf', path: '/etc/passwd' }))).code, 'BAD_REQUEST');
  // The core reads the staged file where it is; it is deleted afterwards.
  assert.deepEqual(await plugin.importDives({ name: 'My Log.ssrf', path: joined.path }), { json: '{"dive":{}}' });
  assert.deepEqual(lastCall().args, { file: joined.path, source: 'My Log.ssrf' });
  assert.equal(bridge.files.has(joined.path), false);
  assert.equal((await rejection(plugin.stageSharedFile({ uri: 'content://x/1' }))).code, 'UNAVAILABLE');
});

test('importDives stages the file under its name, imports it, then deletes it', async () => {
  install({ importDives: '{"dive":{}}' });
  assert.deepEqual(await plugin.importDives({ name: 'dir/trip.ssrf', data: 'QQ==' }), { json: '{"dive":{}}' });
  // The staged file has a name of its own (a prefix) and keeps the extension; the source is the diver's name.
  const { file, source } = lastCall().args;
  assert.ok(file.startsWith('/tmp/benthic/import/') && file.endsWith('-trip.ssrf') && file.length > '/tmp/benthic/import/-trip.ssrf'.length);
  assert.equal(source, 'trip.ssrf');
  assert.equal(bridge.files.size, 0);
});

test('divelogsDownload: the file is kept only when dives came, and deleted on failure', async () => {
  install({ divelogsDownload: '{"dives":0}' });
  assert.deepEqual(await plugin.divelogsDownload({ user: 'u', password: 'p' }), { dives: 0, path: '' });
  install({ divelogsDownload: '{"dives":5}' });
  const result = await plugin.divelogsDownload({ user: 'u', password: 'p' });
  assert.equal(result.dives, 5);
  assert.equal(result.path, lastCall().args.outPath);
  install({ divelogsDownload: new Error('LOGIN_FAILED') });
  assert.equal((await rejection(plugin.divelogsDownload({ user: 'u', password: 'p' }))).message, 'LOGIN_FAILED');
});

test('deviceLog counts or imports the log of this device', async () => {
  install({ logExists: true, countDives: 7, importDives: '{}' });
  assert.deepEqual(await plugin.deviceLog({ action: 'exists' }), { exists: true });
  assert.equal(lastCall().method, 'logExists');
  assert.deepEqual(await plugin.deviceLog({ action: 'count' }), { count: 7 });
  await plugin.deviceLog({ action: 'import' });
  assert.deepEqual(lastCall().args, { file: '/data/Benthic/carnet[main]', source: 'this device' });
  install({ logExists: false });
  assert.deepEqual(await plugin.deviceLog({ action: 'exists' }), { exists: false });
  assert.deepEqual(await plugin.deviceLog({ action: 'count' }), { count: 0 });
  assert.equal((await rejection(plugin.deviceLog({ action: 'import' }))).code, 'NO_DIVES');
  assert.equal((await rejection(plugin.deviceLog({ action: 'x' }))).code, 'BAD_REQUEST');
});

test('signOut forgets every credential and the development file', async () => {
  install({ cloudSignOut: null });
  bridge.secrets.cloud = { email: 'a', password: 'b' };
  bridge.secrets.git = { url: 'u', username: 'n', branch: 'b', token: 't' };
  bridge.env['cloud-dev.env'] = 'x';
  await plugin.signOut({ deleteCopy: true });
  assert.deepEqual(lastCall().args, { deleteCopy: true });
  assert.deepEqual(bridge.secrets, {});
  assert.equal(bridge.env['cloud-dev.env'], undefined);
});

test('deleteAccount keeps the dives as the new logbook once the server confirms', async () => {
  // The core writes the kept copy while it deletes the account.
  install({ cloudDeleteAccount: () => (bridge.files.set('/data/Benthic/carnet.new', 'new'), '{"deleted":true}') });
  bridge.files.set('/data/Benthic/carnet', 'old');
  bridge.secrets.cloud = { email: 'a', password: 'b' };
  assert.deepEqual(await plugin.deleteAccount({ password: 'pw' }), { json: '{"deleted":true}' });
  assert.equal(lastCall().args.keepDivesIn, '/data/Benthic/carnet.new[main]');
  assert.equal(bridge.files.get('/data/Benthic/carnet'), 'new');
  assert.ok([...bridge.files.keys()].some((k) => k.includes('carnet.before-')));
  assert.equal(bridge.secrets.cloud, undefined);
});

test('deleteAccount refused: the copy is dropped and nothing moves', async () => {
  install({ cloudDeleteAccount: '{"deleted":false}' });
  bridge.files.set('/data/Benthic/carnet', 'old');
  await plugin.deleteAccount({ password: 'pw', keepDives: false });
  assert.equal(lastCall().args.keepDivesIn, '');
  assert.equal(bridge.files.get('/data/Benthic/carnet'), 'old');
});

test('gitCheck: BAD_ADDRESS comes out as the code; the stored token is used when asked', async () => {
  install({ gitCheck: new Error('BAD_ADDRESS: not https') });
  const error = await rejection(plugin.gitCheck({ url: 'http://x' }));
  assert.equal(error.code, 'BAD_ADDRESS');
  install({ gitCheck: '{"status":"ok"}' });
  bridge.secrets.git = { url: 'https://h/p[main]', username: 'stored', branch: 'main', token: 'tok' };
  assert.deepEqual(await plugin.gitCheck({ url: 'https://h/p', username: 'x', useStored: true }), { json: '{"status":"ok"}' });
  assert.deepEqual(lastCall().args, { url: 'https://h/p', username: 'stored', token: 'tok' });
});

test('gitConnect stores the repository on success; on failure it restores and rejects with a known code', async () => {
  install({ gitConfigure: null, cloudProbe: '{"exists":true}' });
  assert.deepEqual(await plugin.gitConnect({ url: 'https://h/p/', username: 'u', branch: 'main', token: 't' }), { created: false });
  assert.deepEqual(bridge.secrets.git, { url: 'https://h/p[main]', username: 'u', branch: 'main', token: 't' });
  assert.deepEqual(await plugin.gitConfig(), { url: 'https://h/p', username: 'u', branch: 'main' });

  install({ gitConfigure: null, cloudProbe: '{"exists":false}', gitCreateLog: '{}' });
  assert.equal((await rejection(plugin.gitConnect({ url: 'https://h/p', username: 'u', branch: 'b', token: 't' }))).code, 'NO_LOG');
  assert.equal(bridge.secrets.git, undefined);
  assert.deepEqual(await plugin.gitConnect({ url: 'https://h/p', username: 'u', branch: 'b', token: 't', empty: true }), { created: true });

  install({ gitConfigure: null, cloudProbe: new Error('Credentials rejected by the server') });
  assert.equal((await rejection(plugin.gitConnect({ url: 'https://h/p', username: 'u', branch: 'b', token: 't' }))).code, 'DENIED');
  install({ gitConfigure: null, cloudProbe: new Error('connection reset') });
  assert.equal((await rejection(plugin.gitConnect({ url: 'https://h/p', username: 'u', branch: 'b', token: 't' }))).code, 'NETWORK');
});

test('exportDives writes to the share folder and gives its address, or the text', async () => {
  install({ exportDives: null });
  assert.deepEqual(await plugin.exportDives({ ids: [1], format: 'ssrf', name: 'dive.ssrf' }), { uri: 'file:///tmp/benthic/share/dive.ssrf' });
  assert.deepEqual(lastCall().args, { ids: [1], format: 'ssrf', anonymize: false, path: '/tmp/benthic/share/dive.ssrf' });
  bridge.files.set('/tmp/benthic/share/q.xml', Buffer.from('plong\u00e9e').toString('base64'));
  assert.deepEqual(await plugin.exportDives({ ids: [1], format: 'ssrf', name: 'q.xml', text: true }), { uri: '', text: 'plong\u00e9e' });
  assert.equal(bridge.files.has('/tmp/benthic/share/q.xml'), false);
  // A big export is never returned as one string: TOO_BIG above 8 MB (the Android heap ran out of memory on it).
  bridge.files.set('/tmp/benthic/share/big.xml', Buffer.alloc(9 * 1024 * 1024, 65).toString('base64'));
  assert.equal((await rejection(plugin.exportDives({ ids: [1], format: 'ssrf', name: 'big.xml', text: true }))).code, 'TOO_BIG');
  assert.equal(bridge.files.has('/tmp/benthic/share/big.xml'), false);
  // `stage`: the core writes a staged file of the import folder; only its path and size come back.
  bridge.files.set('/tmp/benthic/import/x', Buffer.from('abc').toString('base64'));
  const staged = await plugin.exportDives({ ids: [1], format: 'ssrf', name: 'logbook.ssrf', stage: true });
  assert.equal(staged.uri, '');
  assert.match(staged.path, /^\/tmp\/benthic\/import\/import-\d+-logbook\.ssrf$/);
  assert.equal(lastCall().args.path, staged.path);
  assert.equal((await rejection(plugin.exportDives({ ids: [], format: 'ssrf', name: 'x' }))).code, 'BAD_ARGUMENT');
});

test('share helpers: files to share, PDF, nothing to grant', async () => {
  const { uri } = await plugin.writeShareFile({ name: 'a b.png', base64: 'QQ==' });
  assert.equal(uri, 'file:///tmp/benthic/share/a%20b.png');
  assert.deepEqual(await plugin.htmlToPdf({ html: '<p>x</p>', name: 'f.pdf' }), { uri: 'file:///tmp/benthic/share/f.pdf' });
  assert.equal((await rejection(plugin.htmlToPdf({ html: 'x' }))).code, 'BAD_ARGUMENT');
  assert.deepEqual(await plugin.grantShareFile({ uri }), { apps: 0 });
});

test('placesSearch only sends Nominatim addresses', async () => {
  assert.deepEqual(await plugin.placesSearch({ url: 'https://nominatim.openstreetmap.org/search?q=x' }), { status: 200, body: '[]' });
  assert.equal((await rejection(plugin.placesSearch({ url: 'https://example.com/' }))).code, 'BAD_ARGUMENT');
});

test('syncProgress and coreRestarted reach the listeners of the plugin', async () => {
  const seen = [];
  await plugin.bridge; // binds the events
  await plugin.addListener('syncProgress', (d) => seen.push(['p', d.message]));
  await plugin.addListener('coreRestarted', () => seen.push(['r']));
  bridge.emit('syncProgress', { message: 'Transfer from storage (3/8)' });
  bridge.emit('coreRestarted', {});
  assert.deepEqual(seen, [['p', 'Transfer from storage (3/8)'], ['r']]);
});

test('what a desktop cannot do: the answers the app copes with', async () => {
  assert.deepEqual(await plugin.networkStatus(), { wifi: true });
  assert.deepEqual(await plugin.contrastLevel(), { level: 0 });
  assert.deepEqual(await plugin.bluetoothStatus(), { bluetooth: 'none', permission: 'granted' });
  assert.deepEqual(await plugin.installSource(), { store: false, installer: '' });
  assert.deepEqual(await plugin.requestReview(), { requested: false });
  assert.deepEqual(await plugin.mapsFiles(), { files: [] });
  assert.deepEqual(await plugin.mapsDownloads(), { downloads: [] });
  await plugin.contentShown();
  await plugin.keepScreenAwake({ on: true });
  assert.equal((await rejection(plugin.mapsReadTile({ id: 'a', z: 1, x: 0, y: 0 }))).code, 'NOT_FOUND');
  assert.equal((await rejection(plugin.startBluetoothScan())).message, 'NO_BLUETOOTH');
  assert.equal((await rejection(plugin.downloadDives({}))).message, 'NO_BLUETOOTH');
  for (const method of ['mapsTilesStart', 'mapsDelete', 'openStorePage', 'openAppSettings', 'readSharedFile', 'gaugeCamera', 'qrScan', 'healthDives']) {
    assert.equal((await rejection(plugin[method]({}))).code, 'UNAVAILABLE', method);
  }
});

test('helpers: paths, file addresses, env files', () => {
  assert.equal(joinPath('C:\\Users\\me\\AppData\\', 'carnet'), 'C:\\Users\\me\\AppData\\carnet');
  assert.equal(joinPath('/home/me/', 'a', 'b'), '/home/me/a/b');
  assert.equal(fileUrl('C:\\Temp\\a b#1.pdf'), 'file:///C:/Temp/a%20b%231.pdf');
  assert.equal(fileUrl('/tmp/x.png'), 'file:///tmp/x.png');
  assert.deepEqual(parseEnv('# c\nA=1\r\n\nB=x=y\nbad'), { A: '1', B: 'x=y' });
});

test('error reports: the crash the main process saved is offered, then cleared', async () => {
  let saved = '{"message":"Main process: Error: boom"}';
  bridge.crash = { pending: async () => saved, clear: async () => { saved = ''; } };
  assert.deepEqual(await plugin.pendingCrashReport(), { json: '{"message":"Main process: Error: boom"}' });
  await plugin.clearCrashReport();
  assert.deepEqual(await plugin.pendingCrashReport(), { json: '' });
  delete bridge.crash;
  assert.deepEqual(await plugin.pendingCrashReport(), { json: '' });
});
