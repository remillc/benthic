// @ts-check
// The shared base of dive sites, « Carte commune » (task 2026-11-19-315; docs/architecture.md, section 11.10). Pure:
// the client of the server's routes (given a transport, so that node:test drives it), the list of the diver's sites
// that is sent to the base, and the texts' choices. Nothing here reads the logbook or the device: the reactive side is
// lib/shared-sites.svelte.js.
//
// What leaves the device: per site, its id in the logbook (the core's uuid, as text), name, position, country, region,
// usual depth, number of dives and of dives in the last 12 months, and the base site it was added from. Never the
// notes, the description, a buddy, a dive date or the diver's name: `contributionOf` builds each entry field by field.

import { normalizeBbox, normalizeLongitude } from './maps-logic.js';

/** The reasons of « Signaler », in the order of the dialog (the server's codes). */
export const REPORT_REASONS = /** @type {const} */ (['wrong_position', 'duplicate', 'wrong_name_or_country', 'closed_or_forbidden', 'other']);
/** @typedef {typeof REPORT_REASONS[number]} ReportReason */

/** Longest free text of a report (the server cuts there too). */
export const REPORT_DETAILS_MAX = 500;
/** Radius of the suggestion « La carte commune a déjà un site à … » when the diver places a new site, in metres. */
export const SUGGEST_RADIUS_M = 300;
/** Radius of the section « Dans la carte commune » of « Choisir un site », in metres. */
export const CHOOSE_RADIUS_M = 50000;

/**
 * A site of the base, as the server sends it (lists and card).
 * @typedef {{ id: string, name: string, lat: number, lon: number, country: string, region: string,
 *   waterType: ''|'fresh'|'salt'|'brackish', closed: boolean, dives: number|null, fewDives: boolean,
 *   distanceM?: number, redirectedFrom?: string, commonsSources?: string[],
 *   carnets?: { waterType: string, depthMm: number|null, depthRangeMm: [number, number]|null,
 *     divesLast12Months: number|null, fewDivesLast12Months: boolean } }} BaseSite
 */

export class SharedSitesError extends Error {
  /**
   * @param {string} code the server's code (`TERMS_REQUIRED`, `SUBSCRIPTION_REQUIRED`, `SITE_GONE`…), or `UNREACHABLE`
   * @param {number} status the HTTP status; 0 when the server was not reached
   * @param {number} [retryAfterSeconds]
   */
  constructor(code, status, retryAfterSeconds) {
    super(code);
    this.name = 'SharedSitesError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v : '');
const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A base site from the server's JSON; null when it is not one.
 * @param {any} r
 * @returns {BaseSite|null}
 */
export function baseSiteOf(r) {
  const lat = num(r?.lat);
  const lon = num(r?.lon);
  if (!r || (typeof r.id !== 'string' && typeof r.id !== 'number') || lat === null || lon === null) return null;
  const water = ['fresh', 'salt', 'brackish'].includes(r.waterType) ? r.waterType : '';
  /** @type {BaseSite} */
  const site = {
    id: String(r.id),
    name: text(r.name),
    lat,
    lon,
    country: text(r.country),
    region: text(r.region),
    waterType: water,
    closed: r.closed === true,
    dives: num(r.dives),
    fewDives: r.fewDives === true || num(r.dives) === null,
  };
  if (num(r.distanceM) !== null) site.distanceM = /** @type {number} */ (num(r.distanceM));
  if (r.redirectedFrom !== undefined && r.redirectedFrom !== null) site.redirectedFrom = String(r.redirectedFrom);
  if (Array.isArray(r.commonsSources)) site.commonsSources = r.commonsSources.filter((v) => typeof v === 'string');
  const c = r.carnets;
  if (c && typeof c === 'object') {
    const range = Array.isArray(c.depthRangeMm) && c.depthRangeMm.length === 2 && c.depthRangeMm.every((/** @type {unknown} */ x) => num(x) !== null) ? /** @type {[number, number]} */ ([c.depthRangeMm[0], c.depthRangeMm[1]]) : null;
    site.carnets = {
      waterType: ['fresh', 'salt', 'brackish'].includes(c.waterType) ? c.waterType : '',
      depthMm: num(c.depthMm),
      depthRangeMm: range,
      divesLast12Months: num(c.divesLast12Months),
      fewDivesLast12Months: c.fewDivesLast12Months === true || num(c.divesLast12Months) === null,
    };
  }
  return site;
}

/** @param {any} r */
function termsOf(r) {
  if (typeof r?.currentVersion !== 'string') throw new SharedSitesError('UNREACHABLE', 0);
  return {
    currentVersion: r.currentVersion,
    accepted: r.accepted === true,
    acceptedVersion: typeof r.acceptedVersion === 'string' ? r.acceptedVersion : null,
    acceptedAt: typeof r.acceptedAt === 'string' ? r.acceptedAt : null,
  };
}
/** @typedef {ReturnType<typeof termsOf>} TermsStatus */

/**
 * @param {{ baseUrl: string, transport: import('./server-api.js').ServerTransport }} options
 */
export function createSharedSitesApi({ baseUrl, transport }) {
  /**
   * @param {string} token @param {string} method @param {string} path @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async function call(token, method, path, body) {
    if (!baseUrl) throw new SharedSitesError('UNREACHABLE', 0);
    /** @type {import('./server-api.js').ServerResponse} */
    let response;
    try {
      response = await transport({ method, url: baseUrl + path, headers: { Authorization: `Bearer ${token}` }, ...(body !== undefined ? { body } : {}) });
    } catch {
      throw new SharedSitesError('UNREACHABLE', 0);
    }
    let json = null;
    try {
      json = response.text ? JSON.parse(response.text) : null;
    } catch {
      json = null;
    }
    if (response.status >= 200 && response.status < 300 && json) return json;
    const code = typeof json?.error?.code === 'string' ? json.error.code : response.status === 413 ? 'TOO_LARGE' : 'UNREACHABLE';
    const retry = num(json?.error?.retryAfterSeconds) ?? undefined;
    throw new SharedSitesError(code, response.status, retry);
  }

  const qs = (/** @type {Record<string, string|number|undefined>} */ o) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

  return {
    /** @param {string} token @returns {Promise<TermsStatus>} */
    async terms(token) {
      return termsOf(await call(token, 'GET', '/v1/sites/terms'));
    },
    /** @param {string} token @param {string} version the `currentVersion` the screen showed @returns {Promise<TermsStatus>} */
    async acceptTerms(token, version) {
      return termsOf(await call(token, 'POST', '/v1/sites/terms/accept', { version }));
    },
    /**
     * Sends the whole list of the diver's sites.
     * @param {string} token @param {ContributionSite[]} sites
     * @returns {Promise<{ links: Record<string, string>, total: number }>} links: local id → base site id
     */
    async contribute(token, sites) {
      const r = await call(token, 'PUT', '/v1/sites/contribution', { sites });
      /** @type {Record<string, string>} */
      const links = {};
      for (const s of /** @type {any[]} */ (Array.isArray(r.sites) ? r.sites : [])) if (s && s.id !== undefined && s.baseSiteId !== undefined && s.baseSiteId !== null) links[String(s.id)] = String(s.baseSiteId);
      return { links, total: num(r.total) ?? 0 };
    },
    /**
     * The base in a box of the map.
     * @param {string} token
     * @param {{ bbox: [number, number, number, number], zoom: number, limit?: number }} q west, south, east, north
     * @returns {Promise<{ mode: 'sites'|'clusters', total: number, sites: BaseSite[], clusters: { lat: number, lon: number, count: number }[] }>}
     */
    async inBox(token, { bbox, zoom, limit }) {
      const round = (/** @type {number} */ x) => Math.round(x * 1e5) / 1e5;
      const r = await call(token, 'GET', `/v1/sites/base?${qs({ bbox: normalizeBbox(bbox).map(round).join(','), zoom: Math.max(0, Math.min(22, Math.round(zoom))), limit })}`);
      return {
        mode: r.mode === 'clusters' ? 'clusters' : 'sites',
        total: num(r.total) ?? 0,
        sites: /** @type {any[]} */ (Array.isArray(r.sites) ? r.sites : []).map(baseSiteOf).filter((s) => s !== null),
        clusters: /** @type {any[]} */ (Array.isArray(r.clusters) ? r.clusters : []).filter((c) => num(c?.lat) !== null && num(c?.lon) !== null && num(c?.count) !== null).map((c) => ({ lat: c.lat, lon: c.lon, count: c.count })),
      };
    },
    /**
     * A page of all base sites in the map's box, including sites inside clusters.
     * @param {string} token
     * @param {{ bbox: [number, number, number, number], after?: string, limit?: number }} q
     * @returns {Promise<{ sites: BaseSite[], next: string|null }>}
     */
    async inBoxPage(token, { bbox, after, limit }) {
      const round = (/** @type {number} */ x) => Math.round(x * 1e5) / 1e5;
      const r = await call(token, 'GET', `/v1/sites/base/list?${qs({ bbox: bbox.map(round).join(','), after, limit })}`);
      if (!Array.isArray(r.sites) || !(r.next === null || (typeof r.next === 'string' && /^\d{1,18}$/.test(r.next))))
        throw new SharedSitesError('UNREACHABLE', 0);
      const sites = r.sites.map(baseSiteOf);
      if (sites.some((s) => !s) || (r.next !== null && (!sites.length || sites[sites.length - 1]?.id !== r.next || r.next === after)))
        throw new SharedSitesError('UNREACHABLE', 0);
      return { sites: /** @type {BaseSite[]} */ (sites), next: r.next };
    },
    /**
     * Base sites near a position, nearest first.
     * @param {string} token @param {{ lat: number, lon: number, radiusM?: number, limit?: number, q?: string }} q
     * @returns {Promise<BaseSite[]>}
     */
    async nearby(token, { lat, lon, radiusM, limit, q }) {
      const r = await call(token, 'GET', `/v1/sites/base/nearby?${qs({ lat: lat.toFixed(6), lon: normalizeLongitude(lon).toFixed(6), radiusM, limit, q: q?.trim() || undefined })}`);
      return /** @type {any[]} */ (Array.isArray(r.sites) ? r.sites : []).map(baseSiteOf).filter((s) => s !== null);
    },
    /** The card of a base site (a merged id answers the surviving site, with `redirectedFrom`). @param {string} token @param {string} id */
    async card(token, id) {
      const site = baseSiteOf(await call(token, 'GET', `/v1/sites/base/${encodeURIComponent(id)}`));
      if (!site) throw new SharedSitesError('UNREACHABLE', 0);
      return site;
    },
    /**
     * « Ajouter à mes sites »: what to copy into the logbook, and the current id to keep.
     * @param {string} token @param {string} id
     * @returns {Promise<{ baseSiteId: string, site: { name: string, lat: number, lon: number, country: string, region: string, waterType: string } }>}
     */
    async link(token, id) {
      const r = await call(token, 'POST', `/v1/sites/base/${encodeURIComponent(id)}/link`, {});
      const s = r?.site;
      if (r?.baseSiteId === undefined || num(s?.lat) === null || num(s?.lon) === null) throw new SharedSitesError('UNREACHABLE', 0);
      return { baseSiteId: String(r.baseSiteId), site: { name: text(s.name), lat: s.lat, lon: s.lon, country: text(s.country), region: text(s.region), waterType: text(s.waterType) } };
    },
    /**
     * @param {string} token @param {string} id
     * @param {{ reason: ReportReason, details?: string, position?: { lat: number, lon: number }, otherSiteId?: string }} report
     */
    async report(token, id, { reason, details, position, otherSiteId }) {
      const body = /** @type {Record<string, unknown>} */ ({ reason });
      const d = (details ?? '').trim().slice(0, REPORT_DETAILS_MAX);
      if (d) body.details = d;
      if (position) body.position = { lat: position.lat, lon: position.lon };
      if (otherSiteId) body.otherSiteId = otherSiteId;
      await call(token, 'POST', `/v1/sites/base/${encodeURIComponent(id)}/report`, body);
    },
  };
}

/**
 * Load every page while the requested map view is current.
 * @param {(after?: string) => Promise<{ sites: BaseSite[], next: string|null }>} fetchPage
 * @param {() => boolean} isCurrent
 * @param {(sites: BaseSite[]) => void} show
 */
export async function readAreaSites(fetchPage, isCurrent, show) {
  /** @type {BaseSite[]} */
  let sites = [];
  /** @type {string|undefined} */
  let after;
  const cursors = new Set();
  do {
    const page = await fetchPage(after);
    if (!isCurrent()) return;
    sites = [...sites, ...page.sites];
    show(sites);
    after = page.next ?? undefined;
    if (after && cursors.has(after)) throw new SharedSitesError('UNREACHABLE', 0);
    if (after) cursors.add(after);
  } while (after && isCurrent());
}

/**
 * One site of the contribution (the contract's fields, nothing else).
 * @typedef {{ id: string, name: string, lat: number, lon: number, diveCount: number, country?: string, region?: string,
 *   waterType?: 'fresh'|'salt'|'brackish', depthMm?: number, recentDives?: number, baseSiteId?: string }} ContributionSite
 */

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/**
 * Local time « YYYY-MM-DD HH:MM:SS » or ISO, read as a date; NaN when it is not one.
 * @param {string} s
 */
function timeOf(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : NaN;
}

/** The median of numbers (the depth the diver usually notes there). @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * The diver's sites as the base receives them. A site without a name, a position (or at 0/0) or a dive is left out:
 * the server would skip it anyway. Planned dives count like the others only if the core lists them in the site's dives.
 * @param {(import('opendives-core').SiteDetail & { waterType?: string })[]} details the logbook's sites, with their dives
 * @param {Record<string, string>} links local id → base site id (sites added from the base, or linked by the server)
 * @param {number} now ms since 1970 (local time read as UTC, like the dive dates)
 * @returns {ContributionSite[]}
 */
export function contributionOf(details, links, now) {
  /** @type {ContributionSite[]} */
  const out = [];
  for (const d of details) {
    const name = (d.name ?? '').trim();
    const lat = d.latUdeg / 1e6;
    const lon = d.lonUdeg / 1e6;
    const dives = Array.isArray(d.diveList) ? d.diveList : [];
    const diveCount = dives.length || d.dives || 0;
    if (!d.uuid || !name || !d.hasLocation || (d.latUdeg === 0 && d.lonUdeg === 0) || diveCount < 1) continue;
    /** @type {ContributionSite} */
    const site = { id: String(d.uuid), name: name.slice(0, 120), lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, diveCount };
    const country = (d.countryTaxonomy?.value || d.country || '').trim();
    if (country) site.country = country.slice(0, 80);
    const region = (d.region?.value ?? '').trim();
    if (region) site.region = region.slice(0, 80);
    if (d.waterType === 'fresh' || d.waterType === 'salt' || d.waterType === 'brackish') site.waterType = d.waterType;
    const depths = dives.map((x) => x.maxDepthMm).filter((x) => x > 0);
    if (depths.length) site.depthMm = median(depths);
    if (dives.length) site.recentDives = dives.filter((x) => now - timeOf(x.date) <= YEAR_MS).length;
    const base = links[String(d.uuid)];
    if (base) site.baseSiteId = base;
    out.push(site);
  }
  return out;
}

/**
 * A short fingerprint of a contribution (not secret): the app sends the list again only when it changed, the server
 * allowing 20 sends an hour.
 * @param {ContributionSite[]} sites
 */
export function contributionStamp(sites) {
  const s = JSON.stringify([...sites].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return `${sites.length}:${h.toString(16)}`;
}

/**
 * The words of a dive count: « 214 plongées », or « Moins de 5 plongées » under 5 (the server sends null then).
 * @param {{ dives: number|null, fewDives: boolean }} s
 * @returns {{ key: 'few' } | { key: 'count', n: number }}
 */
export function diveCountOf(s) {
  return s.fewDives || s.dives === null ? { key: 'few' } : { key: 'count', n: s.dives };
}

/**
 * Whether the diver already has this base site: one of the logbook's sites is linked to it.
 * @param {string} baseId @param {Record<string, string>} links local id → base id
 */
export function inYourSites(baseId, links) {
  return Object.values(links).includes(baseId);
}

/**
 * The local site linked to a base site, if any.
 * @param {string} baseId @param {Record<string, string>} links
 * @returns {number|null} the core's uuid
 */
export function localSiteOf(baseId, links) {
  for (const [local, base] of Object.entries(links)) if (base === baseId) return Number(local);
  return null;
}

/**
 * The links after a contribution: the server's answer is the truth for the sites it kept; a link of a site that is
 * not in the logbook any more is dropped; a site the server skipped keeps the link it had (added from the base,
 * waiting for its first dive).
 * @param {Record<string, string>} before
 * @param {Record<string, string>} answer local id → base id, from `contribute`
 * @param {Set<string>} localIds the logbook's site ids
 */
export function mergeLinks(before, answer, localIds) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(before)) if (localIds.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(answer)) if (localIds.has(k)) out[k] = v;
  return out;
}

/**
 * The links after the server answered a merged id with the surviving site.
 * @param {Record<string, string>} links @param {string} from @param {string} to
 */
export function redirectLinks(links, from, to) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(links)) out[k] = v === from ? to : v;
  return out;
}
