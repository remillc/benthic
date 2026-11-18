// @ts-check
// A file another app shares with OpenDives (« Open with », « Share to »), the pure part: what the file is,
// what is done with it, and the two files of Subsurface-mobile's export.
//
// Subsurface-mobile shares its log as two files (qmlmanager.cpp, writeExportFile):
//   - the dives, a normal .ssrf: <divelog> with <settings>, <divesites> (every non-empty site) and <dives>;
//   - the dive sites, a .xml whose root is <divesites program= version=> holding the <site> entries
//     (export_dive_sites_xslt in core/save-xml.cpp, stylesheet xslt/divesites-export.xslt).
// Either one can arrive first. The core reads a dive's site by its uuid in the file and crashes on a uuid
// the file does not hold (parse-xml.cpp, dive_site()); an empty site is not exported and not kept by the core,
// so the link to a site the core does not know cannot be kept by the core. This file keeps it:
//   - a dives file whose site uuids are not in the file gets one <site> entry per missing uuid before the core
//     reads it: the site's own data when a sites file was shared earlier (remembered on this device), else a
//     placeholder named « Site <uuid> », which carries the link;
//   - a sites file is merged into the open logbook, named in the question: a site with a known uuid whose name is still the
//     placeholder is completed (name, position, description, notes, country, region, city); a site the logbook
//     already has (same uuid, or same name and position) is left alone; the others are added. The sites are
//     remembered so that a dives file shared afterwards finds them.
// Nothing here touches the screen or the core: lib/open-link.js gives the actions in `deps`.
import { logbookLabel, logbooksInFile } from './replace-logbook.js';

/** The name of the site that stands in for one whose data have not arrived. @param {number} uuid */
export function placeholderName(uuid) {
  return `Site ${hex(uuid)}`;
}

/** @param {number} uuid */
const hex = (uuid) => uuid.toString(16).padStart(8, '0');

/**
 * @typedef {{ uuid: number, name: string, latUdeg: number, lonUdeg: number, hasLocation: boolean,
 *   description: string, notes: string, country: string, region: string, city: string }} SharedSite
 */

/** @param {string} text */
function unescapeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, code) => {
    const c = String(code).toLowerCase();
    if (c === 'amp') return '&';
    if (c === 'lt') return '<';
    if (c === 'gt') return '>';
    if (c === 'quot') return '"';
    if (c === 'apos') return "'";
    const n = c.startsWith('#x') ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

/** @param {string} text */
const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');

/** @param {string} tag the text between < and > @returns {Record<string, string>} */
function attributes(tag) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) out[m[1]] = unescapeXml(m[2] ?? m[3] ?? '');
  return out;
}

/** The sites of a document, in file order. Taxonomy: <geo cat='2' value=…> is the country, 3 the region, 5 the city (Subsurface's categories). @param {string} text @returns {SharedSite[]} */
export function readSites(text) {
  /** @type {SharedSite[]} */
  const sites = [];
  for (const m of text.matchAll(/<site\b((?:[^>'"]|'[^']*'|"[^"]*")*?)(\/?)>(?:([\s\S]*?)<\/site>)?/g)) {
    const a = attributes(m[1]);
    const uuid = parseInt((a.uuid ?? '').trim(), 16);
    if (!Number.isFinite(uuid) || uuid <= 0) continue;
    const body = m[2] ? '' : (m[3] ?? '');
    const gps = /^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/.exec(a.gps ?? '');
    /** @type {Record<string, string>} */
    const geo = {};
    for (const g of body.matchAll(/<geo\b([^>]*)\/?>/g)) {
      const ga = attributes(g[1]);
      if (ga.cat && ga.value) geo[ga.cat] = ga.value;
    }
    const notes = /<notes>([\s\S]*?)<\/notes>/.exec(body);
    sites.push({
      uuid,
      name: a.name ?? '',
      hasLocation: !!gps,
      latUdeg: gps ? Math.round(Number(gps[1]) * 1e6) : 0,
      lonUdeg: gps ? Math.round(Number(gps[2]) * 1e6) : 0,
      description: a.description ?? '',
      notes: notes ? unescapeXml(notes[1]).trim() : '',
      country: geo['2'] ?? '',
      region: geo['3'] ?? '',
      city: geo['5'] ?? '',
    });
  }
  return sites;
}

/** A site as Subsurface writes it (save_one_dive_site), for a dives file that lacks it. @param {SharedSite} s */
export function siteXml(s) {
  const gps = s.hasLocation ? ` gps='${(s.latUdeg / 1e6).toFixed(6)} ${(s.lonUdeg / 1e6).toFixed(6)}'` : '';
  const desc = s.description ? ` description='${escapeXml(s.description)}'` : '';
  const notes = s.notes ? `  <notes>${escapeXml(s.notes)} </notes>\n` : '';
  const geo = [
    [2, s.country],
    [3, s.region],
    [5, s.city],
  ]
    .filter(([, v]) => v)
    .map(([cat, v]) => `  <geo cat='${cat}' origin='2' value='${escapeXml(String(v))}'/>\n`)
    .join('');
  return `<site uuid='${hex(s.uuid)}' name='${escapeXml(s.name)}'${gps}${desc}>\n${notes}${geo}</site>\n`;
}

/**
 * Whether a document holds dive sites and no dives: Subsurface-mobile's « dive sites » export
 * (root <divesites>), or a <divelog> with nothing but its <divesites>.
 * @param {string} text the whole file
 */
export function isSitesOnly(text) {
  return /<divesites[\s>]/i.test(text) && !/<dives[\s>]/i.test(text) && !/<dive[\s>]/i.test(text);
}

/**
 * The dives file's site references the file does not define.
 * @param {string} text
 * @returns {number[]} uuids, each once
 */
export function missingSites(text) {
  const have = new Set(readSites(text).map((s) => s.uuid));
  const missing = new Set();
  for (const m of text.matchAll(/\bdivesiteid\s*=\s*(['"])\s*([0-9a-fA-F]+)\s*\1/g)) {
    const uuid = parseInt(m[2], 16);
    if (uuid > 0 && !have.has(uuid)) missing.add(uuid);
  }
  return [...missing];
}

/**
 * A dives file the core can read without losing the link to the sites the file lacks: each missing site gets an
 * entry (its own data when remembered, else the placeholder). Without a <divelog> root (the older <dives> root
 * takes no <divesites>) the dangling references are removed instead, the core would not survive them.
 * @param {string} text
 * @param {Record<string, SharedSite>} remembered sites seen in an earlier sites file, by uuid in hex
 * @returns {{ text: string, linked: number, placeholders: number, removed: number }}
 */
export function completeSiteReferences(text, remembered) {
  const missing = missingSites(text);
  if (!missing.length) return { text, linked: 0, placeholders: 0, removed: 0 };
  if (!/<divelog[\s>]/i.test(text) || !/<dives[\s>]/i.test(text)) {
    const cleaned = text.replace(/\s+divesiteid\s*=\s*(['"])\s*[0-9a-fA-F]+\s*\1/g, (all) => {
      const uuid = parseInt(/([0-9a-fA-F]+)\s*['"]$/.exec(all)?.[1] ?? '0', 16);
      return missing.includes(uuid) ? '' : all;
    });
    return { text: cleaned, linked: 0, placeholders: 0, removed: missing.length };
  }
  let linked = 0;
  let placeholders = 0;
  const entries = missing
    .map((uuid) => {
      const known = remembered[hex(uuid)];
      if (known) {
        linked++;
        return siteXml({ ...known, uuid });
      }
      placeholders++;
      return `<site uuid='${hex(uuid)}' name='${escapeXml(placeholderName(uuid))}'>\n</site>\n`;
    })
    .join('');
  const close = /<\/divesites>/i.exec(text);
  let out;
  if (close) out = text.slice(0, close.index) + entries + text.slice(close.index);
  else {
    const dives = /<dives[\s>]/i.exec(text);
    const at = dives ? dives.index : text.length;
    out = `${text.slice(0, at)}<divesites>\n${entries}</divesites>\n${text.slice(at)}`;
  }
  return { text: out, linked, placeholders, removed: 0 };
}

/**
 * What a sites file does to the logbook's sites.
 * @param {SharedSite[]} sites the file's
 * @param {{ uuid: number, name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number }[]} existing the logbook's
 * @returns {{ complete: SharedSite[], add: SharedSite[], present: number }}
 */
export function planSitesMerge(sites, existing) {
  const byUuid = new Map(existing.map((e) => [e.uuid, e]));
  /** @type {SharedSite[]} */
  const complete = [];
  /** @type {SharedSite[]} */
  const add = [];
  let present = 0;
  for (const site of sites) {
    const same = byUuid.get(site.uuid);
    if (same) {
      // Only a site that is still the placeholder takes the file's data; the diver's own are never overwritten.
      if (same.name === placeholderName(site.uuid) && !same.hasLocation) complete.push(site);
      else present++;
      continue;
    }
    const twin = existing.find((e) => e.name === site.name && e.hasLocation === site.hasLocation && (!e.hasLocation || (e.latUdeg === site.latUdeg && e.lonUdeg === site.lonUdeg)));
    if (twin || add.some((a) => a.name === site.name && a.latUdeg === site.latUdeg && a.lonUdeg === site.lonUdeg && a.hasLocation === site.hasLocation)) present++;
    else add.push(site);
  }
  return { complete, add, present };
}

/**
 * Applies a plan: one undoable step per change, as the Sites screens do.
 * @param {{ complete: SharedSite[], add: SharedSite[] }} plan
 * @param {(options: any) => Promise<any>} siteChange lib/sites.svelte.js
 * @returns {Promise<{ added: number, completed: number }>}
 */
export async function applySitesMerge(plan, siteChange) {
  /** @param {number} uuid @param {SharedSite} s */
  const fill = async (uuid, s) => {
    if (s.description) await siteChange({ action: 'edit', uuid, field: 'description', value: s.description });
    if (s.notes) await siteChange({ action: 'edit', uuid, field: 'notes', value: s.notes });
    if (s.country) await siteChange({ action: 'edit', uuid, field: 'country', value: s.country });
    if (s.region) await siteChange({ action: 'edit', uuid, field: 'region', value: s.region });
    if (s.city) await siteChange({ action: 'edit', uuid, field: 'city', value: s.city });
  };
  let added = 0;
  let completed = 0;
  for (const s of plan.complete) {
    await siteChange({ action: 'edit', uuid: s.uuid, field: 'name', value: s.name });
    if (s.hasLocation) await siteChange({ action: 'edit', uuid: s.uuid, field: 'location', value: '', lat: s.latUdeg, lon: s.lonUdeg });
    await fill(s.uuid, s);
    completed++;
  }
  for (const s of plan.add) {
    const created = await siteChange({ action: 'create', value: s.name, ...(s.hasLocation ? { lat: s.latUdeg, lon: s.lonUdeg } : {}) });
    const uuid = Number(created?.uuid ?? created?.site?.uuid ?? 0);
    if (uuid) await fill(uuid, s);
    added++;
  }
  return { added, completed };
}

/** The sites remembered between the two files: the newest 500. @param {Record<string, SharedSite>} memory @param {SharedSite[]} sites */
export function remember(memory, sites) {
  const next = { ...memory };
  for (const s of sites) {
    delete next[hex(s.uuid)];
    next[hex(s.uuid)] = s;
  }
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete next[k];
  return next;
}

// --- Bytes and text -------------------------------------------------------------------

/** @param {string} base64 */
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A file in memory from the base64 contents the plugin gives (first launch: the import step reads Files). @param {string} name @param {string} base64 */
export function fileFromBase64(name, base64) {
  return new File([/** @type {BlobPart} */ (base64ToBytes(base64))], name);
}

// --- What is done with the file -------------------------------------------------------

/**
 * @typedef {Object} SharedDeps what the screen and the core give
 * @property {(uri: string) => Promise<{ name: string, size: number, data: string }>} read the plugin's readSharedFile
 * @property {(name: string, head: string, size: number) => ({ ok: true, name: string } | { ok: false, reason: string })} check checkSharedFile
 * @property {() => boolean} welcome no logbook yet (first launch)
 * @property {() => Record<string, SharedSite>} remembered
 * @property {(sites: Record<string, SharedSite>) => void} keep
 * @property {() => Promise<{ uuid: number, name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number }[]>} listSites
 * @property {(options: any) => Promise<any>} siteChange
 * @property {(name: string, data: string) => Promise<number>} importData
 * @property {(name: string, data: string) => void} toFirstLaunch hands the file to « Importer un carnet »
 * @property {(options: { textKey: string, values: Record<string, string|number>, actionKey: string }, run: () => Promise<void>) => void} confirm
 * @property {(key: string, values?: Record<string, string|number>) => void} refuse a dialog with an OK
 * @property {(key: string, values?: Record<string, string|number>) => void} notify a snackbar
 * @property {(n: number) => void} imported « n dives imported », with Undo
 * @property {(e: unknown) => void} importFailed
 * @property {() => Promise<void>} [ready] resolves once the logbook is read
 * @property {() => string} [logbookName] the name of the open logbook, for the sites confirmation
 * @property {(options: { name: string, canCreate: boolean, canReplace?: boolean, whyNot?: '' | 'server' | 'account', several?: { count: number, main: string }|null }, actions: { merge: () => Promise<void>, create?: () => Promise<void>, replace?: () => Promise<void> }) => void} [choose]
 *   the choice for a dives file with a logbook open: « Nouveau carnet » (`create`, only when this device can hold
 *   another logbook), « Remplacer ce carnet » (`replace`, a device that holds one logbook: only its own logbook, never
 *   an account's or the server's, `whyNot` says which) or « Ajouter à ce carnet » (`merge`); `several`: the file is an
 *   archive of several logbooks, only `main` is taken; without `choose`, the single confirmation `confirm` is used
 * @property {(name: string, data: string) => Promise<void>} [newLogbook] creates a logbook from the file, keeps the open one untouched
 * @property {() => boolean} [canCreateLogbook] false when this device holds one logbook at a time (a phone)
 * @property {() => 'ok'|'server'|'account'} [replaceEligibility] whether the open logbook may be replaced (a phone or a
 *   tablet only: leave it out where `newLogbook` is offered)
 * @property {(what: { file: string, fileName: string, data: string, several: { count: number, main: string }|null }) => Promise<unknown>} [replaceLogbook]
 *   the guarded flow of lib/replace-logbook-ui.js
 */

/**
 * A file shared with the app: read, checked, then handed to the first launch (no logbook yet) or confirmed and
 * imported into the open logbook. Never imported silently. Resolves with what was done.
 * @param {SharedDeps} deps
 * @param {string} uri
 * @returns {Promise<'refused'|'first-launch'|'confirm-dives'|'confirm-sites'>}
 */
export async function openSharedFile(deps, uri) {
  if (deps.ready) await deps.ready();
  let file;
  try {
    file = await deps.read(uri);
  } catch (e) {
    const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');
    console.error('Read a shared file', code);
    deps.refuse(code.includes('TOO_BIG') ? 'link.fileTooBig' : 'link.fileUnreadable');
    return 'refused';
  }
  const bytes = base64ToBytes(file.data);
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  const label = file.name || '';
  const check = deps.check(file.name, head, file.size);
  if (!check.ok) {
    const key = check.reason === 'TOO_BIG' ? 'link.fileTooBig' : check.reason === 'EMPTY' ? 'link.fileEmpty' : check.reason === 'CSV' ? 'link.fileCsv' : 'link.fileNotLogbook';
    deps.refuse(key, { name: label });
    return 'refused';
  }
  let { name } = check;
  /** @type {{ count: number, main: string }|null} */
  let several = null;
  let data = file.data;
  // An archive of logbooks (OpenDives' own export, or several .ssrf): one logbook is taken, the main one.
  const inside = await logbooksInFile(name, bytes);
  if (inside) {
    name = inside.main.name;
    data = bytesToBase64(inside.main.data);
    if (inside.count > 1) several = { count: inside.count, main: logbookLabel(inside.main.name) };
  }
  const body = inside ? inside.main.data : bytes;
  const bodyHead = new TextDecoder().decode(body.subarray(0, 4096));
  const isXml = /\.(ssrf|xml)$/i.test(name) && /^\s*(<\?xml|<)/.test(bodyHead.replace(/^﻿/, ''));
  const text = isXml ? new TextDecoder().decode(body) : '';

  if (isXml && isSitesOnly(text)) {
    const sites = readSites(text);
    if (!sites.length) {
      deps.refuse('link.fileEmpty', { name: label });
      return 'refused';
    }
    if (deps.welcome()) {
      deps.refuse('link.sitesFirstLaunch', { name: label });
      return 'refused';
    }
    // The sites go to the open logbook, named in the question: never to one the diver did not choose.
    deps.confirm({ textKey: 'link.sitesText', values: { name: label, n: sites.length, logbook: deps.logbookName?.() ?? '' }, actionKey: 'link.sitesAction' }, async () => {
      try {
        // The file's sites are remembered first: a dives file shared next finds them even if this merge adds nothing.
        deps.keep(remember(deps.remembered(), sites));
        const plan = planSitesMerge(sites, await deps.listSites());
        if (!plan.add.length && !plan.complete.length) {
          deps.notify('link.sitesNothing');
          return;
        }
        const done = await applySitesMerge(plan, deps.siteChange);
        deps.notify('link.sitesDone', { added: done.added, completed: done.completed, present: plan.present });
      } catch (e) {
        console.error('Add shared sites', e);
        deps.refuse('link.sitesFailed');
      }
    });
    return 'confirm-sites';
  }

  if (isXml) {
    const fixed = completeSiteReferences(text, deps.remembered());
    if (fixed.text !== text) data = bytesToBase64(new TextEncoder().encode(fixed.text));
  }
  if (deps.welcome()) {
    deps.toFirstLaunch(name, data);
    return 'first-launch';
  }
  const merge = async () => {
    try {
      deps.imported(await deps.importData(name, data));
    } catch (e) {
      deps.importFailed(e);
    }
  };
  if (!deps.choose) {
    deps.confirm({ textKey: 'link.fileText', values: { name: label || name }, actionKey: 'link.fileAction' }, merge);
    return 'confirm-dives';
  }
  const newLogbook = deps.newLogbook;
  const canCreate = !!newLogbook && (deps.canCreateLogbook?.() ?? true);
  const create = canCreate && newLogbook
    ? async () => {
        try {
          await newLogbook(name, data);
        } catch (e) {
          deps.importFailed(e);
        }
      }
    : undefined;
  const eligibility = deps.replaceEligibility?.();
  const canReplace = !canCreate && eligibility === 'ok' && !!deps.replaceLogbook && isXml;
  const replace = canReplace
    ? async () => {
        await deps.replaceLogbook?.({ file: label || name, fileName: name, data, several });
      }
    : undefined;
  deps.choose(
    { name: label || name, canCreate, canReplace, whyNot: !canCreate && deps.replaceLogbook && eligibility && eligibility !== 'ok' ? eligibility : '', several },
    { merge, create, replace },
  );
  return 'confirm-dives';
}
