// @ts-check
// « Mon profil de plongeur » (OpenDives+, task 2026-11-18-272): the Informations (date of birth, emergency contact,
// blood group) and the certification cards, in the same local store as the equipment (lib/file-store.js), in the
// layout of the OpenDives logbook (docs/architecture.md, section 11.3):
//   profile/diver.json          plain: dateOfBirth; sealed block `enc`: emergencyContact, bloodGroup
//   certifications/<uuid>.json  the whole payload sealed: agency, level, number, issuedOn, instructor, photos
//   documents/<hash>.json       one sealed card photo, named by the hash of its ciphertext (section 11.6)
//   meta/health-consent.json    this device's copy of the health-data consent (the account holds the original)
// Sensitive data is sealed on the device (lib/secret-box.js, section 11.5). The blood group is a health datum: it is
// kept only while the consent is given, and withdrawing the consent deletes it. Unknown fields of a file are kept.

import { newId, ReadOnlyError } from './inventory.js';
import { fromBase64 } from './secret-box.js';
import { countryOf, nationalDigits } from './phone-format.js';

/** @typedef {import('./file-store.js').FileStore} FileStore */
/** @typedef {import('./secret-box.js').SecretBox} SecretBox */

/** The blood groups of the menu, after « Inconnu » (the minus sign is U+2212, as in the mock-up). */
export const BLOOD_GROUPS = ['O−', 'O+', 'A−', 'A+', 'B−', 'B+', 'AB−', 'AB+'];

/** « Inconnu » is a value that can be saved: the diver does not know the group. */
export const UNKNOWN_BLOOD = 'unknown';

/**
 * @typedef {Object} DiverInfo
 * @property {string} dateOfBirth YYYY-MM-DD, '' when none
 * @property {{ name: string, relation: string, phone: { country: string, number: string } }} emergency
 * @property {string} bloodGroup '' when none, `UNKNOWN_BLOOD`, or one of BLOOD_GROUPS
 */

/** @returns {DiverInfo} */
export const emptyInfo = () => ({ dateOfBirth: '', emergency: { name: '', relation: '', phone: { country: 'CA', number: '' } }, bloodGroup: '' });

/** Thrown when the blood group is saved while the consent is off. */
export class ConsentRequiredError extends Error {
  constructor() {
    super('HEALTH_CONSENT_REQUIRED');
    this.name = 'ConsentRequiredError';
  }
}

/** @param {string} d YYYY-MM-DD */
const realDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/**
 * What is wrong with the information typed, for live validation.
 * @param {DiverInfo} info
 * @param {string} [today] YYYY-MM-DD
 * @returns {{ dateOfBirth?: 'date'|'future', phone?: 'incomplete', bloodGroup?: 'unknown' }}
 */
export function infoProblems(info, today = new Date().toISOString().slice(0, 10)) {
  /** @type {{ dateOfBirth?: 'date'|'future', phone?: 'incomplete', bloodGroup?: 'unknown' }} */
  const out = {};
  const d = info.dateOfBirth.trim();
  if (d && !realDate(d)) out.dateOfBirth = 'date';
  else if (d && d > today) out.dateOfBirth = 'future';
  const digits = nationalDigits(info.emergency.phone.number, info.emergency.phone.country);
  if (digits && digits.length !== countryOf(info.emergency.phone.country).length) out.phone = 'incomplete';
  if (info.bloodGroup && info.bloodGroup !== UNKNOWN_BLOOD && !BLOOD_GROUPS.includes(info.bloodGroup)) out.bloodGroup = 'unknown';
  return out;
}

/** The agencies of the menu with a tone for their name. */
export const AGENCIES = /** @type {const} */ ([
  { id: 'PADI', tone: 'blue' },
  { id: 'SSI', tone: 'green' },
  { id: 'NAUI', tone: 'amber' },
  { id: 'CMAS', tone: 'violet' },
  { id: 'FFESSM', tone: 'blue' },
  { id: 'BSAC', tone: 'green' },
  { id: 'SDI', tone: 'amber' },
  { id: 'TDI', tone: 'violet' },
  { id: 'IANTD', tone: 'blue' },
  { id: 'GUE', tone: 'green' },
  { id: 'PDIC', tone: 'amber' },
  { id: 'ACUC', tone: 'violet' },
  { id: 'other', tone: 'neutral' },
]);

/** The levels suggested for an agency (the field stays free text). @type {Record<string, string[]>} */
export const LEVEL_SUGGESTIONS = {
  PADI: ['Open Water Diver', 'Advanced Open Water Diver', 'Rescue Diver', 'Rescue Diver, Emergency First Response', 'Enriched Air Diver (Nitrox)', 'Deep Diver', 'Divemaster', 'Master Scuba Diver', 'Tec 40', 'Tec 45', 'Tec 50'],
  SSI: ['Open Water Diver', 'Advanced Adventurer', 'Advanced Open Water Diver', 'Stress & Rescue (Sauveteur)', 'Enriched Air Nitrox', 'Deep Diving', 'Divemaster', 'Master Diver'],
  NAUI: ['Scuba Diver', 'Advanced Scuba Diver', 'Rescue Scuba Diver', 'Master Scuba Diver', 'Enriched Air Nitrox', 'Divemaster'],
  CMAS: ['1 star diver', '2 star diver', '3 star diver', 'Instructor 1 star'],
  FFESSM: ['Niveau 1', 'Niveau 2', 'Niveau 3', 'Niveau 4', 'Plongeur Nitrox', 'Plongeur Nitrox confirmé', 'Initiateur', 'MF1', 'MF2'],
  BSAC: ['Ocean Diver', 'Sport Diver', 'Dive Leader', 'Advanced Diver', 'First Class Diver'],
  SDI: ['Open Water Scuba Diver', 'Advanced Diver', 'Rescue Diver', 'Solo Diver', 'Nitrox Diver'],
  TDI: ['Nitrox Diver', 'Advanced Nitrox Diver', 'Decompression Procedures', 'Extended Range', 'Trimix Diver'],
  IANTD: ['Open Circuit Nitrox', 'Advanced Nitrox', 'Technical Decompression', 'Normoxic Trimix'],
  GUE: ['Fundamentals', 'Recreational Diver 1', 'Recreational Diver 2', 'Tech 1', 'Tech 2'],
  PDIC: ['Open Water Diver', 'Advanced Diver', 'Rescue Diver'],
  ACUC: ['Open Water Diver', 'Advanced Diver', 'Rescue Diver'],
  other: [],
};

/**
 * The suggestions for what is typed in « Niveau »: the agency's levels that contain the text, the exact one dropped.
 * @param {string} agency @param {string} text
 * @returns {string[]}
 */
export function levelSuggestions(agency, text) {
  const q = text.trim().toLocaleLowerCase();
  const all = LEVEL_SUGGESTIONS[agency] ?? [];
  return all.filter((l) => l.toLocaleLowerCase() !== q && (!q || l.toLocaleLowerCase().includes(q)));
}

/**
 * One card, as the screens hold it.
 * @typedef {Object} Certification
 * @property {string} id
 * @property {string} agency an AGENCIES id
 * @property {string} agencyName the agency's name when it is « other »
 * @property {string} level
 * @property {string} number
 * @property {string} issuedOn YYYY-MM-DD
 * @property {string} instructor
 * @property {{ hash: string, mime: string, size: number, side: 'front'|'back' }[]} documents
 * @property {string} updatedAt
 */

/**
 * What is wrong with a card, for live validation.
 * @param {{ agency: string, level: string, number: string, issuedOn: string }} f
 * @param {string} [today]
 * @returns {{ agency?: 'empty', level?: 'empty', number?: 'empty', issuedOn?: 'date'|'future' }}
 */
export function certificationProblems(f, today = new Date().toISOString().slice(0, 10)) {
  /** @type {{ agency?: 'empty', level?: 'empty', number?: 'empty', issuedOn?: 'date'|'future' }} */
  const out = {};
  if (!f.agency) out.agency = 'empty';
  if (!f.level.trim()) out.level = 'empty';
  if (!f.number.trim()) out.number = 'empty';
  const d = f.issuedOn.trim();
  if (d && !realDate(d)) out.issuedOn = 'date';
  else if (d && d > today) out.issuedOn = 'future';
  return out;
}

/** @param {Uint8Array} bytes @returns {Promise<string>} */
async function sha256Hex(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The profile over a FileStore and a secret box.
 * @param {FileStore} store
 * @param {SecretBox} box
 * @param {{ now?: () => Date, id?: () => string }} [deps]
 */
export function createProfile(store, box, { now = () => new Date(), id = newId } = {}) {
  const stamp = () => now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const DIVER = 'profile/diver.json';
  const CONSENT = 'meta/health-consent.json';

  /** Same rules as the inventory: refused while read only, and recorded as not sent yet. @param {[string, unknown][]} writes @param {string[]} [removes] */
  async function commit(writes, removes = []) {
    if ((await store.read('meta/state.json'))?.readOnlyFrom) throw new ReadOnlyError();
    const pending = (await store.read('meta/pending.json')) ?? { format: 1, paths: [] };
    const paths = new Set(/** @type {string[]} */ (pending.paths));
    for (const [p] of writes) paths.add(p);
    for (const p of removes) paths.add(p);
    await store.batch({ writes: [...writes, ['meta/pending.json', { ...pending, format: 1, paths: [...paths].sort() }]], removes });
  }

  /** @returns {Promise<{ consent: boolean, at: string, synced: boolean }>} */
  async function readConsent() {
    const c = await store.read(CONSENT);
    return { consent: c?.consent === true, at: typeof c?.at === 'string' ? c.at : '', synced: c?.synced !== false };
  }

  /** The sealed block of the diver file, opened; {} when none or unreadable. @returns {Promise<any>} */
  async function readSealed() {
    const file = await store.read(DIVER);
    if (!file?.enc) return {};
    try {
      return await box.open(file.enc, { id: 'profile', format: 1 });
    } catch {
      return {};
    }
  }

  const api = {
    readConsent,

    /**
     * Records the consent (or its withdrawal) on this device. Withdrawing deletes the blood group at once.
     * @param {boolean} on
     * @param {{ at?: string, synced?: boolean }} [options] `at`: the date the account gives; `synced`: false until the account has it
     * @returns {Promise<{ consent: boolean, at: string, synced: boolean }>}
     */
    async setConsent(on, { at, synced = false } = {}) {
      const prev = await readConsent();
      const next = { consent: on, at: on ? (at ?? (prev.consent && prev.at ? prev.at : stamp())) : '', synced };
      await store.write(CONSENT, { format: 1, ...next });
      if (!on) await api.deleteBloodGroup();
      return next;
    },

    /** The consent state came back from the account: keep it as the device's copy. @param {{ consent: boolean, at: string }} account */
    async adoptConsent(account) {
      await store.write(CONSENT, { format: 1, consent: account.consent, at: account.consent ? account.at : '', synced: true });
      if (!account.consent) await api.deleteBloodGroup();
    },

    /** Removes the blood group from the sealed block; the rest of the file stays. */
    async deleteBloodGroup() {
      const file = await store.read(DIVER);
      if (!file?.enc) return;
      const sealed = await readSealed();
      if (!('bloodGroup' in sealed)) return;
      const rest = { ...sealed };
      delete rest.bloodGroup;
      const enc = await box.seal(rest, { id: 'profile', format: 1 });
      await commit([[DIVER, { ...file, enc, updatedAt: stamp() }]]);
    },

    /** @returns {Promise<DiverInfo>} */
    async readInfo() {
      const file = await store.read(DIVER);
      const sealed = await readSealed();
      const consent = (await readConsent()).consent;
      const info = emptyInfo();
      info.dateOfBirth = typeof file?.dateOfBirth === 'string' ? file.dateOfBirth : '';
      const e = sealed.emergencyContact;
      if (e) info.emergency = { name: e.name ?? '', relation: e.relation ?? '', phone: { country: e.phone?.country ?? 'CA', number: e.phone?.number ?? '' } };
      info.bloodGroup = consent && typeof sealed.bloodGroup === 'string' ? sealed.bloodGroup : '';
      return info;
    },

    /**
     * Saves the information. The blood group is refused (ConsentRequiredError) while the consent is off, unless it
     * is empty.
     * @param {DiverInfo} info
     */
    async saveInfo(info) {
      const problems = infoProblems(info, now().toISOString().slice(0, 10));
      if (Object.keys(problems).length) throw new Error(`INVALID_INFO:${Object.keys(problems).join(',')}`);
      if (info.bloodGroup && !(await readConsent()).consent) throw new ConsentRequiredError();
      const file = (await store.read(DIVER)) ?? { format: 1 };
      const sealed = await readSealed();
      const phone = { country: info.emergency.phone.country, number: nationalDigits(info.emergency.phone.number, info.emergency.phone.country) };
      const next = {
        ...sealed,
        emergencyContact: { name: info.emergency.name.trim(), relation: info.emergency.relation.trim(), phone },
      };
      if (info.bloodGroup) next.bloodGroup = info.bloodGroup;
      else delete next.bloodGroup;
      const restOfFile = { ...file };
      delete restOfFile.dateOfBirth;
      const dob = info.dateOfBirth.trim();
      await commit([[DIVER, { ...restOfFile, format: 1, ...(dob ? { dateOfBirth: dob } : {}), enc: await box.seal(next, { id: 'profile', format: 1 }), updatedAt: stamp() }]]);
    },

    // ---- Certification cards ----

    /** @returns {Promise<Certification[]>} newest first */
    async listCertifications() {
      const out = [];
      for (const file of await store.readAll('certifications/')) {
        const c = await api.openCertification(file);
        if (c) out.push(c);
      }
      return out.sort((a, b) => (b.issuedOn || '').localeCompare(a.issuedOn || '') || b.updatedAt.localeCompare(a.updatedAt));
    },

    /** @param {any} file @returns {Promise<Certification|null>} */
    async openCertification(file) {
      if (!file?.enc || typeof file.id !== 'string') return null;
      try {
        const p = await box.open(file.enc, { id: file.id, format: file.format ?? 1 });
        return {
          id: file.id,
          agency: p.agency ?? '',
          agencyName: p.agencyName ?? '',
          level: p.level ?? '',
          number: p.number ?? '',
          issuedOn: p.issuedOn ?? '',
          instructor: p.instructor ?? '',
          documents: Array.isArray(p.documents) ? p.documents : [],
          updatedAt: file.updatedAt ?? '',
        };
      } catch {
        return null;
      }
    },

    /** @param {string} certId @returns {Promise<Certification|null>} */
    async getCertification(certId) {
      return api.openCertification(await store.read(`certifications/${certId}.json`));
    },

    /**
     * Creates a card (no `id`) or changes one. `photos`: new card photos (JPEG bytes) by side; a side given with
     * `null` removes the photo of that side.
     * @param {{ id?: string, agency: string, agencyName?: string, level: string, number: string, issuedOn?: string, instructor?: string, photos?: { front?: Uint8Array|null, back?: Uint8Array|null } }} f
     * @returns {Promise<Certification>}
     */
    async saveCertification(f) {
      const problems = certificationProblems({ agency: f.agency, level: f.level, number: f.number, issuedOn: f.issuedOn ?? '' }, now().toISOString().slice(0, 10));
      if (Object.keys(problems).length) throw new Error(`INVALID_CERTIFICATION:${Object.keys(problems).join(',')}`);
      const existingFile = f.id ? await store.read(`certifications/${f.id}.json`) : null;
      const existing = existingFile ? await api.openCertification(existingFile) : null;
      const certId = existing?.id ?? id();
      let documents = existing?.documents ?? [];
      /** @type {[string, unknown][]} */
      const writes = [];
      /** @type {string[]} */
      const removes = [];
      for (const side of /** @type {const} */ (['front', 'back'])) {
        const bytes = f.photos?.[side];
        if (bytes === undefined) continue;
        for (const old of documents.filter((d) => d.side === side)) removes.push(`documents/${old.hash}.json`);
        documents = documents.filter((d) => d.side !== side);
        if (bytes) {
          const sealed = await box.sealBytes(bytes, { id: certId, format: 1 });
          const hash = await sha256Hex(fromBase64(sealed.ct));
          writes.push([`documents/${hash}.json`, { format: 1, enc: sealed }]);
          documents.push({ hash, mime: 'image/jpeg', size: bytes.length, side });
        }
      }
      const payload = {
        agency: f.agency,
        ...(f.agency === 'other' && f.agencyName?.trim() ? { agencyName: f.agencyName.trim() } : {}),
        level: f.level.trim(),
        number: f.number.trim(),
        ...(f.issuedOn?.trim() ? { issuedOn: f.issuedOn.trim() } : {}),
        ...(f.instructor?.trim() ? { instructor: f.instructor.trim() } : {}),
        documents,
      };
      const file = { ...(existingFile ?? { format: 1, createdAt: stamp() }), id: certId, updatedAt: stamp(), enc: await box.seal(payload, { id: certId, format: existingFile?.format ?? 1 }) };
      await commit([...writes, [`certifications/${certId}.json`, file]], removes);
      return /** @type {Certification} */ (await api.openCertification(file));
    },

    /** @param {string} certId */
    async deleteCertification(certId) {
      const c = await api.getCertification(certId);
      await commit([], [`certifications/${certId}.json`, ...(c?.documents ?? []).map((d) => `documents/${d.hash}.json`)]);
    },

    /** One card photo, decrypted. @param {string} certId @param {string} hash @returns {Promise<Uint8Array|null>} */
    async readPhoto(certId, hash) {
      const file = await store.read(`documents/${hash}.json`);
      if (!file?.enc) return null;
      try {
        return await box.openBytes(file.enc, { id: certId, format: 1 });
      } catch {
        return null;
      }
    },
  };
  return api;
}

/** @typedef {ReturnType<typeof createProfile>} Profile */
