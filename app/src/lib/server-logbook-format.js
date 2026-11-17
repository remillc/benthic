// @ts-check
// Writing a logbook in OpenDives' own format (docs/architecture.md, section 11.3): the files of the marker, the dives,
// their profiles, the sites and the trips, built from what the core returns for a dive (`DiveDetail`). Pure: nothing
// here talks to the network or to the core. JavaScript first (AGENTS.md): the core only gives the dives as JSON.
//
// What is written:
//   opendives.json                      the marker (format, kind, minReader, createdAt, name)
//   dives/<id[0:2]>/<id>/dive.json      everything the diver can edit, in the core's units
//   dives/<id[0:2]>/<id>/profile.json   the profile, columnar
//   sites/<id>.json, trips/<id>.json
// The values the core computes (cns, otu, sacMlMin, gasUsedMl, switchDepthMm, waterType) are never stored: they are
// recomputed on load. Ids are random UUIDs version 4, made once and kept by the caller (lib/server-upload.js) so that
// a resumed upload names the same files.

/** The format this app writes, and the lowest app format that may write the logbook. */
export const FORMAT = 1;

/**
 * JSON with sorted keys, two-space indent and a final newline: equal data gives equal files and text diffs stay readable
 * (section 11.3, « Layout »). Arrays keep their order.
 * @param {unknown} value
 * @returns {string}
 */
export function stableJson(value) {
  /** @param {any} v @returns {any} */
  const sorted = (v) => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
    return v;
  };
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

/**
 * A random UUID version 4. The platform's generator when there is one, else the random bytes of `crypto`.
 * @returns {string}
 */
export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** @param {string} id @returns {string} */
export const divePath = (id) => `dives/${id.slice(0, 2)}/${id}/dive.json`;
/** @param {string} id @returns {string} */
export const profilePath = (id) => `dives/${id.slice(0, 2)}/${id}/profile.json`;
/** @param {string} id @returns {string} */
export const sitePath = (id) => `sites/${id}.json`;
/** @param {string} id @returns {string} */
export const tripPath = (id) => `trips/${id}.json`;
/** The marker; it is written last, so that a logbook with a marker is a complete one. */
export const MARKER_PATH = 'opendives.json';

/**
 * @param {{ name: string, now: string }} options
 * @returns {Record<string, unknown>}
 */
export function markerFile({ name, now }) {
  return { format: FORMAT, kind: 'opendives-logbook', minReader: FORMAT, createdAt: now, name };
}

/**
 * What identifies a dive across two loads of the logbook, so that a resumed upload finds it again: the core's
 * identifiers change on every load, the date, the duration, the depth and the number do not.
 * @param {{ date: string, durationSeconds: number, maxDepthMm: number, number: number }} dive
 * @returns {string}
 */
export function diveKey(dive) {
  return `${dive.date}|${dive.durationSeconds}|${dive.maxDepthMm}|${dive.number}`;
}

/** @param {string} name @returns {string} */
export const siteKey = (name) => `site|${name}`;

/**
 * A trip is told apart by its name and the first of its dives (its own id changes on every load).
 * @param {string} location @param {string} firstDate
 * @returns {string}
 */
export const tripKey = (location, firstDate) => `trip|${location}|${firstDate}`;

/**
 * The keys of a list of dives, made unique: two dives with the same key (the same minute, the same depth, the same
 * number) get a suffix, in the order of the list.
 * @param {{ date: string, durationSeconds: number, maxDepthMm: number, number: number }[]} dives
 * @returns {string[]}
 */
export function uniqueKeys(dives) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return dives.map((d) => {
    const key = diveKey(d);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n ? `${key}#${n}` : key;
  });
}

/**
 * @typedef {Object} DiveIds
 * @property {string} id
 * @property {string|null} siteId
 * @property {string|null} tripId
 */

/**
 * `dive.json` from a dive of the core.
 * @param {import('opendives-core').DiveDetail} d
 * @param {DiveIds} ids
 * @param {string} now ISO time of the upload
 * @returns {Record<string, unknown>}
 */
export function diveFile(d, ids, now) {
  /** @type {Record<string, unknown>} */
  const file = {
    format: FORMAT,
    id: ids.id,
    createdAt: now,
    updatedAt: now,
    number: d.number,
    start: d.date,
    durationSeconds: d.durationSeconds,
    maxDepthMm: d.maxDepthMm,
    meanDepthMm: d.meanDepthMm,
    siteId: ids.siteId,
    tripId: ids.tripId,
    divemode: d.divemode,
    manual: d.manual,
    invalid: d.invalid,
    waterTempMk: d.waterTempMk,
    airTempMk: d.airTempMk,
    userSalinity: d.userSalinity,
    surfacePressureMbar: d.surfacePressureMbar,
    rating: d.rating,
    visibility: d.visibility,
    conditions: { ...d.conditions },
    buddies: [...d.buddies],
    guides: [...d.guides],
    suit: d.suit,
    tags: [...d.tags],
    weights: d.weights.map((w) => ({ grams: w.grams, description: w.description })),
    notes: d.notes,
    cylinders: d.cylinders.map((c) => ({
      gearId: null,
      description: c.description,
      sizeMl: c.sizeMl,
      workingPressureMbar: c.workingPressureMbar,
      startMbar: c.startMbar,
      endMbar: c.endMbar,
      o2Permille: c.o2Permille,
      hePermille: c.hePermille,
      use: c.use,
      depthMm: c.depthMm,
    })),
    events: d.events.map((e) => ({ type: e.type, timeSeconds: e.timeSeconds, cylinder: e.cylinder })),
    computers: d.diveComputers.map((c) => ({ model: c.model, serial: c.serial, nickname: c.nickname, divemode: c.divemode })),
    origin: { source: 'subsurface', importedAt: now, extra: {} },
  };
  return file;
}

/**
 * `profile.json`: the samples of the first computer, columnar. Absent columns (a dive without temperature or ceiling)
 * are left out.
 * @param {import('opendives-core').DiveDetail} d
 * @param {string} diveId
 * @returns {Record<string, unknown>}
 */
export function profileFile(d, diveId) {
  const s = d.samples;
  /** @type {Record<string, unknown>} */
  const computer = { index: 0, timeSeconds: [...s.timeSeconds], depthMm: [...s.depthMm] };
  if (s.ppo2Mbar?.length) computer.ppo2Mbar = [...s.ppo2Mbar];
  if (s.temperatureMk) computer.temperatureMk = [...s.temperatureMk];
  if (s.ceilingMm) computer.ceilingMm = [...s.ceilingMm];
  if (s.cylinder?.length) computer.cylinder = [...s.cylinder];
  return { format: FORMAT, diveId, computers: [computer] };
}

/**
 * `sites/<id>.json` from the first dive that names the site.
 * @param {import('opendives-core').DiveDetail} d
 * @param {string} id
 * @param {string} now
 * @returns {Record<string, unknown>}
 */
export function siteFile(d, id, now) {
  /** @type {Record<string, unknown>} */
  const file = { format: FORMAT, id, createdAt: now, updatedAt: now, name: d.site };
  if (d.siteCoordinates) Object.assign(file, { latUdeg: d.siteCoordinates.latUdeg, lonUdeg: d.siteCoordinates.lonUdeg });
  const loc = d.siteLocation;
  if (loc && (loc.city || loc.region || loc.country)) file.location = { city: loc.city, region: loc.region, country: loc.country };
  return file;
}

/**
 * @param {{ location: string, autogen: boolean }} trip
 * @param {string} id
 * @param {string} now
 * @returns {Record<string, unknown>}
 */
export function tripFile(trip, id, now) {
  return { format: FORMAT, id, createdAt: now, updatedAt: now, name: trip.location, autogenerated: trip.autogen };
}

/**
 * The files of one dive, with the site and the trip it needs when they are not on the server yet.
 * @param {{
 *   detail: import('opendives-core').DiveDetail,
 *   ids: DiveIds,
 *   now: string,
 *   writeSite: boolean,
 *   writeTrip: boolean,
 * }} options
 * @returns {{ path: string, text: string }[]}
 */
export function filesOfDive({ detail, ids, now, writeSite, writeTrip }) {
  /** @type {{ path: string, text: string }[]} */
  const files = [];
  if (writeSite && ids.siteId) files.push({ path: sitePath(ids.siteId), text: stableJson(siteFile(detail, ids.siteId, now)) });
  if (writeTrip && ids.tripId && detail.trip) files.push({ path: tripPath(ids.tripId), text: stableJson(tripFile(detail.trip, ids.tripId, now)) });
  files.push({ path: divePath(ids.id), text: stableJson(diveFile(detail, ids, now)) });
  files.push({ path: profilePath(ids.id), text: stableJson(profileFile(detail, ids.id)) });
  return files;
}
