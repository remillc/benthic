// @ts-check
// A file another app shares with Benthic (« Open with », « Share to »), the pure part: what the file is,
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
// Nothing here touches the screen or the core: lib/open-link.js gives the actions in `deps`. The file itself is never a
// string: it is streamed into the cache by the plugin and read in pieces (lib/staged-file.js).
import { logbookLabel, logbooksInFile } from './replace-logbook.js';
import { isZipName, MAX_ZIP_BYTES } from './zip-fit.js';
import { isCancelled } from './import-progress.js';
import { MAX_SITES_FILE, readAllBytes, scanIsSitesOnly, scanLogbook, stageBytes, stagedHead } from './staged-file.js';

/** The largest old-format file (`<dives>` root) whose dangling site references are cleaned in memory. */
const MAX_REWRITE_FILE = 48 * 1024 * 1024;

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
 * @param {(done: number, total: number) => void} [onProgress] after each site
 * @returns {Promise<{ added: number, completed: number }>}
 */
export async function applySitesMerge(plan, siteChange, onProgress) {
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
  const total = plan.complete.length + plan.add.length;
  for (const s of plan.complete) {
    await siteChange({ action: 'edit', uuid: s.uuid, field: 'name', value: s.name });
    if (s.hasLocation) await siteChange({ action: 'edit', uuid: s.uuid, field: 'location', value: '', lat: s.latUdeg, lon: s.lonUdeg });
    await fill(s.uuid, s);
    completed++;
    onProgress?.(completed, total);
  }
  for (const s of plan.add) {
    const created = await siteChange({ action: 'create', value: s.name, ...(s.hasLocation ? { lat: s.latUdeg, lon: s.lonUdeg } : {}) });
    const uuid = Number(created?.uuid ?? created?.site?.uuid ?? 0);
    if (uuid) await fill(uuid, s);
    added++;
    onProgress?.(completed + added, total);
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

// --- Bytes and text (small things only: a logbook is never turned into a string, see lib/staged-file.js) ----------

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

/** A file in memory from the base64 contents the plugin gives (small files only). @param {string} name @param {string} base64 */
export function fileFromBase64(name, base64) {
  return new File([/** @type {BlobPart} */ (base64ToBytes(base64))], name);
}

// --- Dive sites a dives file lacks, on a staged file ----------------------------------------------------------------

/**
 * The same staged file with every site its dives point to defined: a site the file lacks gets its own data when it was
 * remembered from a sites file, else a placeholder (as completeSiteReferences, on text). The new staged file is
 * assembled from byte ranges of the first one (assembleFile): the sites go before `</divesites>`, or in a
 * `<divesites>` made before `<dives>`; the first file is deleted. Without a `<divelog>` root (the older `<dives>`
 * root takes no `<divesites>`) the dangling references are removed instead, which needs the text: done in memory for
 * a file of at most 48 MB, else `tooBig` is true and nothing changes (the core would not survive the dangling
 * references: the caller refuses the file).
 * @param {import('./staged-file.js').StagedCore} core
 * @param {import('./staged-file.js').StagedFile} staged
 * @param {import('./staged-file.js').LogbookScan} scan
 * @param {Record<string, SharedSite>} remembered
 * @returns {Promise<{ staged: import('./staged-file.js').StagedFile, tooBig: boolean }>}
 */
export async function completeStagedSites(core, staged, scan, remembered) {
  const missing = [...scan.referenced].filter((uuid) => uuid > 0 && !scan.siteUuids.has(uuid));
  if (!missing.length) return { staged, tooBig: false };
  const insertAt = scan.divesitesEnd >= 0 ? scan.divesitesEnd : scan.divesStart;
  if (!scan.hasDivelog || insertAt < 0) {
    if (staged.size > MAX_REWRITE_FILE) return { staged, tooBig: true };
    const text = new TextDecoder().decode(await readAllBytes(core, staged.path, staged.size));
    const next = await stageBytes(core, staged.name, new TextEncoder().encode(completeSiteReferences(text, remembered).text));
    await core.discardImport({ path: staged.path }).catch(() => {});
    return { staged: next, tooBig: false };
  }
  const entries = missing
    .map((uuid) => {
      const known = remembered[hex(uuid)];
      return known ? siteXml({ ...known, uuid }) : `<site uuid='${hex(uuid)}' name='${escapeXml(placeholderName(uuid))}'>\n</site>\n`;
    })
    .join('');
  const text = scan.divesitesEnd >= 0 ? entries : `<divesites>\n${entries}</divesites>\n`;
  const next = await core.assembleFile({
    name: staged.name,
    parts: [{ path: staged.path, start: 0, end: insertAt }, { text }, { path: staged.path, start: insertAt, end: staged.size }],
  });
  await core.discardImport({ path: staged.path }).catch(() => {});
  return { staged: { path: next.path, name: staged.name, size: staged.size + new TextEncoder().encode(text).length }, tooBig: false };
}

// --- What is done with the file -------------------------------------------------------

/**
 * What a logbook handed to the core is: a staged file in the app's cache (`{ path }`), read by the core where it is
 * and deleted after the import. A small file made in memory (a few KB: a QR share, the clipboard) may still be base64.
 * @typedef {{ path: string }} StagedPayload
 */

/**
 * @typedef {Object} SharedDeps what the screen and the core give
 * @property {(uri: string, onProgress?: (done: number, total: number) => void) => Promise<{ name: string, size: number, path: string }>} stage the plugin's stageSharedFile: the
 *   file is streamed into the app's cache, only its path comes back; `onProgress` gets the bytes copied
 * @property {(uri: string) => unknown} [cancelStage] the plugin's cancelStage: stops the copy of `uri`
 * @property {import('./import-progress.js').ImportProgress} [progress] the one progress line of the import (lib/import-progress.js):
 *   copy and check run here, import and save in `importData`; it stays (hidden) while the diver answers the question
 * @property {import('./staged-file.js').StagedCore} core the plugin's calls on staged files (readFileChunk, assembleFile, discardImport…)
 * @property {(name: string, head: string, size: number) => ({ ok: true, name: string } | { ok: false, reason: string })} check checkSharedFile
 * @property {() => boolean} welcome no logbook yet (first launch)
 * @property {() => Record<string, SharedSite>} remembered
 * @property {(sites: Record<string, SharedSite>) => void} keep
 * @property {() => Promise<{ uuid: number, name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number }[]>} listSites
 * @property {(options: any) => Promise<any>} siteChange
 * @property {(name: string, data: StagedPayload) => Promise<number>} importData
 * @property {(name: string, staged: import('./staged-file.js').StagedFile, summary: { sites: number, firstYear: number|null, lastYear: number|null }|null) => void} toFirstLaunch
 *   hands the staged file to « Importer un carnet »
 * @property {(options: { textKey: string, values: Record<string, string|number>, actionKey: string }, run: () => Promise<void>, cancel?: () => void) => void} confirm
 * @property {(key: string, values?: Record<string, string|number>) => void} refuse a dialog with an OK
 * @property {(key: string, values?: Record<string, string|number>) => void} notify a snackbar
 * @property {(n: number) => void} imported « n dives imported », with Undo
 * @property {(e: unknown) => void} importFailed
 * @property {() => Promise<void>} [ready] resolves once the logbook is read
 * @property {() => string} [logbookName] the name of the open logbook, for the sites confirmation
 * @property {(options: { name: string, canCreate: boolean, canReplace?: boolean, whyNot?: '' | 'server' | 'account', several?: { count: number, main: string }|null }, actions: { merge: () => Promise<void>, create?: () => Promise<void>, replace?: () => Promise<void>, discard: () => Promise<void> }) => void} [choose]
 *   the choice for a dives file with a logbook open: « Nouveau carnet » (`create`, only when this device can hold
 *   another logbook), « Remplacer ce carnet » (`replace`, a device that holds one logbook: only its own logbook, never
 *   an account's or the server's, `whyNot` says which) or « Ajouter à ce carnet » (`merge`); `several`: the file is an
 *   archive of several logbooks, only `main` is taken; `discard`: the diver cancelled, the staged file goes;
 *   without `choose`, the single confirmation `confirm` is used
 * @property {(name: string, data: StagedPayload) => Promise<void>} [newLogbook] creates a logbook from the file, keeps the open one untouched
 * @property {() => boolean} [canCreateLogbook] false when this device holds one logbook at a time (a phone)
 * @property {() => 'ok'|'server'|'account'} [replaceEligibility] whether the open logbook may be replaced (a phone or a
 *   tablet only: leave it out where `newLogbook` is offered)
 * @property {(what: { file: string, fileName: string, data: StagedPayload, several: { count: number, main: string }|null }) => Promise<unknown>} [replaceLogbook]
 *   the guarded flow of lib/replace-logbook-ui.js
 */

/**
 * A file shared with the app: streamed into the cache, looked at in pieces, checked, then handed to the first launch
 * (no logbook yet) or confirmed and imported into the open logbook. Never imported silently. The file is never held
 * whole in memory, here or in the plugin: only its path moves, and the core imports from it. Resolves with what was done.
 * @param {SharedDeps} deps
 * @param {string} uri
 * @returns {Promise<'refused'|'cancelled'|'first-launch'|'confirm-dives'|'confirm-sites'>}
 */
export async function openSharedFile(deps, uri) {
  if (deps.ready) await deps.ready();
  const progress = deps.progress;
  progress?.begin(['copy', 'check', 'import', 'save']);
  /** The flow is over, unless a question is waiting for its answer (the line then stays, hidden). */
  let waiting = false;
  const unhook = progress?.onCancel(() => void deps.cancelStage?.(uri));
  /** @type {{ name: string, size: number, path: string }} */
  let staged;
  try {
    progress?.phase('copy');
    const report = progress?.reporter('copy');
    staged = await deps.stage(uri, (done, total) => {
      try {
        report?.(done, total);
      } catch {
        // Cancelled: the plugin was told through cancelStage, its copy rejects.
      }
    });
  } catch (e) {
    unhook?.();
    progress?.end();
    if (isCancelled(e)) return 'cancelled';
    const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');
    console.error('Read a shared file', code);
    deps.refuse(code.includes('TOO_BIG') ? 'link.fileTooBig' : 'link.fileUnreadable');
    return 'refused';
  }
  let current = staged;
  // The staged file is deleted unless a later step (first launch, the dialog's actions) took it over.
  let kept = false;
  try {
    const result = await handleStaged(
      deps,
      staged,
      (next) => (current = next),
      () => (kept = true),
      () => (waiting = true),
    );
    return result;
  } catch (e) {
    if (isCancelled(e)) return 'cancelled';
    throw e;
  } finally {
    unhook?.();
    if (!waiting) progress?.end();
    if (!kept) await deps.core.discardImport({ path: current.path }).catch(() => {});
  }
}

/**
 * @param {SharedDeps} deps
 * @param {{ name: string, size: number, path: string }} staged
 * @param {(next: { name: string, size: number, path: string }) => void} replaced the staged file changed (an archive's logbook, sites added)
 * @param {() => void} keep from now on the file belongs to the next step
 * @param {() => void} wait a question is shown: the progress line stays, hidden, and the answer ends it
 * @returns {Promise<'refused'|'cancelled'|'first-launch'|'confirm-dives'|'confirm-sites'>}
 */
async function handleStaged(deps, staged, replaced, keep, wait) {
  const core = deps.core;
  const progress = deps.progress;
  /** The flow's end, once the diver answered (or cancelled). */
  const over = () => progress?.end();
  progress?.phase('check', staged.size);
  const checking = progress?.reporter('check');
  const label = staged.name || '';
  const head = new TextDecoder().decode(await stagedHead(core, staged.path));
  const check = deps.check(staged.name, head, staged.size);
  if (!check.ok) {
    const key = check.reason === 'TOO_BIG' ? 'link.fileTooBig' : check.reason === 'EMPTY' ? 'link.fileEmpty' : check.reason === 'CSV' ? 'link.fileCsv' : 'link.fileNotLogbook';
    deps.refuse(key, { name: label });
    return 'refused';
  }
  let { name } = check;
  /** @type {{ count: number, main: string }|null} */
  let several = null;
  let current = { ...staged, name };
  // An archive of logbooks (Benthic's own export, or several .ssrf): one logbook is taken, the main one. An archive is
  // small next to what it holds (it is read whole, up to 64 MB); the logbook inside goes back to the cache in pieces.
  if (isZipName(name) && staged.size <= MAX_ZIP_BYTES) {
    const inside = await logbooksInFile(name, await readAllBytes(core, staged.path, staged.size));
    if (inside) {
      name = inside.main.name;
      if (inside.count > 1) several = { count: inside.count, main: logbookLabel(inside.main.name) };
      const next = await stageBytes(core, inside.main.name, inside.main.data);
      await core.discardImport({ path: staged.path }).catch(() => {});
      current = next;
      replaced(next);
    }
  }
  const bodyHead = new TextDecoder().decode(await stagedHead(core, current.path));
  const isXml = /\.(ssrf|xml)$/i.test(name) && /^\s*(<\?xml|<)/.test(bodyHead.replace(/^﻿/, ''));
  /** @type {import('./staged-file.js').LogbookScan|null} */
  let scan = null;

  if (isXml) {
    scan = await scanLogbook(core, current.path, current.size, checking && ((done, total) => checking(done, total)));
    if (scanIsSitesOnly(scan)) {
      if (current.size > MAX_SITES_FILE) {
        deps.refuse('link.fileNotLogbook', { name: label });
        return 'refused';
      }
      const sites = readSites(new TextDecoder().decode(await readAllBytes(core, current.path, current.size)));
      if (!sites.length) {
        deps.refuse('link.fileEmpty', { name: label });
        return 'refused';
      }
      if (deps.welcome()) {
        deps.refuse('link.sitesFirstLaunch', { name: label });
        return 'refused';
      }
      // The file is read: it is not needed any more (the sites are in memory).
      await core.discardImport({ path: current.path }).catch(() => {});
      // The sites go to the open logbook, named in the question: never to one the diver did not choose.
      progress?.pause();
      wait();
      deps.confirm({ textKey: 'link.sitesText', values: { name: label, n: sites.length, logbook: deps.logbookName?.() ?? '' }, actionKey: 'link.sitesAction' }, async () => {
        try {
          // The file's sites are remembered first: a dives file shared next finds them even if this merge adds nothing.
          deps.keep(remember(deps.remembered(), sites));
          const plan = planSitesMerge(sites, await deps.listSites());
          if (!plan.add.length && !plan.complete.length) {
            deps.notify('link.sitesNothing');
            return;
          }
          progress?.phase('import', plan.add.length + plan.complete.length);
          const done = await applySitesMerge(plan, deps.siteChange, progress?.reporter('import'));
          deps.notify('link.sitesDone', { added: done.added, completed: done.completed, present: plan.present });
        } catch (e) {
          console.error('Add shared sites', e);
          deps.refuse('link.sitesFailed');
        } finally {
          over();
        }
      }, over);
      return 'confirm-sites';
    }
    const fixed = await completeStagedSites(core, current, scan, deps.remembered());
    if (fixed.tooBig) {
      deps.refuse('link.fileNotLogbook', { name: label });
      return 'refused';
    }
    current = { ...fixed.staged, name };
    replaced(current);
  }

  const payload = { path: current.path };
  if (deps.welcome()) {
    keep();
    // The first launch has its own steps (the name, the choice of where to keep it); the import there starts its own line.
    over();
    deps.toFirstLaunch(name, current, scan ? { sites: scan.sites, firstYear: scan.firstYear, lastYear: scan.lastYear } : null);
    return 'first-launch';
  }
  const discard = () => core.discardImport({ path: payload.path }).then(
    () => over(),
    () => over(),
  );
  const merge = async () => {
    try {
      deps.imported(await deps.importData(name, payload));
    } catch (e) {
      if (!isCancelled(e)) deps.importFailed(e);
    } finally {
      await discard();
    }
  };
  keep();
  // The diver answers a question: the line waits, hidden, and comes back with the import.
  progress?.pause();
  wait();
  if (!deps.choose) {
    deps.confirm({ textKey: 'link.fileText', values: { name: label || name }, actionKey: 'link.fileAction' }, merge, () => void discard());
    return 'confirm-dives';
  }
  const newLogbook = deps.newLogbook;
  const canCreate = !!newLogbook && (deps.canCreateLogbook?.() ?? true);
  const create = canCreate && newLogbook
    ? async () => {
        try {
          await newLogbook(name, payload);
        } catch (e) {
          deps.importFailed(e);
        } finally {
          await discard();
        }
      }
    : undefined;
  const eligibility = deps.replaceEligibility?.();
  const canReplace = !canCreate && eligibility === 'ok' && !!deps.replaceLogbook && isXml;
  const replace = canReplace
    ? async () => {
        try {
          await deps.replaceLogbook?.({ file: label || name, fileName: name, data: payload, several });
        } finally {
          await discard();
        }
      }
    : undefined;
  deps.choose(
    { name: label || name, canCreate, canReplace, whyNot: !canCreate && deps.replaceLogbook && eligibility && eligibility !== 'ok' ? eligibility : '', several },
    { merge, create, replace, discard },
  );
  return 'confirm-dives';
}
