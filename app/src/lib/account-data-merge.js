// @ts-check
// Three-way merge of plaintext JSON objects. Arrays are treated as single values.
import { sortedJson } from './file-store.js';

/**
 * @typedef {{ present: boolean, value?: unknown }} FieldVersion
 * @typedef {{ key: string, base: FieldVersion, ours: FieldVersion, theirs: FieldVersion }} FieldConflict
 */

/** @param {Record<string, unknown>} object @param {string} key @returns {FieldVersion} */
function field(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? { present: true, value: object[key] } : { present: false };
}

/** @param {FieldVersion} a @param {FieldVersion} b */
function equalField(a, b) {
  return a.present === b.present && (!a.present || sortedJson(a.value) === sortedJson(b.value));
}

/** @param {Record<string, unknown>|null} a @param {Record<string, unknown>|null} b */
function equalFile(a, b) {
  return a === null || b === null ? a === b : sortedJson(a) === sortedJson(b);
}

/**
 * @param {Record<string, unknown>|null} base
 * @param {Record<string, unknown>|null} ours
 * @param {Record<string, unknown>|null} theirs
 * @returns {{ value: Record<string, unknown>|null, conflicts: FieldConflict[] }}
 */
export function mergeAccountFile(base, ours, theirs) {
  if (equalFile(ours, theirs)) return { value: ours, conflicts: [] };
  if (equalFile(base, ours)) return { value: theirs, conflicts: [] };
  if (equalFile(base, theirs)) return { value: ours, conflicts: [] };
  // A concurrent edit wins over a deletion.
  if (ours === null) return { value: theirs, conflicts: [] };
  if (theirs === null) return { value: ours, conflicts: [] };

  const ancestor = base ?? {};
  const keys = new Set([...Object.keys(ancestor), ...Object.keys(ours), ...Object.keys(theirs)]);
  /** @type {Record<string, unknown>} */
  const value = {};
  /** @type {FieldConflict[]} */
  const conflicts = [];
  for (const key of keys) {
    const b = field(ancestor, key);
    const o = field(ours, key);
    const t = field(theirs, key);
    let selected;
    if (equalField(o, t) || equalField(b, t)) selected = o;
    else if (equalField(b, o)) selected = t;
    else if (key === 'updatedAt' && typeof o.value === 'string' && typeof t.value === 'string'
      && Number.isFinite(Date.parse(o.value)) && Number.isFinite(Date.parse(t.value))) {
      selected = Date.parse(o.value) >= Date.parse(t.value) ? o : t;
    } else {
      const ourTime = typeof ours.updatedAt === 'string' ? Date.parse(ours.updatedAt) : NaN;
      const theirTime = typeof theirs.updatedAt === 'string' ? Date.parse(theirs.updatedAt) : NaN;
      if (!Number.isFinite(ourTime) || !Number.isFinite(theirTime)) {
        throw new Error('ACCOUNT_DATA_CONFLICT_TIME');
      }
      // Equal timestamps need a side-independent tie-break; both versions remain in the conflict.
      selected = ourTime > theirTime || (ourTime === theirTime && sortedJson(ours) > sortedJson(theirs)) ? o : t;
      conflicts.push({ key, base: b, ours: o, theirs: t });
    }
    if (selected.present) Object.defineProperty(value, key, {
      value: selected.value, writable: true, enumerable: true, configurable: true,
    });
  }
  return { value, conflicts };
}
