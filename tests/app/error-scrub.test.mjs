import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, scrubRoute, scrubLines } from '../../app/src/lib/error-scrub.js';

test('e-mail addresses go', () => {
  assert.equal(scrub('failed for jean.dupont+log@example.co.uk now'), 'failed for [email] now');
  assert.equal(scrub('essai-ab12@benthic.test'), '[email]');
});

test('tokens, secrets and credentials go', () => {
  assert.equal(scrub('Authorization: Bearer abc123def456ghi789'), 'Authorization: [token]');
  assert.equal(scrub('Authorization: Basic YWRtaW46c2VjcmV0'), 'Authorization: [token]');
  assert.equal(scrub('sessionToken=9f8e7d6c5b4a'), 'sessionToken=[token]');
  assert.equal(scrub('{"password": "hunter2", "ok": 1}'), '{"password": [token], "ok": 1}');
  assert.equal(scrub('git clone https://alice:s3cret@git.example.org/alice/logbook.git'), 'git clone https://[credentials]@git.example.org/alice/logbook.git');
  assert.equal(scrub('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVP'), '[token]');
  assert.equal(scrub('key 3f2a9c1d8b7e6f5a4d3c2b1a0f9e8d7c6b5a4f3e'), 'key [token]');
  assert.equal(scrub('id Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo'), 'id [token]');
});

test('coordinates go, versions and line numbers stay', () => {
  assert.equal(scrub('site at 43.296482, 5.369780'), 'site at [coordinate], [coordinate]');
  assert.equal(scrub('lat: 43.3 lon=-5.4'), 'lat: [coordinate] lon=[coordinate]');
  assert.equal(scrub('latitude":"43.29"'), 'latitude":[coordinate]');
  assert.equal(scrub('43°17\'46"N'), '[coordinate]');
  assert.equal(scrub('-122.419416'), '[coordinate]');
  assert.equal(scrub('Benthic 0.3.0 on Chrome/120.0.6099.109 at app.js:1234:56'), 'Benthic 0.3.0 on Chrome/120.0.6099.109 at app.js:1234:56');
  assert.equal(scrub('depth 18.5 m'), 'depth 18.5 m');
});

test('home folders lose the user name', () => {
  assert.equal(scrub('C:\\Users\\chris\\AppData\\Local\\x.json'), 'C:\\Users\\[user]\\AppData\\Local\\x.json');
  assert.equal(scrub('file:///C:/Users/chris/x'), 'file:///C:/Users/[user]/x');
  assert.equal(scrub('/Users/marie/Library/x'), '/Users/[user]/Library/x');
  assert.equal(scrub('at /home/bob/.config/benthic/log'), 'at /home/[user]/.config/benthic/log');
  assert.equal(scrub('/storage/emulated/0/Download/x.ssrf'), '/storage/emulated/[user]/Download/x.ssrf');
});

test('a route keeps its path only', () => {
  assert.equal(scrubRoute('/dive/42?q=alice@example.org#top'), '/dive/42');
  assert.equal(scrubRoute(undefined), '');
});

test('text is cut and lines are scrubbed one by one', () => {
  assert.ok(scrub('a'.repeat(500), 100).length <= 101);
  assert.deepEqual(scrubLines(['x@y.org', 'ok']), ['[email]', 'ok']);
  assert.equal(scrub(undefined), '');
});
