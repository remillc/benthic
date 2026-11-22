// Synthetic Benthic logbook (docs/architecture.md, section 11.3), written with the app's own writer.
// Pure and deterministic: runs in Node and in the browser (bundled by esbuild).
import { diveFile, profileFile, siteFile, tripFile, markerFile, stableJson, divePath, profilePath, sitePath, tripPath, MARKER_PATH } from '../../app/src/lib/server-logbook-format.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A UUID-v4-shaped id from the generator, so the same seed gives the same paths. */
function uuid(r) {
  const h = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
  h[12] = '4';
  h[16] = '89ab'[Math.floor(r() * 4)];
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Samples every 4 s, 45-70 min: descent, plateau with relief, ascent, safety stop. */
function samples(r, durationSeconds, maxDepthMm) {
  const n = Math.floor(durationSeconds / 4) + 1;
  const timeSeconds = new Array(n), depthMm = new Array(n), temperatureMk = new Array(n), ceilingMm = new Array(n);
  const descent = Math.max(60, Math.round(maxDepthMm / 1000 / 0.3)); // 18 m/min
  let wave = 0;
  for (let i = 0; i < n; i++) {
    const t = i * 4;
    let d;
    const left = durationSeconds - t;
    if (t < descent) d = (maxDepthMm * t) / descent;
    else if (left < 180) d = left > 120 ? 5000 : (5000 * left) / 120;
    else if (left < 480) d = 5000 + ((maxDepthMm * 0.5 - 5000) * (left - 180)) / 300;
    else {
      wave += (r() - 0.5) * 900;
      wave *= 0.97;
      d = maxDepthMm * (0.75 + 0.25 * Math.sin(t / 420)) + wave;
    }
    d = Math.max(0, Math.min(maxDepthMm, Math.round(d / 10) * 10));
    timeSeconds[i] = t;
    depthMm[i] = d;
    temperatureMk[i] = 291150 + Math.round(r() * 3) * 100 - Math.round(d / 4000) * 100;
    ceilingMm[i] = 0;
  }
  return { timeSeconds, depthMm, temperatureMk, ceilingMm, ppo2Mbar: [], cylinder: [] };
}

const BUDDIES = ['Anna', 'Marc', 'Léa', 'Tom', 'Sofia', 'Jun', 'Ravi', 'Eve'];
const SUITS = ['3 mm', '5 mm', '7 mm', 'Drysuit'];

/**
 * @param {number} nDives
 * @param {{ sites?: number, trips?: number, gear?: number, kits?: number, seed?: number }} [o]
 * @returns {{ files: Map<string, string>, diveIds: string[], gearIds: string[] }}
 */
export function makeLogbook(nDives, o = {}) {
  const r = rng(o.seed ?? 42);
  const nSites = o.sites ?? 300, nTrips = o.trips ?? 50, nGear = o.gear ?? 40, nKits = o.kits ?? 3;
  const now = '2026-11-18T12:00:00.000Z';
  const files = new Map();
  files.set(MARKER_PATH, stableJson(markerFile({ name: 'Spike logbook', now })));
  const siteIds = [], tripIds = [], gearIds = [], diveIds = [];
  const sites = [], trips = [];
  for (let i = 0; i < nSites; i++) {
    const id = uuid(r);
    siteIds.push(id);
    const s = { site: `Site ${i} reef`, siteCoordinates: { latUdeg: Math.round((r() - 0.5) * 120e6), lonUdeg: Math.round((r() - 0.5) * 340e6) }, siteLocation: { city: `City ${i % 40}`, region: `Region ${i % 12}`, country: `Country ${i % 9}` } };
    sites.push(s);
    files.set(sitePath(id), stableJson(siteFile(s, id, now)));
  }
  for (let i = 0; i < nTrips; i++) {
    const id = uuid(r);
    tripIds.push(id);
    trips.push({ location: `Trip ${i}`, autogen: false });
    files.set(tripPath(id), stableJson(tripFile(trips[i], id, now)));
  }
  const types = ['regulator', 'bcd', 'suit', 'cylinder', 'computer', 'mask', 'fins', 'torch'];
  for (let i = 0; i < nGear; i++) {
    const id = uuid(r);
    gearIds.push(id);
    files.set(`gear/${id}.json`, stableJson({ format: 1, id, createdAt: now, updatedAt: now, type: types[i % types.length], name: `Gear ${i}`, brand: `Brand ${i % 7}`, model: `M${i}`, serial: `SN${100000 + i}`, purchasedOn: '2024-05-01', tags: i % 3 ? ['travel'] : [], retired: false }));
  }
  for (let i = 0; i < nKits; i++) {
    const id = uuid(r);
    files.set(`kits/${id}.json`, stableJson({ format: 1, id, createdAt: now, updatedAt: now, name: `Kit ${i}`, gearIds: gearIds.slice(i * 8, i * 8 + 10) }));
  }
  const t0 = Date.UTC(2015, 0, 1);
  for (let i = 0; i < nDives; i++) {
    const id = uuid(r);
    diveIds.push(id);
    const dur = 2700 + Math.floor(r() * 1500) + (r() < 0.2 ? 0 : 0);
    const depth = 8000 + Math.floor(r() * 32000);
    const si = Math.floor(r() * nSites), ti = r() < 0.6 ? Math.floor(r() * nTrips) : -1;
    const detail = {
      number: i + 1, date: new Date(t0 + i * 3 * 86400000 / 2).toISOString().slice(0, 19), durationSeconds: dur, maxDepthMm: depth, meanDepthMm: Math.round(depth * 0.6),
      divemode: 'OC', manual: false, invalid: false, waterTempMk: 291150, airTempMk: 296150, userSalinity: 0, surfacePressureMbar: 1013, rating: 1 + Math.floor(r() * 5), visibility: 1 + Math.floor(r() * 5),
      conditions: { wavesize: 0, current: 1, surge: 0, chill: 1 }, buddies: [BUDDIES[Math.floor(r() * 8)]], guides: [], suit: SUITS[Math.floor(r() * 4)], tags: r() < 0.3 ? ['night'] : [],
      weights: [{ grams: 6000, description: 'belt' }], notes: r() < 0.5 ? '' : `Good visibility, saw ${Math.floor(r() * 20)} turtles and a ray near the wall.`,
      cylinders: [{ description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 200000, endMbar: 40000 + Math.floor(r() * 60000), o2Permille: 210, hePermille: 0, use: 'OC-gas', depthMm: 0 }],
      events: [{ type: 'gaschange', timeSeconds: 1200, cylinder: 0 }], diveComputers: [{ model: 'Shearwater Perdix', serial: 'A1B2C3', nickname: '', divemode: 'OC' }],
      samples: samples(r, dur, depth), site: sites[si].site, siteCoordinates: sites[si].siteCoordinates, siteLocation: sites[si].siteLocation, trip: ti >= 0 ? trips[ti] : null,
    };
    const ids = { id, siteId: siteIds[si], tripId: ti >= 0 ? tripIds[ti] : null };
    files.set(divePath(id), stableJson(diveFile(detail, ids, now)));
    files.set(profilePath(id), stableJson(profileFile(detail, id)));
  }
  return { files, diveIds, gearIds };
}

/** Edits one dive's notes and rating, like the app does for a validated action (keeps unknown keys). */
export function editDive(text, n) {
  const j = JSON.parse(text);
  j.notes = `Edited ${n}`;
  j.rating = ((j.rating ?? 0) % 5) + 1;
  j.updatedAt = new Date(Date.UTC(2026, 10, 19, 0, 0, n)).toISOString();
  return stableJson(j);
}
export function editGear(text, n) {
  const j = JSON.parse(text);
  j.serial = `SN-edit-${n}`;
  j.updatedAt = new Date(Date.UTC(2026, 10, 19, 0, 0, n)).toISOString();
  return stableJson(j);
}
export { stableJson, divePath };
