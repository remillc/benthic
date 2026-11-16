// @ts-check
// Answers of the core that do not depend on the dive shown (the sites list, the values of the
// buddy, guide and tag fields, the planner's setup, the cylinder types), read once and kept
// until something that can change them: the dive list is read again (an edit, a sync, an import),
// the sites change, a setting is written. Several panes asking at the same time share one call.
import { OpenDivesCore } from 'opendives-core';

/** @type {() => unknown[]} */
let versions = () => [];
let generation = 0;
/** @type {Map<string, { stamp: unknown[], promise: Promise<any> }>} */
const entries = new Map();

/**
 * What tells that the logbook changed since a read: the logbook store gives its dive list and its
 * sites version (lib/logbook.svelte.js), so this module does not import it.
 * @param {() => unknown[]} read
 */
export function setCacheVersions(read) {
  versions = read;
}

/** The stamp of the logbook as it is now: kept answers carrying another one are stale. */
export function currentStamp() {
  return [generation, ...versions()];
}

/** @param {unknown[]} a @param {unknown[]} b */
export function sameStamp(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Forgets everything kept: after a change the version stamp cannot see (a setting, a cylinder type). */
export function invalidateCoreCache() {
  generation++;
  entries.clear();
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
function cached(key, load) {
  const stamp = currentStamp();
  const kept = entries.get(key);
  if (kept && sameStamp(kept.stamp, stamp)) return kept.promise;
  const promise = load();
  entries.set(key, { stamp, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

/** The list of the sites (a SiteSummary each). */
export function cachedSites() {
  return cached('sites', () => OpenDivesCore.siteQuery({ kind: 'list' }));
}

/** The values of a field with their dive counts. @param {'buddy'|'guide'|'tag'} field */
export function cachedValues(field) {
  return cached('values:' + field, () => OpenDivesCore.statsQuery({ kind: 'values', field }));
}

/** The planner's setup (the reserve and the rest of its settings). */
export function cachedPlannerSetup() {
  return cached('plannerSetup', () => OpenDivesCore.plannerSetup());
}

/** The cylinder types of the tools. */
export function cachedCylinderTypes() {
  return cached('cylinders', () => OpenDivesCore.toolQuery({ kind: 'cylinders' }));
}
