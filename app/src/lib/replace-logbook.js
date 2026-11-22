// @ts-check
// « Remplacer ce carnet » (decided on 18 November 2026): a phone or a tablet keeps ONE logbook at a time, and moving
// to another logbook goes through files: export the current one, then replace it with a file. Pure functions and one
// guarded flow over `deps`, so that node:test can drive them; the dialogs are in lib/replace-logbook-ui.js and the
// core calls in lib/logbook.svelte.js (replaceDeviceLogbook).
import { filesInZip, isZipName, MAX_ZIP_BYTES } from './zip-fit.js';
import { stageBytes, stageFile } from './staged-file.js';
import { isSubsurfaceXml } from './deep-link.js';

/**
 * Whether the open logbook may be replaced from a file.
 * - `ok`: the logbook of this device, no account;
 * - `server`: the Benthic+ server logbook: never deleted or overwritten from here;
 * - `account`: a Subsurface cloud or git logbook: removing its dives would be sent to the shared log.
 * @param {{ email?: string, benthicPlus?: boolean, repository?: string }} open
 * @returns {'ok'|'server'|'account'}
 */
export function replaceEligibility(open) {
  if (open.benthicPlus) return 'server';
  if (open.email || open.repository) return 'account';
  return 'ok';
}

/**
 * The logbook a file holds, when it holds several: only one is taken.
 * - a `.ssrf` file or a Subsurface `.xml` file holds one logbook (the dives of the file; Subsurface's format has no
 *   notion of several);
 * - a `.zip` archive may hold several `.ssrf` logbook files: the main one is `logbook/logbook.ssrf` (the layout of
 *   OpenDives' own export), otherwise the first by name.
 * @param {string} name the file's name
 * @param {Uint8Array} bytes
 * @returns {Promise<{ count: number, main: { name: string, data: Uint8Array }, names: string[] }|null>} null when the file
 *   is not an archive with a logbook inside
 */
export async function logbooksInFile(name, bytes) {
  if (!isZipName(name)) return null;
  const found = await filesInZip(bytes, /\.ssrf$/i);
  if (!found.length) return null;
  const sorted = [...found].sort((a, b) => a.path.localeCompare(b.path));
  const main = sorted.find((f) => /(^|\/)logbook\/logbook\.ssrf$/i.test(f.path)) ?? sorted[0];
  return { count: found.length, main: { name: main.name, data: main.data }, names: sorted.map((f) => f.name) };
}

/** The label of a logbook file: its name without the extension. @param {string} fileName */
export function logbookLabel(fileName) {
  return (fileName || '').replace(/\.[^.]*$/, '') || fileName;
}

/**
 * @typedef {Object} ReplaceDeps what the screen and the core give
 * @property {(o: { logbook: string, file: string, pending: number, exported: boolean }) => Promise<'export'|'replace'|'cancel'>} explain
 *   « Remplacer le carnet X »: says the logbook leaves this device; the three answers
 * @property {() => Promise<boolean>} exportCurrent exports the open logbook as a Subsurface file through the share
 *   or save sheet; true when it was handed over
 * @property {(o: { logbook: string, pending: number }) => Promise<boolean>} confirmRemoval the second confirmation
 * @property {(suggested: string) => Promise<string|null>} askName the name step; null when the diver cancels
 * @property {(name: string, data: { path: string }) => Promise<number>} replace the core: the logbook of this device becomes the
 *   file's (a staged file in the app's cache), the dives added are counted
 * @property {(name: string, n: number) => void} done
 * @property {(e: unknown) => void} failed
 */

/**
 * The guarded flow. The explanation comes first and offers « Exporter d'abord ce carnet » (as often as the diver
 * wants); « Remplacer » asks a second time when the logbook was not exported, or when changes are not synced.
 * Nothing is removed before the name step is confirmed.
 * @param {ReplaceDeps} deps
 * @param {{ logbook: string, file: string, data: { path: string }, pending?: number }} what
 * @returns {Promise<'cancelled'|'replaced'|'failed'>}
 */
export async function runReplace(deps, what) {
  const pending = what.pending ?? 0;
  let exported = false;
  for (;;) {
    const answer = await deps.explain({ logbook: what.logbook, file: what.file, pending, exported });
    if (answer === 'cancel') return 'cancelled';
    if (answer === 'export') {
      try {
        if (await deps.exportCurrent()) exported = true;
      } catch (e) {
        deps.failed(e);
      }
      continue;
    }
    break;
  }
  if ((!exported || pending > 0) && !(await deps.confirmRemoval({ logbook: what.logbook, pending }))) return 'cancelled';
  const name = await deps.askName(logbookLabel(what.file));
  if (name === null) return 'cancelled';
  try {
    const n = await deps.replace(name, what.data);
    deps.done(name, n);
    return 'replaced';
  } catch (e) {
    deps.failed(e);
    return 'failed';
  }
}

/**
 * What the dialog of a file with a logbook open can offer on a device that holds one logbook.
 * @param {{ email?: string, benthicPlus?: boolean, repository?: string }} open
 * @returns {{ replace: boolean, why: '' | 'server' | 'account' }}
 */
export function replaceOffer(open) {
  const e = replaceEligibility(open);
  return { replace: e === 'ok', why: e === 'ok' ? '' : e };
}

/**
 * A file picked for « + › Importer un fichier » is replaceable when it is a Subsurface logbook (XML) or an archive
 * with a `.ssrf` inside; a dive computer file or a CSV only adds dives.
 * Nothing is staged until the diver chooses « Remplacer »: `stage()` then writes the logbook to the app's cache in
 * pieces (a logbook is never one string), the archive's own logbook when it is one.
 * @param {import('./staged-file.js').StagedCore} core
 * @param {File} file
 * @returns {Promise<{ name: string, stage: (onProgress?: (done: number, total: number) => void) => Promise<{ path: string }>, several: { count: number, main: string }|null }|null>}
 */
export async function replacementFromFile(core, file) {
  const name = file.name;
  const head = (await file.slice(0, 4096).text()).replace(/^﻿/, '');
  if (/\.(ssrf|xml)$/i.test(name) && isSubsurfaceXml(head)) {
    return { name, stage: (onProgress) => stageFile(core, file, undefined, onProgress), several: null };
  }
  // An archive is small next to what it holds: read whole (up to 64 MB), its logbook goes to the cache in pieces.
  if (!isZipName(name) || file.size > MAX_ZIP_BYTES) return null;
  const inside = await logbooksInFile(name, new Uint8Array(await file.arrayBuffer()));
  if (!inside) return null;
  const main = inside.main;
  return {
    name: main.name,
    stage: (onProgress) => stageBytes(core, main.name, main.data, onProgress),
    several: inside.count > 1 ? { count: inside.count, main: logbookLabel(main.name) } : null,
  };
}
