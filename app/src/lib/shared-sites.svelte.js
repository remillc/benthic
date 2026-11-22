// @ts-check
// The « Carte commune » on the device (task 2026-11-19-315; docs/architecture.md, section 11.10): the terms of use,
// the contribution of the diver's sites, the links between the logbook's sites and the base, and the calls the screens
// make. The pure side (the client, the list sent, the texts' choices) is lib/shared-sites.js.
//
// Where things are kept:
//   - the links (logbook site uuid → base site id) in the Benthic data store, `shared-sites/links.json`, with the
//     account's other Benthic data (never in the Subsurface logbook, which desktop Subsurface reads too);
//   - the terms version accepted and the fingerprint of the last list sent, in the device store (`od.sharedSitesTerms`,
//     `od.sharedSitesSent`): what the server answers wins.
// Only a subscribed Benthic+ account contributes (whatever the server's reading switch says).
import { BenthicCore } from 'benthic-core';
import { deviceStore } from './device-store.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { benthicPlusAccount, benthicPlusSubscriber } from './benthic-plus-state.svelte.js';
import { logbook } from './logbook.svelte.js';
import { cachedSites } from './core-cache.js';
import { inventoryApi } from './inventory.svelte.js';
import { siteChange } from './sites.svelte.js';
import { connection } from './online.svelte.js';
import { contributionOf, contributionStamp, createSharedSitesApi, mergeLinks, redirectLinks, SharedSitesError } from './shared-sites.js';

const TERMS_KEY = 'od.sharedSitesTerms';
const SENT_KEY = 'od.sharedSitesSent';
const MODE_KEY = 'od.sitesMode';
const LINKS_PATH = 'shared-sites/links.json';

export const sharedSites = $state({
  /** The server's answer about the terms; null until it was asked. @type {import('./shared-sites.js').TermsStatus|null} */
  terms: null,
  /** The terms screen is shown. */
  termsOpen: false,
  /** Logbook site uuid (text) → base site id. @type {Record<string, string>} */
  links: {},
  linksLoaded: false,
  /** The Sites tab shows the diver's sites or the shared map. @type {'mine'|'common'} */
  mode: /** @type {'mine'|'common'} */ ('mine'),
});

/** @type {ReturnType<typeof createSharedSitesApi>|null} */
let fake = null;
/** @type {(() => Promise<string>)|null} */
let fakeToken = null;

/**
 * Replaces the server (the tests and the headless checks; nothing then reaches the network).
 * @param {{ api: ReturnType<typeof createSharedSitesApi>, sessionToken?: () => Promise<string> }|null} f
 */
export function useSharedSitesApi(f) {
  fake = f?.api ?? null;
  fakeToken = f?.sessionToken ?? null;
}
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__sharedSitesApi = useSharedSitesApi;

const api = () => fake ?? createSharedSitesApi({ baseUrl: serverUrl(), transport: serverTransport });

async function token() {
  if (fakeToken) return fakeToken();
  try {
    return (await BenthicCore.serverSessionAccess()).sessionToken || '';
  } catch {
    return '';
  }
}

/**
 * Runs a call with the session; no session is the server refusing.
 * @template T @param {(api: ReturnType<typeof createSharedSitesApi>, token: string) => Promise<T>} f
 * @returns {Promise<T>}
 */
export async function withSession(f) {
  const t = await token();
  if (!t) throw new SharedSitesError('UNAUTHENTICATED', 401);
  return f(api(), t);
}

/** Whether this device may show the shared map and contribute: a subscribed Benthic+ account. */
export const sharedSitesAvailable = () => benthicPlusSubscriber();

// --- Mode of the Sites tab ---------------------------------------------------------------------------------------

/** @param {'mine'|'common'} mode */
export function setSitesMode(mode) {
  sharedSites.mode = mode;
  deviceStore.setItem(MODE_KEY, mode);
}

// --- Links ---------------------------------------------------------------------------------------------------------

export async function loadLinks() {
  try {
    const r = await inventoryApi().store.read(LINKS_PATH);
    sharedSites.links = r && typeof r.links === 'object' && r.links ? { ...r.links } : {};
  } catch {
    sharedSites.links = {};
  }
  sharedSites.linksLoaded = true;
}

/** @param {Record<string, string>} links */
async function saveLinks(links) {
  const same = JSON.stringify(links) === JSON.stringify(sharedSites.links);
  sharedSites.links = links;
  if (same) return;
  try {
    await inventoryApi().commitFiles([[LINKS_PATH, { format: 1, links }]]);
  } catch (e) {
    // Read only (the subscription ended): the links stay in memory until the next start.
    console.info('Shared sites links not saved', String(/** @type {any} */ (e)?.message ?? e));
  }
}

/** The server answered a merged id with the surviving site: the links follow. @param {string} from @param {string} to */
export async function followRedirect(from, to) {
  if (from !== to && Object.values(sharedSites.links).includes(from)) await saveLinks(redirectLinks(sharedSites.links, from, to));
}

// --- Terms ---------------------------------------------------------------------------------------------------------

/** Asks the server about the terms; shows the terms screen when the current ones are not accepted. */
export async function refreshTerms() {
  if (!sharedSitesAvailable() || !connection.online) return;
  try {
    const terms = await withSession((a, t) => a.terms(t));
    sharedSites.terms = terms;
    if (terms.accepted) deviceStore.setItem(TERMS_KEY, terms.currentVersion);
    else sharedSites.termsOpen = true;
  } catch (e) {
    console.info('Shared sites terms not read', String(/** @type {any} */ (e)?.code ?? e));
  }
}

/** « J’accepte les conditions ». Throws when the server could not record it. */
export async function acceptTerms() {
  const version = sharedSites.terms?.currentVersion ?? (await withSession((a, t) => a.terms(t))).currentVersion;
  try {
    sharedSites.terms = await withSession((a, t) => a.acceptTerms(t, version));
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'TERMS_VERSION_MISMATCH') {
      // The terms changed while they were on screen: read them again, the screen stays.
      sharedSites.terms = await withSession((a, t) => a.terms(t));
    }
    throw e;
  }
  deviceStore.setItem(TERMS_KEY, sharedSites.terms.currentVersion);
  sharedSites.termsOpen = false;
  scheduleContribution(0);
}

/** Whether the current terms are known to be accepted (the server's answer, else what this device remembers). */
export function termsAccepted() {
  if (sharedSites.terms) return sharedSites.terms.accepted;
  return !!deviceStore.getItem(TERMS_KEY);
}

// --- Contribution --------------------------------------------------------------------------------------------------

/** @type {ReturnType<typeof setTimeout>|undefined} */
let timer;
let running = false;
let again = false;

/** Sends the list of the diver's sites after a short wait (several changes in a row make one send). @param {number} [ms] */
export function scheduleContribution(ms = 8000) {
  clearTimeout(timer);
  timer = setTimeout(contributeNow, ms);
}

/** The logbook's sites with their dives, for the list sent. */
async function readDetails() {
  const list = /** @type {import('benthic-core').SiteSummary[]} */ (await cachedSites());
  const details = [];
  for (const s of list) {
    if (!s.hasLocation || !s.dives || !s.name.trim()) continue;
    try {
      const d = await BenthicCore.siteQuery({ kind: 'site', uuid: s.uuid });
      if (d?.uuid) details.push(d);
    } catch {
      // A site removed meanwhile.
    }
  }
  return { details, ids: new Set(list.map((s) => String(s.uuid))) };
}

/** Sends the diver's sites to the base when they changed since the last send. */
export async function contributeNow() {
  if (running) {
    again = true;
    return;
  }
  if (!sharedSitesAvailable() || !connection.online || logbook.loading || logbook.browsing || !termsAccepted()) return;
  running = true;
  try {
    if (!sharedSites.linksLoaded) await loadLinks();
    const { details, ids } = await readDetails();
    const sites = contributionOf(details, sharedSites.links, Date.parse(localNow()));
    const stamp = contributionStamp(sites);
    if (deviceStore.getItem(SENT_KEY) === stamp) return;
    const answer = await withSession((a, t) => a.contribute(t, sites));
    await saveLinks(mergeLinks(sharedSites.links, answer.links, ids));
    // The fingerprint of what the server now holds (with the base ids it gave).
    deviceStore.setItem(SENT_KEY, contributionStamp(contributionOf(details, sharedSites.links, Date.parse(localNow()))));
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err?.code === 'TERMS_REQUIRED') {
      deviceStore.removeItem(TERMS_KEY);
      await refreshTerms();
    } else if (err?.code === 'TOO_MANY_REQUESTS' && err.retryAfterSeconds) {
      scheduleContribution(err.retryAfterSeconds * 1000);
    } else console.info('Shared sites not sent', String(err?.code ?? err));
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleContribution();
    }
  }
}

/** Now as local wall time read as UTC, the way the dive dates are compared. */
function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + 'Z';
}

// --- Adding a base site to the logbook ------------------------------------------------------------------------------

/**
 * « Ajouter à mes sites » / choosing a base site: copies it into the logbook (the diver's own copy) and keeps the link.
 * A base site the logbook already has is not copied twice.
 * @param {string} baseId
 * @returns {Promise<number>} the logbook site's uuid
 */
export async function addBaseSite(baseId) {
  if (!sharedSites.linksLoaded) await loadLinks();
  const { baseSiteId, site } = await withSession((a, t) => a.link(t, baseId));
  for (const [local, base] of Object.entries(sharedSites.links)) {
    if (base !== baseSiteId && base !== baseId) continue;
    const uuid = Number(local);
    const known = /** @type {import('benthic-core').SiteSummary[]} */ (await cachedSites()).some((s) => s.uuid === uuid);
    if (known) return uuid;
  }
  const created = await siteChange({ action: 'create', value: site.name, lat: Math.round(site.lat * 1e6), lon: Math.round(site.lon * 1e6) });
  const uuid = Number(/** @type {any} */ (created)?.site?.uuid ?? /** @type {any} */ (created)?.uuid ?? 0);
  if (!uuid) throw new Error('Site not created');
  if (site.country || site.region) {
    try {
      await siteChange({ action: 'geocode', uuid, country: site.country, region: site.region });
    } catch {
      // The place stays empty; the site's own lookup fills it later.
    }
  }
  await saveLinks({ ...sharedSites.links, [String(uuid)]: baseSiteId });
  return uuid;
}

/**
 * Links a site of the logbook to a base site (« Utiliser ce site » while creating one).
 * @param {number} uuid @param {string} baseId
 */
export async function linkSite(uuid, baseId) {
  if (!sharedSites.linksLoaded) await loadLinks();
  await saveLinks({ ...sharedSites.links, [String(uuid)]: baseId });
}

// --- Start ---------------------------------------------------------------------------------------------------------

/** Watches the account and the logbook: asks for the terms once per start, sends the sites when they change. */
export function startSharedSites() {
  const remembered = deviceStore.getItem(MODE_KEY);
  sharedSites.mode = remembered === 'common' ? 'common' : 'mine';
  let asked = false;
  $effect.root(() => {
    $effect(() => {
      const on = benthicPlusAccount.signedIn && benthicPlusAccount.subscribed;
      const online = connection.online;
      if (!on) {
        sharedSites.terms = null;
        sharedSites.termsOpen = false;
        asked = false;
        return;
      }
      if (!logbook.loading && !logbook.welcome && online && !asked) {
        asked = true;
        loadLinks().then(refreshTerms);
      }
    });
    $effect(() => {
      logbook.sitesVersion;
      logbook.lastSync;
      if (benthicPlusAccount.signedIn && benthicPlusAccount.subscribed && !logbook.loading && connection.online && termsAccepted()) scheduleContribution();
    });
  });
}
