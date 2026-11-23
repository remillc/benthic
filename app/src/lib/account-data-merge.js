// @ts-check
// Three-way merge of account JSON files. Arrays are treated as single values.
import { sortedJson } from './file-store.js';

/**
 * @typedef {{ present: boolean, value?: unknown }} FieldVersion
 * @typedef {{ key: string, base: FieldVersion, ours: FieldVersion, theirs: FieldVersion }} FieldConflict
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value @returns {value is import('./secret-box.js').SealedBlock} */
function isSealedBlock(value) {
  return isObject(value) && value.v === 1 && value.alg === 'A256GCM'
    && typeof value.kid === 'string' && typeof value.nonce === 'string' && typeof value.ct === 'string';
}

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

  return mergeObjects(base, ours, theirs, ours.updatedAt, theirs.updatedAt, true);
}

/**
 * @param {Record<string, unknown>|null} base
 * @param {Record<string, unknown>} ours
 * @param {Record<string, unknown>} theirs
 * @param {unknown} oursUpdatedAt
 * @param {unknown} theirsUpdatedAt
 * @param {boolean} metadataTimestamp
 * @returns {{ value: Record<string, unknown>, conflicts: FieldConflict[] }}
 */
function mergeObjects(base, ours, theirs, oursUpdatedAt, theirsUpdatedAt, metadataTimestamp) {
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
    else if (metadataTimestamp && key === 'updatedAt' && typeof o.value === 'string' && typeof t.value === 'string'
      && Number.isFinite(Date.parse(o.value)) && Number.isFinite(Date.parse(t.value))) {
      selected = Date.parse(o.value) >= Date.parse(t.value) ? o : t;
    } else {
      const ourTime = typeof oursUpdatedAt === 'string' ? Date.parse(oursUpdatedAt) : NaN;
      const theirTime = typeof theirsUpdatedAt === 'string' ? Date.parse(theirsUpdatedAt) : NaN;
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

/**
 * Merges a profile or certification file. Only `enc` is decrypted; other fields stay in clear.
 * The sensitive conflicts are themselves sealed and use distinct authenticated data.
 * @param {Record<string, unknown>|null} base
 * @param {Record<string, unknown>|null} ours
 * @param {Record<string, unknown>|null} theirs
 * @param {import('./secret-box.js').SecretBox} box
 * @param {{ id: string, format: number }} item
 * @returns {Promise<{ value: Record<string, unknown>|null, conflicts: FieldConflict[], sealedConflicts: import('./secret-box.js').SealedBlock|null }>}
 */
export async function mergeEncryptedAccountFile(base, ours, theirs, box, item) {
  for (const file of [base, ours, theirs]) {
    if (file === null) continue;
    if (!isObject(file) || file.format !== item.format || ('id' in file && file.id !== item.id)) {
      throw new Error('INVALID_ACCOUNT_FILE');
    }
  }
  /** @param {Record<string, unknown>|null} file @returns {Promise<FieldVersion>} */
  async function decrypt(file) {
    if (file === null) return { present: false };
    const legacy = item.id === 'profile' && Object.hasOwn(file, 'dateOfBirth');
    if (!Object.hasOwn(file, 'enc') && !legacy) return { present: false };
    let value = {};
    if (Object.hasOwn(file, 'enc')) {
      if (!isSealedBlock(file.enc)) throw new Error('UNKNOWN_ENCRYPTION');
      value = await box.open(file.enc, item);
      if (!isObject(value)) throw new Error('INVALID_ENCRYPTED_DATA');
    }
    if (legacy) {
      if (typeof file.dateOfBirth !== 'string') throw new Error('INVALID_BIRTH_DATE');
      if (Object.hasOwn(value, 'dateOfBirth') && value.dateOfBirth !== file.dateOfBirth) throw new Error('CONFLICTING_BIRTH_DATE');
      if (file.dateOfBirth) value = { ...value, dateOfBirth: file.dateOfBirth };
    }
    return { present: true, value };
  }
  const [b, o, t] = await Promise.all([decrypt(base), decrypt(ours), decrypt(theirs)]);
  /** @param {Record<string, unknown>|null} file @param {FieldVersion} content */
  async function selectedFile(file, content) {
    if (file === null || item.id !== 'profile' || !Object.hasOwn(file, 'dateOfBirth')) return file;
    const { dateOfBirth, ...rest } = file;
    return { ...rest, enc: await box.seal(content.value, item) };
  }
  if (equalFile(ours, theirs)) return { value: await selectedFile(ours, o), conflicts: [], sealedConflicts: null };
  if (equalFile(base, ours)) return { value: await selectedFile(theirs, t), conflicts: [], sealedConflicts: null };
  if (equalFile(base, theirs)) return { value: await selectedFile(ours, o), conflicts: [], sealedConflicts: null };
  if (ours === null) return { value: await selectedFile(theirs, t), conflicts: [], sealedConflicts: null };
  if (theirs === null) return { value: await selectedFile(ours, o), conflicts: [], sealedConflicts: null };
  /** @param {Record<string, unknown>|null} file */
  const withoutEnc = (file) => {
    if (file === null) return null;
    const { enc, ...rest } = file;
    if (item.id === 'profile') delete rest.dateOfBirth;
    return rest;
  };
  const metadata = mergeAccountFile(withoutEnc(base), withoutEnc(ours), withoutEnc(theirs));
  if (!metadata.value) throw new Error('INVALID_ACCOUNT_FILE');

  /** @type {FieldVersion} */
  let selected;
  /** @type {FieldConflict[]} */
  let sensitiveConflicts;
  if (o.present && t.present && isObject(o.value) && isObject(t.value)) {
    if (b.present && !isObject(b.value)) throw new Error('INVALID_ENCRYPTED_DATA');
    const merged = mergeObjects(b.present && isObject(b.value) ? b.value : null, o.value, t.value, ours.updatedAt, theirs.updatedAt, false);
    selected = { present: true, value: merged.value };
    sensitiveConflicts = merged.conflicts;
  } else {
    /** @param {Record<string, unknown>|null} file @param {FieldVersion} v */
    const wrapper = (file, v) => file === null ? null : { updatedAt: file.updatedAt, ...(v.present ? { enc: v.value } : {}) };
    const merged = mergeAccountFile(wrapper(base, b), wrapper(ours, o), wrapper(theirs, t));
    selected = merged.value ? field(merged.value, 'enc') : { present: false };
    sensitiveConflicts = merged.conflicts;
  }
  if (selected.present) metadata.value.enc = await box.seal(selected.value, item);
  const sealedConflicts = sensitiveConflicts.length
    ? await box.seal(sensitiveConflicts, { id: `${item.id}:conflicts`, format: item.format })
    : null;
  return { value: metadata.value, conflicts: metadata.conflicts, sealedConflicts };
}
