// SPDX-License-Identifier: GPL-2.0
// @ts-check
// The dives as divelogs.de takes them (task 2026-11-23-337): a port to JavaScript of the two stylesheets Subsurface applies
// before its upload (third_party/subsurface/xslt/divelogs-export.xslt, then xml2json.xslt; core/uploadDiveLogsDE.cpp,
// prepareDives). The input is the .ssrf text the core exports for the dives (`exportDives`, format ssrf); the output is,
// for each dive, the JSON text Subsurface would send. The port keeps the stylesheets' quirks (XPath number printing,
// `format-number`, the first node of a node-set, the JSON typing of text by xml2json) so that the result is the same;
// tests/app/divelogs-format.test.mjs compares it with libxslt's output on a set of dives (tests/data/divelogs/).
//
// Where Subsurface's own behaviour depends on its settings, the default is used: the geocoding categories are none
// (`geocoding_prefs_t`), so no `geo` element reaches the stylesheet and the place is the dive site's name split at its last
// slash; the units of the file are always metric (the .ssrf format), which is what the stylesheet reads.
import { parseXml, attr, elements, textOf } from './xml-light.js';

/** @typedef {import('./xml-light.js').XmlElement} XmlElement */
/** @typedef {{ name: string, arr?: boolean, kids: (Out|string)[] }} Out */

// --- XPath 1.0 numbers and strings as libxml2 and libxslt give them -----------------------------------------------------

/** `number(string)`: optional blanks, optional minus, digits with an optional fraction; else NaN. @param {string} s */
function num(s) {
  return /^[ \t\r\n]*-?(\d+(\.\d*)?|\.\d+)[ \t\r\n]*$/.test(s) ? Number(s) : NaN;
}

/** `string(number)`: libxml2 prints 15 significant digits, never an exponent. @param {number} n */
function xstr(n) {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n === 0 ? 0 : n);
  const abs = Math.abs(n);
  const place = Math.trunc(Math.log10(abs));
  const fraction = Math.min(100, Math.max(0, place > 0 ? 15 - place - 1 : 15 - place));
  let text = n.toFixed(fraction);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text === '-0' ? '0' : text;
}

/** A variable holding a number: the stylesheet keeps it as text, so it goes through its string form. @param {number} n */
const rt = (n) => num(xstr(n));

/** `format-number(n, '#.##')` and `'#.###'`: rounded half up to `places` digits, no trailing zeros. @param {number} n @param {number} places */
function formatNumber(n, places) {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  const scale = 10 ** places;
  const rounded = Math.floor(Math.abs(n) * scale + 0.5) / scale;
  const text = rounded.toFixed(places).replace(/0+$/, '').replace(/\.$/, '');
  return n < 0 && rounded !== 0 ? `-${text}` : text;
}

/** `substring-before` and `substring-after` of one character. @param {string} s @param {string} c */
const before = (s, c) => (s.includes(c) ? s.slice(0, s.indexOf(c)) : '');
/** @param {string} s @param {string} c */
const after = (s, c) => (s.includes(c) ? s.slice(s.indexOf(c) + c.length) : '');

/** commonTemplates.xsl `time2sec`: "12:30 min" is 750. @param {string} time */
const time2sec = (time) => rt(num(before(time, ':')) * 60 + num(before(after(time, ':'), ' ')));

/** commonTemplates.xsl `depth2mm`: "12.345 m" is 12350. @param {string} depth */
const depth2mm = (depth) => rt(num(formatNumber(num(before(depth, ' ')), 2)) * 1000);

// --- The stylesheet, one dive ---------------------------------------------------------------------------------------------

/** @param {string} name @param {(Out|string)[]} [kids] @param {boolean} [arr] @returns {Out} */
const out = (name, kids = [], arr = false) => ({ name, kids: kids.filter((k) => typeof k !== 'string' || k !== ''), ...(arr ? { arr: true } : {}) });

/**
 * The first value, in document order, of a path through the children of the dive: `node()/<child>/@<attribute>`.
 * @param {XmlElement} dive @param {string} child @param {string} attribute @returns {string|undefined}
 */
function viaChildren(dive, child, attribute) {
  for (const c of elements(dive)) {
    for (const d of elements(c, child)) {
      const v = attr(d, attribute);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

/** The first pressure sample of a cylinder's sensor (commonTemplates.xsl `tankSensorPressure`). @param {XmlElement|undefined} dc @param {number} cylinder @param {boolean} last */
function sensorPressure(dc, cylinder, last) {
  let sensor = String(cylinder);
  if (dc && elements(dc, 'tanksensormapping').length) {
    const mapping = elements(dc, 'tanksensormapping').find((m) => num(attr(m, 'cylinderindex') ?? '') === cylinder && num(attr(m, 'sensorid') ?? '') >= 0);
    sensor = mapping ? (attr(mapping, 'sensorid') ?? '') : '';
  }
  if (sensor === '' || !dc) return '';
  /** @type {string[]} */
  const found = [];
  for (const s of elements(dc, 'sample')) {
    for (const [name, value] of s.attrs) {
      if (name === `pressure${sensor}` || (name === 'pressure' && num(sensor) === 0)) found.push(value);
    }
  }
  return (last ? found[found.length - 1] : found[0]) ?? '';
}

/**
 * One dive, the stylesheet's `dive` template.
 * @param {XmlElement} dive @param {Map<string, XmlElement>} sites the dive sites by uuid
 * @returns {Out}
 */
function diveOut(dive, sites) {
  const computers = elements(dive, 'divecomputer');
  const models = computers.map((c) => attr(c, 'model')).filter((m) => m !== undefined);
  const dc = computers[0];
  const duration = time2sec(attr(dive, 'duration') ?? '');
  const site = sites.get(attr(dive, 'divesiteid') ?? '');
  const location = site ? (attr(site, 'name') ?? '') : '';
  /** @type {(Out|string)[]} */
  const kids = [out('date', [attr(dive, 'date') ?? '']), out('time', [attr(dive, 'time') ?? ''])];
  if (models.some((m) => m !== '')) kids.push(out('dc_model', [models[0] ?? '']));
  kids.push(out('duration', [xstr(duration)]));
  if (location.includes('/')) {
    const name = location.slice(location.lastIndexOf('/') + 1);
    kids.push(out('divesite', [name]));
    // substring($location, 0, string-length($location) - string-length($site)): the characters before the last slash.
    kids.push(out('location', [location.slice(0, Math.max(0, location.length - name.length - 1))]));
  } else kids.push(out('divesite', [location]));
  kids.push(out('visibility', [attr(dive, 'visibility') ?? '']));
  const buddy = elements(dive, 'buddy')[0];
  kids.push(out('buddy', [buddy ? textOf(buddy) : '']));

  const tanks = elements(dive, 'cylinder').map((cyl, index) => {
    const description = attr(cyl, 'description') ?? '';
    const size = attr(cyl, 'size') ?? '';
    const double = description.startsWith('D') && num(before(description.slice(1), ' ')) * 2 === num(before(size, ' ')) ? 2 : 1;
    const start = attr(cyl, 'start');
    const end = attr(cyl, 'end');
    const work = attr(cyl, 'workpressure');
    const o2 = attr(cyl, 'o2');
    return out('tank', [
      out('tank', [description]),
      out('tankname', [description]),
      out('dbltank', [xstr(double - 1)]),
      out('vol', [xstr(num(before(size, ' ')) / double)]),
      out('start_pressure', [before(start !== undefined && start !== '' ? start : sensorPressure(dc, index, false), ' ')]),
      out('end_pressure', [before(end !== undefined && end !== '' ? end : sensorPressure(dc, index, true), ' ')]),
      out('wp', [work !== undefined && work !== '' ? before(work, ' ') : '198']),
      out('o2', [o2 !== undefined && o2 !== '' ? before(o2, '%') : '21']),
      out('he', [before(attr(cyl, 'he') ?? '', '%')]),
    ]);
  });
  kids.push(out('tanks', tanks, true));

  // commonTemplates.xsl `sum` over the weight systems: the last value plus the running sum, '#.###'.
  const weights = elements(dive, 'weightsystem').map((w) => attr(w, 'weight')).filter((w) => w !== undefined);
  if (weights.length) {
    let sum = 0;
    for (const w of weights.slice(0, -1)) sum = num(xstr(sum + num(before(w, ' '))));
    kids.push(out('weights', [formatNumber(num(before(weights[weights.length - 1], ' ')) + sum, 3)]));
  } else kids.push(out('weights'));
  const notes = elements(dive, 'notes')[0];
  kids.push(out('notes', [notes ? textOf(notes) : '']));
  const gps = site ? (attr(site, 'gps') ?? '') : '';
  kids.push(out('lat', [before(gps, ' ')]), out('lng', [after(gps, ' ')]));
  kids.push(out('maxdepth', [before(viaChildren(dive, 'depth', 'max') ?? '', ' ')]));
  kids.push(out('meandepth', [before(viaChildren(dive, 'depth', 'mean') ?? '', ' ')]));
  // node()/temperature/@air | divetemperature/@air: the first one in the order of the file.
  const temperature = (/** @type {string} */ name) => {
    for (const c of elements(dive)) {
      if (c.name === 'divetemperature' && attr(c, name) !== undefined) return attr(c, name) ?? '';
      const t = viaChildren({ name: '', attrs: [], children: [c] }, 'temperature', name);
      if (t !== undefined) return t;
    }
    return '';
  };
  kids.push(out('airtemp', [before(temperature('air'), ' ')]), out('depthtemp', [before(temperature('water'), ' ')]));

  const manual = models.includes('manually added dive');
  const special = models.includes('Suunto EON Steel');
  /** The first sample, and the second, of the dive's children, with a time (`node()/sample[n]/@time`). @param {number} n */
  const nthSampleTime = (n) => {
    for (const c of elements(dive)) {
      const v = attr(elements(c, 'sample')[n] ?? { name: '', attrs: [], children: [] }, 'time');
      if (v !== undefined) return v;
    }
    return '';
  };
  /** @param {XmlElement} el @returns {number} */
  const countTimes = (el) => elements(el).reduce((n, c) => n + (c.name === 'sample' && attr(c, 'time') !== undefined ? 1 : 0) + countTimes(c), 0);
  if (special) kids.push(out('samplerate', [xstr(Math.ceil(duration / countTimes(dive)))]));
  else kids.push(out('samplerate', [manual ? '60' : xstr(time2sec(nthSampleTime(1)) - time2sec(nthSampleTime(0)))]));

  /** @type {Out[]} */
  const samples = [];
  const list = dc ? elements(dc, 'sample') : [];
  list.forEach((s, i) => {
    const time = attr(s, 'time');
    const previous = list[i - 1];
    if (manual && time !== undefined && time !== '0:00 min') {
      const ts = time2sec(time);
      const tf = time2sec(previous ? (attr(previous, 'time') ?? '') : '');
      const ds = depth2mm(attr(s, 'depth') ?? '');
      const df = depth2mm(previous ? (attr(previous, 'depth') ?? '') : '');
      // The recursive `while` template: one point a minute between two samples.
      const until = rt((ts - tf) / 60 - 1);
      let from = tf;
      let depth = df;
      const sample = (/** @type {number} */ d) => samples.push(out('SAMPLE', [xstr(d / 1000)]));
      let count = 0;
      for (let guard = 0; guard < 1e6; guard++) {
        const curdepth = rt(((from + 60 - from) / (ts - from)) * (ds - depth) + depth);
        const curtime = rt(from + 60);
        if (count < until) {
          sample(curdepth);
          from = curtime;
          depth = curdepth;
          count = count + 1;
        } else {
          if (curdepth > 0) sample(curdepth);
          break;
        }
      }
      return;
    }
    if (special) {
      const cur = time2sec(time ?? '');
      const prev = time2sec(previous ? (attr(previous, 'time') ?? '') : '');
      const prevprev = time2sec(list[i - 2] ? (attr(/** @type {XmlElement} */ (list[i - 2]), 'time') ?? '') : '');
      if (!(cur - prev >= 10 || prev === 0 || prevprev === 0)) return;
    }
    const temp = attr(s, 'temp');
    const depth = before(attr(s, 'depth') ?? '', ' ');
    samples.push(temp !== undefined && temp !== '' ? out('SAMPLE', [out('d', [depth]), out('t', [before(temp, ' ')])]) : out('SAMPLE', [depth]));
  });
  kids.push(out('sampledata', samples, true));
  return out('dive', kids);
}

// --- xml2json.xslt ------------------------------------------------------------------------------------------------------

/** @param {string} s */
function quote(s) {
  return `"${s.replace(/[\\"\t\n\r\u0000-\u001f]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\t': '\\t', '\n': '\\n', '\r': '\\r' })[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}

/** The templates for a text node alone in its element: a number as written, true, false, else a string. @param {string} s */
function textJson(s) {
  if (!Number.isNaN(num(s))) return s;
  if (s.replace(/[TRUE]/g, (c) => c.toLowerCase()) === 'true') return 'true';
  if (s.replace(/[FALSE]/g, (c) => c.toLowerCase()) === 'false') return 'false';
  return quote(s);
}

/** @param {Out} node */
function childrenJson(node) {
  const kids = node.kids.filter((k) => typeof k !== 'string' || k.trim() !== '');
  const elems = /** @type {Out[]} */ (kids.filter((k) => typeof k !== 'string'));
  let text = '';
  for (const k of kids) {
    if (typeof k === 'string') {
      // A text node with a sibling is ignored (mixed content).
      if (kids.length === 1) text += textJson(k);
      continue;
    }
    const at = elems.indexOf(k);
    const hasNext = at < elems.length - 1;
    const asArray = !!node.arr || (elems.length > 1 && elems.every((e) => e.name === elems[0].name));
    const content = k.kids.length === 0 || k.kids.every((x) => typeof x === 'string' && x.trim() === '');
    if (asArray) text += `${at === 0 ? '[' : ''}${content ? 'null' : childrenJson(k)}${hasNext ? ',' : ']'}`;
    else text += `${at === 0 ? '{' : ''}${quote(k.name)}:${content ? (k.arr ? '[]' : 'null') : childrenJson(k)}${hasNext ? ',' : '}'}`;
  }
  return text;
}

// --- The dives of an .ssrf text -----------------------------------------------------------------------------------------

/**
 * The dives of an .ssrf export as divelogs.de takes them.
 * @param {string} ssrf the text the core exports (`exportDives`, format ssrf)
 * @returns {string[]} one JSON object per dive, in the file's order
 */
export function divelogsDives(ssrf) {
  const log = parseXml(ssrf);
  /** @type {Map<string, XmlElement>} */
  const sites = new Map();
  for (const group of elements(log, 'divesites')) {
    for (const site of elements(group, 'site')) {
      const uuid = attr(site, 'uuid');
      if (uuid !== undefined && !sites.has(uuid)) sites.set(uuid, site);
    }
  }
  /** @type {XmlElement[]} */
  const dives = [];
  for (const group of elements(log, 'dives')) {
    for (const child of elements(group)) {
      if (child.name === 'dive') dives.push(child);
      else if (child.name === 'trip') dives.push(...elements(child, 'dive'));
    }
  }
  return dives.map((d) => childrenJson(diveOut(d, sites)));
}

/**
 * The request body Subsurface sends: a JSON array of the dives.
 * @param {string[]} dives the JSON objects of `divelogsDives`
 */
export const divelogsBody = (dives) => `[${dives.join(',')}]`;
