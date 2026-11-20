import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diveOfPath, siteOfPath, summarizeChanges, parseDiveFile, diveFieldChanges, computerModel,
  listVersions, versionDetail, diveVersions, deletedDives, restoreVersion, restoreDive, divesAt, keyOfDate,
} from '../../app/src/lib/backup-history.js';
import { GitLogbook } from './git-history-core.mjs';

test('a path names its dive by the start time, wherever the folder is', () => {
  assert.deepEqual(diveOfPath('2022/04/24-Sun-10=30=00/Dive-7'), { key: '2022-04-24 10:30:00', dir: '2022/04/24-Sun-10=30=00', file: 'Dive-7', isDive: true, number: 7 });
  assert.equal(diveOfPath('2022/04/24-Sun-10=30=00/Divecomputer').isDive, false);
  assert.equal(diveOfPath('2022/04/24-Sun-10=30=00/Dive').number, null);
  // In a trip folder, and across a month boundary (the dive's name then carries its own month).
  assert.equal(diveOfPath('2013/02/02-Voyage~ab12/04-Mon-08=47=00/Dive-4').key, '2013-02-04 08:47:00');
  assert.equal(diveOfPath('2013/01/31-Voyage~ab12/02-01-Fri-08=47=00/Dive-4').key, '2013-02-01 08:47:00');
  assert.equal(diveOfPath('2013/12/30-Voyage~ab12/2014-01-02-Thu-08=47=00/Dive-4').key, '2014-01-02 08:47:00');
  assert.equal(diveOfPath('2022/04/24-Sun-10=30=00~4f2a/Pictures/+00=01=00').dir, '2022/04/24-Sun-10=30=00~4f2a');
  assert.equal(diveOfPath('01-Divesites/Site-0000aaaa'), null);
  assert.equal(diveOfPath('00-Subsurface'), null);
  assert.equal(siteOfPath('01-Divesites/Site-0000aaaa'), '0000aaaa');
  assert.equal(siteOfPath('2022/04/24-Sun-10=30=00/Dive-7'), null);
});

test('the changes of a sync say which dives were added, removed or modified', () => {
  const sum = summarizeChanges([
    { path: '2022/05/08-Sun-09=00=00/Dive-3', state: 'new' },
    { path: '2022/05/08-Sun-09=00=00/Divecomputer', state: 'new' },
    { path: '2022/05/01-Sun-09=00=00/Dive-2', state: 'deleted' },
    { path: '2022/05/01-Sun-09=00=00/Divecomputer', state: 'deleted' },
    { path: '2022/04/24-Sun-10=30=00/Dive-1', state: 'modified' },
    // renumbered: the file is renamed, not a removal
    { path: '2022/06/01-Wed-10=00=00/Dive-4', state: 'deleted' },
    { path: '2022/06/01-Wed-10=00=00/Dive-5', state: 'new' },
    // moved into a trip: same start time, other folder
    { path: '2022/07/02-Sat-10=00=00/Dive-6', state: 'deleted' },
    { path: '2022/07/01-Trip~ab/02-Sat-10=00=00/Dive-6', state: 'new' },
    { path: '01-Divesites/Site-0000aaaa', state: 'modified' },
    { path: '01-Divesites/Site-0000bbbb', state: 'new' },
  ]);
  const kinds = Object.fromEntries(sum.dives.map((d) => [d.key, d.kind]));
  assert.deepEqual(kinds, {
    '2022-04-24 10:30:00': 'modified',
    '2022-05-01 09:00:00': 'removed',
    '2022-05-08 09:00:00': 'added',
    '2022-06-01 10:00:00': 'modified',
    '2022-07-02 10:00:00': 'modified',
  });
  const renumbered = sum.dives.find((d) => d.key === '2022-06-01 10:00:00');
  assert.equal(renumbered.number, 5);
  assert.equal(renumbered.oldNumber, 4);
  assert.deepEqual(sum.sites, { added: 1, removed: 0, modified: 1 });
});

test('a dive file is read line by line, with quoted values that run over lines', () => {
  const f = parseDiveFile('duration 30:00 min\nbuddy "Michael"\nnotes "a\nb"\ncylinder vol=11l\ncylinder vol=7l\ndivesiteid 0000aaaa\n');
  assert.equal(f.duration, '30:00 min');
  assert.equal(f.buddy, 'Michael');
  assert.equal(f.notes, 'a\nb');
  assert.equal(f.cylinder, 'vol=11l\nvol=7l');
  assert.equal(f.divesiteid, '0000aaaa');
});

test('what a sync changed in a dive is said field by field', () => {
  const sites = (id) => ({ aaaa: 'Site à préciser', bbbb: 'Northern Arch' })[id] ?? '';
  const changes = diveFieldChanges(
    { dive: 'duration 30:00 min\nbuddy ""\ndivesiteid aaaa\n', computer: 'model "X"\n', sites },
    { dive: 'duration 30:00 min\nbuddy "Michael"\ndivesiteid bbbb\nrating 4\n', computer: 'model "X"\n', sites },
  );
  assert.deepEqual(changes, [
    { key: 'site', from: 'Site à préciser', to: 'Northern Arch' },
    { key: 'buddy', from: '', to: 'Michael' },
    { key: 'rating', from: '', to: '4' },
  ]);
  assert.deepEqual(diveFieldChanges({ dive: 'duration 1:00 min\n', computer: 'a', sites }, { dive: 'duration 1:00 min\n', computer: 'b', sites }), [{ key: 'profile', from: '', to: '' }]);
  assert.equal(computerModel('model "Shearwater Perdix 2"\nmaxdepth 10m\n'), 'Shearwater Perdix 2');
  assert.equal(computerModel('model "manually added dive"\n'), '');
  assert.equal(keyOfDate('2026-12-01T10:00:00'), '2026-12-01 10:00:00');
});

/** A logbook with four syncs: three dives, then one more with a site and a buddy, a deletion, and a new dive. */
function makeLogbook() {
  const lb = new GitLogbook();
  const dive = (n, extra = '') => `duration ${30 + n}:00 min\nbuddy ""\nsuit ""\nnotes ""\n${extra}`;
  const computer = (model) => `model "${model}"\nmaxdepth 12.0m\n  0:00 0.0m\n`;
  const v1 = lb.commit({
    '00-Subsurface': 'version 3\nunits METRIC\n',
    '01-Divesites/Site-0000aaaa': 'name "Site à préciser"\n',
    '2022/04/24-Sun-10=30=00/Dive-1': dive(1, 'divesiteid 0000aaaa\n'),
    '2022/04/24-Sun-10=30=00/Divecomputer': computer('Shearwater Perdix 2'),
    '2022/05/01-Sun-09=00=00/Dive-2': dive(2),
    '2022/05/01-Sun-09=00=00/Divecomputer': computer('manually added dive'),
  });
  const v2 = lb.commit({
    '01-Divesites/Site-0000bbbb': 'name "Northern Arch"\n',
    '2022/04/24-Sun-10=30=00/Dive-1': dive(1, 'divesiteid 0000bbbb\n').replace('buddy ""', 'buddy "Michael"'),
    '2022/05/08-Sun-09=00=00/Dive-3': dive(3),
    '2022/05/08-Sun-09=00=00/Divecomputer': computer('manually added dive'),
  });
  const v3 = lb.commit({ '2022/05/01-Sun-09=00=00': null });
  const v4 = lb.commit({
    '2022/05/15-Sun-09=00=00/Dive-4': dive(4),
    '2022/05/15-Sun-09=00=00/Divecomputer': computer('manually added dive'),
  });
  return { lb, v1, v2, v3, v4 };
}

test('the versions are listed newest first with their counts and what changed since', async () => {
  const { lb, v1, v2, v3, v4 } = makeLogbook();
  try {
    const { versions, more, head } = await listVersions(lb, { limit: 10 });
    assert.equal(head, v4);
    assert.equal(more, false);
    assert.deepEqual(versions.map((v) => v.id), [v4, v3, v2, v1]);
    assert.deepEqual(versions.map((v) => v.counts.dives), [3, 2, 3, 2]);
    assert.deepEqual(versions.map((v) => v.counts.sites), [2, 2, 2, 1]);
    assert.deepEqual(versions.map((v) => v.current), [true, false, false, false]);
    assert.equal(versions[0].since, null);
    assert.deepEqual(versions[1].since, { added: 1, removed: 0, modified: 0, sites: 0 });
    // v2 to now: dive 2 is gone, dive 4 is new
    assert.deepEqual(versions[2].since, { added: 1, removed: 1, modified: 0, sites: 0 });
    // v1 to now: dive 1 changed, dives 3 and 4 added, dive 2 removed, one site added
    assert.deepEqual(versions[3].since, { added: 2, removed: 1, modified: 1, sites: 1 });
    const page = await listVersions(lb, { skip: 2, limit: 1 });
    assert.deepEqual(page.versions.map((v) => v.id), [v2]);
    assert.equal(page.more, true);
  } finally {
    lb.dispose();
  }
});

test('a version shows its content and what restoring it would change', async () => {
  const { lb, v1, v2 } = makeLogbook();
  try {
    const d = await versionDetail(lb, v2);
    assert.deepEqual(d.counts, { dives: 3, sites: 2, pieces: null });
    assert.deepEqual(d.added.map((x) => x.number), [4]);
    assert.deepEqual(d.removed.map((x) => x.number), [2]);
    assert.equal(d.modifiedTotal, 0);
    const first = await versionDetail(lb, v1);
    assert.deepEqual(first.added.map((x) => x.number), [3, 4]);
    assert.equal(first.modifiedTotal, 1);
    // Restoring v1 puts the old site and no buddy back.
    assert.deepEqual(first.modified[0].changes, [
      { key: 'site', from: 'Northern Arch', to: 'Site à préciser' },
      { key: 'buddy', from: 'Michael', to: '' },
    ]);
    assert.equal(first.modified[0].number, 1);
    assert.deepEqual(first.sites, { added: 1, removed: 0, modified: 0 });
    // The current version has no difference.
    const now = await versionDetail(lb, lb.head());
    assert.deepEqual([now.added.length, now.removed.length, now.modifiedTotal], [0, 0, 0]);
  } finally {
    lb.dispose();
  }
});

test('three syncs: the middle version restores as a new commit, and the newest can be restored back', async () => {
  const { lb, v1, v2, v3, v4 } = makeLogbook();
  try {
    const before = lb.git('rev-list', '--count', 'HEAD').trim();
    const restored = await restoreVersion(lb, v2, '15 novembre');
    assert.ok(restored.commit);
    assert.equal(lb.git('rev-list', '--count', 'HEAD').trim(), String(Number(before) + 1));
    assert.equal(lb.git('rev-parse', 'HEAD^{tree}').trim(), lb.git('rev-parse', `${v2}^{tree}`).trim());
    const after = await listVersions(lb, { limit: 10 });
    assert.equal(after.versions.length, 5);
    assert.equal(after.versions[0].id, restored.commit);
    assert.equal(after.versions[0].counts.dives, 3);
    // Every earlier version is still listed, the newest included, and restores back.
    assert.deepEqual(after.versions.slice(1).map((v) => v.id), [v4, v3, v2, v1]);
    const back = await restoreVersion(lb, v4);
    assert.ok(back.commit);
    assert.equal(lb.git('rev-parse', 'HEAD^{tree}').trim(), lb.git('rev-parse', `${v4}^{tree}`).trim());
    for (const c of [v1, v2, v3, v4]) lb.git('merge-base', '--is-ancestor', c, 'HEAD');
    // What is current restores to nothing.
    assert.equal((await restoreVersion(lb, lb.head())).commit, null);
  } finally {
    lb.dispose();
  }
});

test('the versions of one dive say what each sync changed; restoring changes that dive only', async () => {
  const { lb, v1, v2, v4 } = makeLogbook();
  try {
    const versions = await diveVersions(lb, '2022-04-24 10:30:00');
    assert.deepEqual(versions.map((v) => [v.id, v.state]), [[v2, 'modified'], [v1, 'new']]);
    assert.equal(versions[0].current, true);
    assert.equal(versions[1].current, false);
    assert.deepEqual(versions[0].changes, [
      { key: 'site', from: 'Site à préciser', to: 'Northern Arch' },
      { key: 'buddy', from: '', to: 'Michael' },
    ]);
    assert.equal(versions[1].computer, 'Shearwater Perdix 2');
    const typed = await diveVersions(lb, '2022-05-08 09:00:00');
    assert.equal(typed[0].computer, '');
    const r = await restoreDive(lb, { commit: v1, dir: versions[1].dir, key: '2022-04-24 10:30:00' });
    assert.ok(r.commit);
    // Only that dive changed: dive 4 and the new site are still there.
    assert.match(lb.readNow('2022/04/24-Sun-10=30=00/Dive-1'), /divesiteid 0000aaaa/);
    assert.ok(lb.files().includes('2022/05/15-Sun-09=00=00/Dive-4'));
    assert.ok(lb.files().includes('01-Divesites/Site-0000bbbb'));
    assert.equal(lb.git('diff', '--name-only', v4, 'HEAD').trim(), '2022/04/24-Sun-10=30=00/Dive-1');
    // The version the diver restored from is listed as the newest entry now, and the one before is still there.
    const again = await diveVersions(lb, '2022-04-24 10:30:00');
    assert.equal(again.length, 3);
    assert.equal(again[0].state, 'modified');
  } finally {
    lb.dispose();
  }
});

test('a deleted dive carries what identifies it: duration, depth, mode and computer', async () => {
  const lb = new GitLogbook();
  try {
    const dir = '2026/09/13-Sun-09=15=48';
    lb.commit({ [`${dir}/Dive`]: 'duration 1:45 min\nnotrip\n', [`${dir}/Divecomputer`]: 'model "Shearwater Petrel 3"\ndctype CCR\nmaxdepth 2.377m\n' });
    lb.commit({ [dir]: null });
    const [d] = await deletedDives(lb);
    assert.equal(d.number, null);
    assert.equal(d.durationSeconds, 105);
    assert.equal(d.maxDepthMm, 2377);
    assert.equal(d.mode, 'CCR');
    assert.equal(d.computer, 'Shearwater Petrel 3');
  } finally {
    lb.dispose();
  }
});

test('a deleted dive is listed from the history and restored alone', async () => {
  const { lb, v2, v3, v4 } = makeLogbook();
  try {
    const gone = await deletedDives(lb);
    assert.equal(gone.length, 1);
    assert.equal(gone[0].key, '2022-05-01 09:00:00');
    assert.equal(gone[0].number, 2);
    assert.equal(gone[0].commit, v2);
    assert.equal(gone[0].deletedAt > 0, true);
    const r = await restoreDive(lb, { commit: gone[0].commit, dir: gone[0].dir, key: gone[0].key });
    assert.ok(r.commit);
    assert.ok(lb.files().includes('2022/05/01-Sun-09=00=00/Dive-2'));
    assert.deepEqual(lb.git('diff', '--name-only', v4, 'HEAD').trim().split('\n'), ['2022/05/01-Sun-09=00=00/Dive-2', '2022/05/01-Sun-09=00=00/Divecomputer']);
    // It is back: no longer listed as deleted.
    assert.deepEqual(await deletedDives(lb), []);
    assert.equal((await divesAt(lb, lb.head())).size, 4);
    assert.ok(v3);
  } finally {
    lb.dispose();
  }
});

test('a dive deleted long ago stays recoverable, past the first page of the history', async () => {
  const lb = new GitLogbook();
  try {
    const dive = 'duration 30:00 min\nbuddy ""\n';
    lb.commit({ '2020/01/05-Sun-10=00=00/Dive-1': dive, '2020/01/05-Sun-10=00=00/Divecomputer': 'model "X"\n' });
    const last = lb.commit({ '2020/01/05-Sun-10=00=00': null });
    for (let i = 0; i < 25; i++) lb.commit({ [`2021/03/${String(i + 1).padStart(2, '0')}-Mon-10=00=00/Dive-${i + 2}`]: dive });
    const gone = await deletedDives(lb, { pageSize: 7 });
    assert.deepEqual(gone.map((d) => d.key), ['2020-01-05 10:00:00']);
    assert.ok(last);
    assert.ok((await restoreDive(lb, { commit: gone[0].commit, dir: gone[0].dir, key: gone[0].key })).commit);
    assert.ok(lb.files().includes('2020/01/05-Sun-10=00=00/Dive-1'));
  } finally {
    lb.dispose();
  }
});
