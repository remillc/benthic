// The dives as divelogs.de takes them (task 2026-11-23-337): app/src/lib/divelogs-format.js against libxslt.
// tests/data/divelogs/*.json were made by tests/divelogs_oracle.py, which applies Subsurface's own stylesheets
// (divelogs-export.xslt then xml2json.xslt, as core/uploadDiveLogsDE.cpp does) to each dive of the sources below.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { divelogsBody, divelogsDives } from '../../app/src/lib/divelogs-format.js';
import { parseXml } from '../../app/src/lib/xml-light.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const gold = `${here}../data/divelogs`;
const sources = `${here}../../third_party/subsurface/dives`;

for (const file of readdirSync(gold).filter((f) => f.endsWith('.json'))) {
  const name = file.replace(/\.json$/, '');
  const source = existsSync(`${gold}/${name}`) ? `${gold}/${name}` : `${sources}/${name}`;
  test(`${file.replace(/\.json$/, '')}: every dive is what libxslt gives`, { skip: !existsSync(source) && 'Subsurface sources not checked out' }, () => {
    const expected = JSON.parse(readFileSync(`${gold}/${file}`, 'utf8'));
    const dives = divelogsDives(readFileSync(source, 'utf8'));
    assert.equal(dives.length, expected.length);
    dives.forEach((json, i) => assert.deepEqual(JSON.parse(json), expected[i], `dive ${i}`));
  });
}

test('the body is a JSON array of the dives', () => {
  assert.equal(divelogsBody(['{"a":1}', '{"b":"x"}']), '[{"a":1},{"b":"x"}]');
  assert.deepEqual(JSON.parse(divelogsBody([])), []);
});

test('a dive written by hand: place, buddy, tanks, weights, samples', () => {
  const ssrf = `<divelog><divesites><site uuid='ab12' name='France/Nice/Plage Rauba' gps='43.69 7.28'/></divesites><dives>
    <dive number='3' date='2025-06-01' time='10:15:00' duration='45:30 min' divesiteid='ab12'>
      <buddy>Ana, "Bo"</buddy><notes>Line 1
Line 2</notes>
      <cylinder size='12.0 l' workpressure='200.0 bar' description='AL80' o2='32.0%' start='200.0 bar' end='60.0 bar' />
      <weightsystem weight='4.0 kg' description='belt' /><weightsystem weight='2.5 kg' description='ankle' />
      <divecomputer model='Test'><depth max='30.5 m' mean='15.2 m'/><temperature water='18.0 C'/>
        <sample time='0:00 min' depth='0.0 m'/><sample time='0:10 min' depth='3.2 m' temp='18.0 C'/>
      </divecomputer>
    </dive></dives></divelog>`;
  const [json] = divelogsDives(ssrf);
  const dive = JSON.parse(json);
  assert.equal(dive.divesite, 'Plage Rauba');
  assert.equal(dive.location, 'France/Nice');
  assert.equal(dive.lat, 43.69);
  assert.equal(dive.lng, 7.28);
  assert.equal(dive.duration, 2730);
  assert.equal(dive.buddy, 'Ana, "Bo"');
  assert.equal(dive.notes, 'Line 1\nLine 2');
  assert.equal(dive.weights, 6.5);
  assert.equal(dive.maxdepth, 30.5);
  assert.equal(dive.depthtemp, 18);
  assert.equal(dive.samplerate, 10);
  assert.deepEqual(dive.tanks, [{ tank: 'AL80', tankname: 'AL80', dbltank: 0, vol: 12, start_pressure: 200, end_pressure: 60, wp: 200, o2: 32, he: null }]);
  assert.deepEqual(dive.sampledata, [0, { d: 3.2, t: 18 }]);
});

test('the reader keeps entities, CDATA and the attributes in order', () => {
  const root = parseXml(`<?xml version="1.0"?><a x='1 &amp; 2' y="&#233;"><!-- c --><b><![CDATA[<raw>]]></b><c/></a>`);
  assert.deepEqual(root.attrs, [['x', '1 & 2'], ['y', 'é']]);
  assert.equal(root.children.length, 2);
  assert.throws(() => parseXml('<a><b></a>'));
});
