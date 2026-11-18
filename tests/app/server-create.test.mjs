// Creating a logbook on the OpenDives server and the OpenDives+ screens (tasks 2026-11-17-265 and 266): the format
// writer, the upload and its resume after a cut connection, the choices, where an account goes after the code, the
// inert billing seams, the steps and their order, and the texts. The screens are read from their source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKER_PATH, diveFile, divePath, filesOfDive, markerFile, newId, profileFile, profilePath, stableJson, uniqueKeys } from '../../app/src/lib/server-logbook-format.js';
import { UPLOAD_KEY, UploadError, pendingUpload, timeLeft, uploadLogbook } from '../../app/src/lib/server-upload.js';
import { isEmptyBranch } from '../../app/src/lib/server-logbook.js';
import { createChoices } from '../../app/src/lib/server-create.js';
import { afterSignIn, summaryRows } from '../../app/src/lib/odplus.js';
import { purchaseSubscription, signInWithApple, signInWithGoogle } from '../../app/src/lib/odplus-billing.js';
import { back, enterCreate, enterOffer, forward, hasBack, replaceTop } from '../../app/src/lib/first-launch-steps.js';
import { resumeStep } from '../../app/src/lib/server-upload-resume.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

const row = (i) => ({ id: i, number: i + 1, date: `2024-03-${String(1 + i).padStart(2, '0')}T09:30:00`, site: i % 2 ? 'Reef' : 'Quarry', maxDepthMm: 18000 + i, durationSeconds: 2400, trip: i === 0 ? { id: 9, location: 'Trip', autogen: false } : null });
const detail = (i) => ({
  ...row(i), meanDepthMm: 9000, siteCoordinates: { latUdeg: 1, lonUdeg: 2 }, siteLocation: { city: 'C', region: '', country: 'K' },
  waterTempMk: 295000, airTempMk: 0, sacMlMin: 15000, cns: 3, otu: 4, rating: 4, visibility: 3, conditions: { wavesize: 0, current: 1, surge: 0, chill: 0 },
  salinity: 10300, waterType: 'salt', surfacePressureMbar: 1013, userSalinity: 0, invalid: false, manual: false, pictures: 0,
  diveComputers: [{ model: 'Perdix', nickname: '', divemode: 'OC', serial: 'S' }], divemode: 'OC', computer: 'Perdix', computers: 1,
  buddies: ['Ana'], guides: [], suit: '5 mm', weights: [{ grams: 4000, description: 'belt' }], tags: ['t'], notes: 'n',
  cylinders: [{ description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 200000, endMbar: 60000, o2Permille: 210, hePermille: 0, gas: 'Air', use: 'OC-gas', used: true, gasUsedMl: 99, switchDepthMm: 5, depthMm: 0, protected: false }],
  events: [{ type: 'gaschange', timeSeconds: 100, cylinder: 0 }],
  samples: { timeSeconds: [0, 60], depthMm: [0, 5000], cylinder: [0, 0], ceilingMm: null, ppo2Mbar: [210, 210], temperatureMk: null, tissues: [1, 2] },
});

// --- The format --------------------------------------------------------------------------------------------

test('JSON is written with sorted keys, two spaces and a final newline', () => {
  assert.equal(stableJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
});

test('ids are random UUIDs version 4, and the paths follow section 11.3', () => {
  const id = newId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(id, newId());
  assert.equal(divePath('5b0f3c0e-x'), 'dives/5b/5b0f3c0e-x/dive.json');
  assert.equal(profilePath('5b0f3c0e-x'), 'dives/5b/5b0f3c0e-x/profile.json');
});

test('dive.json keeps what the diver edits and never stores what the core computes', () => {
  const file = diveFile(detail(1), { id: 'abc', siteId: 's', tripId: null }, '2026-11-17T10:00:00.000Z');
  assert.equal(file.format, 1);
  assert.equal(file.start, '2024-03-02T09:30:00');
  assert.equal(file.siteId, 's');
  assert.deepEqual(file.cylinders[0].gearId, null);
  for (const computed of ['cns', 'otu', 'sacMlMin', 'gasUsedMl', 'switchDepthMm', 'waterType', 'salinity', 'samples', 'id_']) {
    assert.ok(!(computed in file), computed);
    assert.ok(!('gasUsedMl' in file.cylinders[0]) && !('switchDepthMm' in file.cylinders[0]));
  }
  assert.equal(file.origin.source, 'subsurface');
});

test('profile.json is columnar and leaves out a column the dive does not have', () => {
  const p = profileFile(detail(1), 'abc');
  assert.deepEqual(p.computers[0], { index: 0, timeSeconds: [0, 60], depthMm: [0, 5000], ppo2Mbar: [210, 210], cylinder: [0, 0] });
  assert.equal(p.diveId, 'abc');
});

test('the marker names the logbook and is the one file that makes it complete', () => {
  assert.deepEqual(markerFile({ name: 'Mon carnet', now: 'T' }), { format: 1, kind: 'opendives-logbook', minReader: 1, createdAt: 'T', name: 'Mon carnet' });
  assert.equal(MARKER_PATH, 'opendives.json');
});

test('a dive brings its site and trip only when they are not on the server yet', () => {
  const ids = { id: 'abcd', siteId: 'site1', tripId: 'trip1' };
  const first = filesOfDive({ detail: detail(0), ids, now: 'T', writeSite: true, writeTrip: true }).map((f) => f.path);
  assert.deepEqual(first, ['sites/site1.json', 'trips/trip1.json', 'dives/ab/abcd/dive.json', 'dives/ab/abcd/profile.json']);
  const later = filesOfDive({ detail: detail(0), ids, now: 'T', writeSite: false, writeTrip: false }).map((f) => f.path);
  assert.deepEqual(later, ['dives/ab/abcd/dive.json', 'dives/ab/abcd/profile.json']);
});

test('two dives with the same date, duration, depth and number get different keys', () => {
  const d = { date: 'D', durationSeconds: 1, maxDepthMm: 2, number: 3 };
  const keys = uniqueKeys([d, d, { ...d, number: 4 }]);
  assert.equal(new Set(keys).size, 3);
});

// --- The upload and its resume ----------------------------------------------------------------------------

/** A git host in memory: the tree, the commits, and a switch that cuts the connection. */
function host() {
  const files = new Map();
  const commits = [];
  const state = { cutAfterCommits: Infinity, requests: 0 };
  const transport = async (request) => {
    state.requests++;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.includes('/git/trees/')) {
      if (!files.size) return { status: 400, text: '{"message":"sha not found [main]"}' };
      return { status: 200, text: JSON.stringify({ tree: [...files.keys()].map((path) => ({ path, type: 'blob' })), truncated: false }) };
    }
    if (request.method === 'POST' && url.pathname.endsWith('/contents')) {
      if (commits.length >= state.cutAfterCommits) throw new Error('connection cut');
      for (const f of request.body.files) if (files.has(f.path)) return { status: 422, text: '{}' };
      for (const f of request.body.files) files.set(f.path, Buffer.from(f.content, 'base64').toString('utf8'));
      commits.push(request.body.files.map((f) => f.path));
      return { status: 201, text: '{}' };
    }
    return { status: 404, text: '{}' };
  };
  return { files, commits, state, transport };
}
const memoryStore = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const source = (n) => ({ list: async () => Array.from({ length: n }, (_, i) => row(i)), detail: async (id) => detail(id) });
const access = { repositoryUrl: 'https://git.example/diver/logbook.git', branch: 'main', token: 'tok-9f3a1c' };

test('an empty branch is told from a failure: 404, 409 and Forgejo\'s 400 are empty, a 500 is not', () => {
  assert.ok(isEmptyBranch({ status: 404, text: '' }));
  assert.ok(isEmptyBranch({ status: 409, text: '' }));
  assert.ok(isEmptyBranch({ status: 400, text: '{"message":"sha not found [main]"}' }));
  assert.ok(!isEmptyBranch({ status: 500, text: 'sha not found' }));
  assert.ok(!isEmptyBranch({ status: 400, text: 'bad body' }));
});

test('the upload sends the dives in small commits and the marker last', async () => {
  const h = host();
  const store = memoryStore();
  const progress = [];
  const result = await uploadLogbook({ transport: h.transport, access, store, source: source(12), name: 'Mon carnet', batchDives: 5, onProgress: (d, t) => progress.push([d, t]) });
  assert.deepEqual(result, { dives: 12 });
  assert.deepEqual(progress, [[0, 12], [5, 12], [10, 12], [12, 12]]);
  assert.equal(h.commits.length, 4, 'three batches and the marker');
  assert.deepEqual(h.commits.at(-1), ['opendives.json']);
  assert.equal([...h.files.keys()].filter((p) => p.endsWith('/dive.json')).length, 12);
  assert.equal([...h.files.keys()].filter((p) => p.startsWith('sites/')).length, 2);
  assert.equal([...h.files.keys()].filter((p) => p.startsWith('trips/')).length, 1);
  assert.equal(store.getItem(UPLOAD_KEY), null, 'nothing is left to resume');
  assert.equal(JSON.parse(h.files.get('opendives.json')).name, 'Mon carnet');
  assert.ok(h.files.get([...h.files.keys()].find((p) => p.endsWith('dive.json'))).endsWith('\n'));
});

test('a cut connection stops the upload with what was sent, and the next run continues from there with the same files', async () => {
  const h = host();
  const store = memoryStore();
  h.state.cutAfterCommits = 2;
  await assert.rejects(
    uploadLogbook({ transport: h.transport, access, store, source: source(12), name: 'N', batchDives: 5 }),
    (e) => e instanceof UploadError && e.code === 'UNREACHABLE' && e.done === 10,
  );
  assert.ok(!h.files.has('opendives.json'), 'no marker: the logbook is not complete');
  const kept = pendingUpload(store, access.repositoryUrl);
  assert.equal(kept.total, 12);
  assert.equal(kept.name, 'N');
  const sentBefore = new Set(h.files.keys());

  h.state.cutAfterCommits = Infinity;
  const progress = [];
  await uploadLogbook({ transport: h.transport, access, store, source: source(12), name: 'N', batchDives: 5, onProgress: (d, t) => progress.push(d) });
  assert.equal(progress[0], 10, 'it starts from what the server has');
  assert.equal(h.commits.length, 4, 'two before the cut, then one batch of two dives and the marker');
  for (const p of sentBefore) assert.ok(h.files.has(p));
  assert.equal([...h.files.keys()].filter((p) => p.endsWith('/dive.json')).length, 12, 'no dive twice');
  assert.ok(h.files.has('opendives.json'));
  assert.equal(store.getItem(UPLOAD_KEY), null);
});

test('a cut before anything is sent reports no dive sent', async () => {
  const h = host();
  h.state.cutAfterCommits = 0;
  await assert.rejects(uploadLogbook({ transport: h.transport, access, store: memoryStore(), source: source(3), name: 'N' }), (e) => e.code === 'UNREACHABLE' && e.done === 0);
  assert.equal(h.files.size, 0);
});

test('a logbook already complete on the server is not sent again', async () => {
  const h = host();
  h.files.set('opendives.json', '{}');
  const result = await uploadLogbook({ transport: h.transport, access, store: memoryStore(), source: source(3), name: 'N' });
  assert.deepEqual(result, { dives: 3 });
  assert.equal(h.commits.length, 0);
});

test('an empty logbook is only the marker', async () => {
  const h = host();
  await uploadLogbook({ transport: h.transport, access, store: memoryStore(), source: source(0), name: 'Vide' });
  assert.deepEqual([...h.files.keys()], ['opendives.json']);
});

test('cancelling stops between two batches and keeps the ids for the next run', async () => {
  const h = host();
  const store = memoryStore();
  let stop = false;
  await assert.rejects(
    uploadLogbook({ transport: h.transport, access, store, source: source(12), name: 'N', batchDives: 5, onProgress: (d) => (stop = d >= 5), cancelled: () => stop }),
    (e) => e.code === 'CANCELLED' && e.done === 5,
  );
  assert.ok(pendingUpload(store, access.repositoryUrl));
});

test('a state of another repository is not resumed, and no token is ever stored', async () => {
  const h = host();
  const store = memoryStore();
  h.state.cutAfterCommits = 1;
  await uploadLogbook({ transport: h.transport, access, store, source: source(6), name: 'N', batchDives: 5 }).catch(() => {});
  assert.equal(pendingUpload(store, 'https://git.example/other/logbook.git'), null);
  assert.ok(!store.getItem(UPLOAD_KEY).includes(access.token));
});

test('the time left is unknown at first, then in seconds, then in minutes', () => {
  assert.deepEqual(timeLeft({ done: 0, total: 10, startedDone: 0, elapsedMs: 5000 }), { unit: 'none', n: 0 });
  assert.deepEqual(timeLeft({ done: 5, total: 10, startedDone: 0, elapsedMs: 10000 }), { unit: 'seconds', n: 10 });
  assert.deepEqual(timeLeft({ done: 100, total: 312, startedDone: 0, elapsedMs: 60000 }), { unit: 'minutes', n: 2 });
  assert.deepEqual(timeLeft({ done: 10, total: 10, startedDone: 0, elapsedMs: 9000 }), { unit: 'none', n: 0 });
});

test('an unfinished upload is offered again at the start: a fresh one goes straight on, a stopped one asks', () => {
  assert.equal(resumeStep(null), null);
  assert.equal(resumeStep({ v: 1, fresh: true }), 'createSend');
  assert.equal(resumeStep({ v: 1 }), 'createInterrupted');
});

// --- The choices and the steps -----------------------------------------------------------------------------

test('the third choice appears only when a logbook exists on the device', () => {
  assert.deepEqual(createChoices(null), ['blank', 'import']);
  assert.deepEqual(createChoices(undefined), ['blank', 'import']);
  assert.deepEqual(createChoices({ name: 'Mon carnet', dives: 312 }), ['blank', 'import', 'device']);
  const source = read('components/FirstLaunchServerCreate.svelte');
  assert.match(source, /\{:else if c\.deviceLogbook\}/);
  assert.match(source, /serverCreate\.sendTitle/);
});

test('the creation steps follow the mock-ups and the upload has no « Retour »', () => {
  let stack = ['start', 'server', 'serverCode', 'serverDownload'];
  stack = enterCreate(stack);
  assert.deepEqual(stack, ['start', 'server', 'createChoice']);
  assert.deepEqual(back(stack), ['start', 'server']);
  assert.deepEqual(forward(stack, 'blank'), [...stack, 'createName']);
  assert.deepEqual(forward(stack, 'send'), [...stack, 'createSend']);
  assert.deepEqual(forward([...stack, 'createName'], 'offline').at(-1), 'createOffline');
  assert.deepEqual(replaceTop([...stack, 'createSend'], 'createInterrupted'), [...stack, 'createInterrupted']);
  for (const step of ['createSend', 'createInterrupted', 'createOffline', 'odplusOffer', 'odplusReady', 'odplusWelcome']) assert.equal(hasBack(step), false, step);
  for (const step of ['createChoice', 'createName', 'odplusConnect', 'server']) assert.equal(hasBack(step), true, step);
});

test('the two entries of the first step, and the way of the offer', () => {
  assert.deepEqual(forward(['start'], 'signIn'), ['start', 'odplusConnect']);
  assert.deepEqual(forward(['start'], 'discover'), ['start', 'odplusOffer']);
  assert.deepEqual(forward(['start', 'odplusConnect'], 'email'), ['start', 'odplusConnect', 'server']);
  assert.deepEqual(forward(['start', 'odplusOffer'], 'welcome').at(-1), 'odplusWelcome');
  assert.deepEqual(enterOffer(['start', 'odplusConnect', 'server', 'serverCode']), ['start', 'odplusConnect', 'server', 'odplusOffer']);
  assert.deepEqual(forward(['start', 'odplusConnect', 'server', 'serverCode', 'serverDownload'], 'ready').at(-1), 'odplusReady');
});

// --- OpenDives+ --------------------------------------------------------------------------------------------

test('a subscribed account goes to its logbook, any other one to the offer', () => {
  assert.equal(afterSignIn({ subscribed: true }), 'download');
  assert.equal(afterSignIn({ subscribed: false }), 'offer');
  assert.equal(afterSignIn({}), 'offer');
  assert.equal(afterSignIn(undefined), 'offer');
});

test('an account without a subscription keeps nothing on the device', () => {
  const source = read('components/FirstLaunchServer.svelte');
  const offer = source.indexOf("afterSignIn(session.user) === 'offer'");
  const save = source.indexOf('serverSessionSave');
  assert.ok(offer > 0 && save > offer, 'the offer is chosen before the session is saved');
  assert.match(source.slice(offer, save), /goOffer\(\);\s*return;/);
});

test('Google, Apple and the purchase are inert: one function each, nothing is bought or created', async () => {
  assert.deepEqual(await signInWithGoogle(), { status: 'unavailable' });
  assert.deepEqual(await signInWithApple(), { status: 'unavailable' });
  assert.deepEqual(await purchaseSubscription(), { status: 'unavailable' });
  const billing = read('lib/odplus-billing.js');
  assert.doesNotMatch(billing, /^import /m, 'no native dependency');
  const screen = read('components/FirstLaunchOdPlus.svelte');
  assert.match(screen, /signInWithGoogle\(\)/);
  assert.match(screen, /purchaseSubscription\(\)/);
  const pkg = JSON.parse(readFileSync(new URL('../../app/package.json', import.meta.url), 'utf8'));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /billing|purchase|google-auth|apple|iap/i.test(d)));
});

test('« Continuer sans compte » and « Continuer sans abonnement » create nothing', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const fn = steps.slice(steps.indexOf('function withoutAccount()'));
  assert.match(fn.slice(0, 120), /goBackTo\('start'\)/);
  const screen = read('components/FirstLaunchOdPlus.svelte');
  assert.equal([...screen.matchAll(/onclick=\{onwithout\}/g)].length, 2);
});

test('the development switch to « Bienvenue dans OpenDives+ » exists in development builds only', () => {
  const screen = read('components/FirstLaunchOdPlus.svelte');
  assert.match(screen, /if \(!import\.meta\.env\?\.DEV \|\| step !== 'odplusOffer'\) return;/);
  assert.equal([...screen.matchAll(/__odplus/g)].length, 3);
});

test('the summary card lists dives, sites, gear and certifications', () => {
  assert.deepEqual(summaryRows({ dives: 312, sites: 48, gear: 14, certifications: 3 }).map((r) => r.key), ['dives', 'sites', 'gear', 'certifications']);
});

test('no development address in the screens of the release edition', () => {
  for (const file of ['components/FirstLaunchOdPlus.svelte', 'components/FirstLaunchServerCreate.svelte', 'lib/server-upload.js', 'lib/server-logbook-format.js', 'lib/odplus-billing.js']) {
    assert.doesNotMatch(read(file), /127\.0\.0\.1|10\.0\.2\.2|localhost/, file);
  }
});

// --- The texts ---------------------------------------------------------------------------------------------

test('every text of the new screens is in fr and en, and the price is the one of the task', () => {
  for (const lang of ['fr', 'en']) {
    const c = langs[lang];
    for (const base of ['sendTitle', 'nameHelp', 'safe', 'created', 'offlineHelp', 'interruptedHelp']) for (const s of ['', 'Phone', 'Iphone', 'Desktop']) assert.ok(`${base}${s}` in c.serverCreate, `${lang}: ${base}${s}`);
    for (const s of ['', 'Phone', 'Iphone', 'Desktop']) assert.ok(`lead${s}` in c.odplus.ready, `${lang}: ready lead${s}`);
    for (const key of ['progress', 'sendHelp', 'sendingName', 'leftMinutes', 'interruptedSent', 'sentCount']) assert.equal(typeof c.serverCreate[key], 'object', `${lang}: ${key} is a plural`);
    assert.ok(c.serverSteps.backHome);
    assert.ok(!('title' in c.serverSteps), 'no « Serveur OpenDives » overline text');
  }
  assert.equal(langs.fr.odplus.offer.price, '14,99 $ US');
  assert.equal(langs.fr.odplus.offer.per, 'par an');
  assert.equal(langs.fr.odplus.offer.priceDetail, 'soit 1,25 $ par mois · Résiliable en tout temps');
  assert.equal(langs.fr.odplus.offer.subscribe, 'S’abonner');
  assert.equal(langs.fr.odplus.offer.without, 'Continuer sans abonnement');
  assert.equal(langs.fr.odplus.offer.noAccount, 'Aucun compte n’est créé.');
  assert.equal(langs.fr.odplus.welcome.title, 'Bienvenue dans OpenDives+ !');
  assert.equal(langs.fr.serverSteps.backHome, 'Revenir à l’accueil');
});

test('the server screens no longer draw the « Serveur OpenDives » overline, and the offline icon is centred', () => {
  const source = read('components/FirstLaunchServer.svelte');
  assert.doesNotMatch(source, /overline/);
  assert.match(source, /od-first-launch-server--tile \{[^}]*align-self: center/s);
});
