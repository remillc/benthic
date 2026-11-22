// @ts-check
// « Mon profil de plongeur » (Benthic+, task 2026-11-18-272): the Informations (date of birth, emergency contact,
// blood group) and the certification cards, in the same local store as the equipment (lib/file-store.js), in the
// layout of the Benthic logbook (docs/architecture.md, section 11.3):
//   profile/diver.json          sealed block `enc`: fullName, dateOfBirth, emergencyContact, bloodGroup
//   certifications/<uuid>.json  the whole payload sealed: agency, level, number, issuedOn, instructor, photos
//   documents/<hash>.json       one sealed card photo, named by the hash of its ciphertext (section 11.6)
//   meta/health-consent.json    legacy health-data consent, retained for export
// Sensitive data is sealed on the device (lib/secret-box.js, section 11.5). Unknown fields of a file are kept.

import { newId, ReadOnlyError } from './inventory.js';
import { CERT_AGENCIES } from './cert-agencies.js';
import { CERT_LEVELS } from './cert-levels.js';
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
 * @property {string} fullName the diver's full name, '' when none (task 2026-11-19-312; sealed block, Benthic+ data)
 * @property {string} dateOfBirth YYYY-MM-DD, '' when none
 * @property {{ name: string, relation: string, phone: { country: string, number: string } }} emergency
 * @property {string} bloodGroup '' when none, `UNKNOWN_BLOOD`, or one of BLOOD_GROUPS
 */

/** @returns {DiverInfo} */
export const emptyInfo = () => ({ fullName: '', dateOfBirth: '', emergency: { name: '', relation: '', phone: { country: 'CA', number: '' } }, bloodGroup: '' });

/** The full name as it is kept: one line, single spaces, at most 80 characters. @param {string} name */
export const cleanFullName = (name) => name.trim().replace(/\s+/g, ' ').slice(0, 80);

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

/** The agencies of the menu with a tone for their name (the list and its sources: lib/cert-agencies.js). */
export const AGENCIES = CERT_AGENCIES;

/** The levels suggested for an agency (the field stays free text; the list and its sources: lib/cert-levels.js). @type {Record<string, string[]>} */
export const LEVEL_SUGGESTIONS = CERT_LEVELS;

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

/** The kinds of « Brevets et documents » (task 2026-11-19-309): a certification card, a diving insurance, a medical certificate, any other document. */
export const DOCUMENT_KINDS = /** @type {const} */ (['certification', 'insurance', 'medical', 'other']);

/** @typedef {'certification'|'insurance'|'medical'|'other'} DocumentKind */

/** The lead times of « Me prévenir avant l'expiration »: 2 weeks, 30 days, 60 days. @type {(14|30|60)[]} */
export const EXPIRY_LEAD_CHOICES = [14, 30, 60];

/**
 * A page or a side of a document: a card has a front and a back, a medical certificate has pages; a file may be a PDF.
 * @typedef {{ hash: string, mime: string, size: number, side: 'front'|'back'|'page', page?: number }} DocumentFile
 */

/**
 * One document, as the screens hold it. The name stays `Certification` for the card (the file lives in `certifications/`,
 * where cards have always been kept); the other kinds share the file and the sealed payload. Older cards have no `kind`.
 * @typedef {Object} Certification
 * @property {string} id
 * @property {DocumentKind} kind
 * @property {string} agency an AGENCIES id
 * @property {string} agencyName the agency's name when it is « other »
 * @property {string} level
 * @property {string} number the card's number; an instructor's number when `instructorCert`
 * @property {string} issuedOn YYYY-MM-DD: the card's date, the medical certificate's date
 * @property {string} instructor
 * @property {string} instructorNumber the number of the instructor who issued the card
 * @property {boolean} instructorCert « Brevet de moniteur »: `number` is used when the diver confirms another diver's dive
 * @property {string} title the name of another document
 * @property {string} expiresOn YYYY-MM-DD, '' when the document does not expire
 * @property {14|30|60} notifyDays how long before the expiry the notification comes
 * @property {string} insurer
 * @property {string} plan
 * @property {string} policyNumber
 * @property {string} emergencyPhone the number to call after a diving accident
 * @property {string} startsOn YYYY-MM-DD, an insurance's start
 * @property {string} doctor a medical certificate's doctor
 * @property {string} notes
 * @property {DocumentFile[]} documents
 * @property {string} updatedAt
 */

/** The sealed fields of a document besides the card's own (agency, level, number, issuedOn, instructor). */
const OTHER_FIELDS = /** @type {const} */ (['title', 'expiresOn', 'insurer', 'plan', 'policyNumber', 'emergencyPhone', 'startsOn', 'doctor', 'notes']);

/**
 * What is wrong with a document, for live validation. A card keeps the rules of `certificationProblems`; an insurance
 * needs its insurer and its expiry date, a medical certificate its expiry date, another document its title. A date that
 * is not a real date is wrong; an expiry in the past is allowed (the document is then « Expiré »).
 * @param {DocumentKind} kind
 * @param {Record<string, string>} f the text fields (`agency`, `level`, `number`, `issuedOn`, `title`, `insurer`, `expiresOn`, `startsOn`, `emergencyPhone`)
 * @param {string} [today]
 * @returns {Record<string, 'empty'|'date'|'future'|'order'|'phone'>}
 */
export function documentProblems(kind, f, today = new Date().toISOString().slice(0, 10)) {
  /** @type {Record<string, 'empty'|'date'|'future'|'order'|'phone'>} */
  const out = {};
  if (kind === 'certification') Object.assign(out, certificationProblems({ agency: f.agency ?? '', level: f.level ?? '', number: f.number ?? '', issuedOn: f.issuedOn ?? '' }, today));
  if (kind === 'insurance' && !(f.insurer ?? '').trim()) out.insurer = 'empty';
  if (kind === 'other' && !(f.title ?? '').trim()) out.title = 'empty';
  const checkDate = (/** @type {string} */ key, /** @type {boolean} */ required) => {
    const d = (f[key] ?? '').trim();
    if (!d) {
      if (required) out[key] = 'empty';
    } else if (!realDate(d)) out[key] = 'date';
  };
  if (kind !== 'certification') {
    checkDate('expiresOn', kind === 'insurance' || kind === 'medical');
    if (kind === 'insurance') checkDate('startsOn', false);
    if (kind === 'medical') {
      checkDate('issuedOn', false);
      const d = (f.issuedOn ?? '').trim();
      if (d && realDate(d) && d > today) out.issuedOn = 'future';
    }
    const start = (kind === 'insurance' ? f.startsOn : f.issuedOn) ?? '';
    const end = f.expiresOn ?? '';
    if (!out.expiresOn && !out.startsOn && !out.issuedOn && start && end && realDate(start) && realDate(end) && end < start) out.expiresOn = 'order';
  }
  const phone = (f.emergencyPhone ?? '').trim();
  if (kind === 'insurance' && phone && !(/^\+?[\d\s().-]{7,25}$/.test(phone) && (phone.match(/\d/g) ?? []).length >= 7)) out.emergencyPhone = 'phone';
  return out;
}

/**
 * The number that a diver who confirms another diver's dive gives: the first card marked « Brevet de moniteur » that has
 * a number, with the agency and level (task 2026-11-19-309 point 3, used by the validation of a dive, point 2).
 * @param {Certification[]} certs
 * @returns {{ number: string, agency: string, level: string }|null}
 */
export function instructorNumber(certs) {
  const c = certs.find((x) => x.kind === 'certification' && x.instructorCert && x.number.trim());
  return c ? { number: c.number.trim(), agency: c.agency === 'other' ? c.agencyName : c.agency, level: c.level } : null;
}

/** The extension of a stored file, for names. @param {string} mime */
export const fileExtension = (mime) => (mime === 'application/pdf' ? 'pdf' : 'jpg');

/**
 * What is wrong with a card, for live validation.
 * @param {{ agency: string, level: string, number?: string, issuedOn: string }} f
 * @param {string} [today]
 * @returns {{ agency?: 'empty', level?: 'empty', issuedOn?: 'date'|'future' }}
 */
export function certificationProblems(f, today = new Date().toISOString().slice(0, 10)) {
  /** @type {{ agency?: 'empty', level?: 'empty', issuedOn?: 'date'|'future' }} */
  const out = {};
  if (!f.agency) out.agency = 'empty';
  if (!f.level.trim()) out.level = 'empty';
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
    await store.trackedBatch({ writes, removes });
  }

  /** @returns {Promise<{ consent: boolean, at: string, synced: boolean }>} */
  async function readConsent() {
    const c = await store.read(CONSENT);
    return { consent: c?.consent === true, at: typeof c?.at === 'string' ? c.at : '', synced: c?.synced !== false };
  }

  /** @param {any} file @param {boolean} [strict] @returns {Promise<any>} */
  async function readSealed(file, strict = false) {
    if (!file?.enc) return {};
    try {
      return await box.open(file.enc, { id: 'profile', format: 1 });
    } catch (error) {
      if (strict) throw error;
      return {};
    }
  }

  /** Moves an old clear-text birth date into the sealed block without overwriting a concurrent edit. */
  async function migrateBirthDate() {
    for (;;) {
      const { text, value: file } = await store.readSnapshot(DIVER);
      if (!file || !Object.hasOwn(file, 'dateOfBirth')) return file;
      if (typeof file.dateOfBirth !== 'string') throw new Error('INVALID_BIRTH_DATE');
      const state = await store.readSnapshot('meta/state.json');
      if (state.value?.readOnlyFrom) throw new ReadOnlyError();
      const sealed = await readSealed(file, true);
      if (!sealed || typeof sealed !== 'object' || Array.isArray(sealed)) throw new Error('INVALID_PROFILE_DATA');
      if (Object.hasOwn(sealed, 'dateOfBirth') && sealed.dateOfBirth !== file.dateOfBirth) {
        throw new Error('CONFLICTING_BIRTH_DATE');
      }
      const next = { ...sealed };
      if (file.dateOfBirth) next.dateOfBirth = file.dateOfBirth;
      const updated = { ...file, enc: await box.seal(next, { id: 'profile', format: 1 }) };
      delete updated.dateOfBirth;
      if (await store.trackedBatchIfUnchanged([[DIVER, text], ['meta/state.json', state.text]], { writes: [[DIVER, updated]] })) return updated;
    }
  }

  const api = {
    readConsent,
    migrateBirthDate,

    /** Whether a legacy profile still has a clear-text birth date. */
    async hasClearBirthDate() {
      const file = await store.readStrict(DIVER);
      return !!file && Object.hasOwn(file, 'dateOfBirth');
    },

    /** Removes the blood group from the sealed block; the rest of the file stays. */
    async deleteBloodGroup() {
      await migrateBirthDate();
      const file = await store.readStrict(DIVER);
      if (!file?.enc) return;
      const sealed = await readSealed(file, true);
      if (!('bloodGroup' in sealed)) return;
      const rest = { ...sealed };
      delete rest.bloodGroup;
      const enc = await box.seal(rest, { id: 'profile', format: 1 });
      await commit([[DIVER, { ...file, enc, updatedAt: stamp() }]]);
    },

    /** @returns {Promise<DiverInfo>} */
    async readInfo() {
      let file = await store.readStrict(DIVER);
      if (file && Object.hasOwn(file, 'dateOfBirth') && !(await store.readStrict('meta/state.json'))?.readOnlyFrom) {
        file = await migrateBirthDate();
      }
      const sealed = await readSealed(file);
      const info = emptyInfo();
      info.dateOfBirth = typeof sealed.dateOfBirth === 'string' ? sealed.dateOfBirth : typeof file?.dateOfBirth === 'string' ? file.dateOfBirth : '';
      info.fullName = typeof sealed.fullName === 'string' ? sealed.fullName : '';
      const e = sealed.emergencyContact;
      if (e) info.emergency = { name: e.name ?? '', relation: e.relation ?? '', phone: { country: e.phone?.country ?? 'CA', number: e.phone?.number ?? '' } };
      info.bloodGroup = typeof sealed.bloodGroup === 'string' ? sealed.bloodGroup : '';
      return info;
    },

    /** Saves the information. @param {DiverInfo} info */
    async saveInfo(info) {
      const problems = infoProblems(info, now().toISOString().slice(0, 10));
      if (Object.keys(problems).length) throw new Error(`INVALID_INFO:${Object.keys(problems).join(',')}`);
      const file = (await store.readStrict(DIVER)) ?? { format: 1 };
      const sealed = await readSealed(file, true);
      const phone = { country: info.emergency.phone.country, number: nationalDigits(info.emergency.phone.number, info.emergency.phone.country) };
      const next = {
        ...sealed,
        emergencyContact: { name: info.emergency.name.trim(), relation: info.emergency.relation.trim(), phone },
      };
      if (info.bloodGroup) next.bloodGroup = info.bloodGroup;
      else delete next.bloodGroup;
      const fullName = cleanFullName(info.fullName ?? '');
      if (fullName) next.fullName = fullName;
      else delete next.fullName;
      const dob = info.dateOfBirth.trim();
      if (dob) next.dateOfBirth = dob;
      else delete next.dateOfBirth;
      const restOfFile = { ...file };
      delete restOfFile.dateOfBirth;
      await commit([[DIVER, { ...restOfFile, format: 1, enc: await box.seal(next, { id: 'profile', format: 1 }), updatedAt: stamp() }]]);
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

    /** @param {any} file @param {boolean} [strict] @returns {Promise<Certification|null>} */
    async openCertification(file, strict = false) {
      if (!file?.enc || typeof file.id !== 'string') return null;
      try {
        const p = await box.open(file.enc, { id: file.id, format: file.format ?? 1 });
        return {
          id: file.id,
          kind: DOCUMENT_KINDS.includes(p.kind) ? p.kind : 'certification',
          agency: p.agency ?? '',
          agencyName: p.agencyName ?? '',
          level: p.level ?? '',
          number: p.number ?? '',
          issuedOn: p.issuedOn ?? '',
          instructor: p.instructor ?? '',
          instructorNumber: p.instructorNumber ?? '',
          instructorCert: p.instructorCert === true,
          title: p.title ?? '',
          expiresOn: p.expiresOn ?? '',
          notifyDays: EXPIRY_LEAD_CHOICES.includes(p.notifyDays) ? p.notifyDays : 30,
          insurer: p.insurer ?? '',
          plan: p.plan ?? '',
          policyNumber: p.policyNumber ?? '',
          emergencyPhone: p.emergencyPhone ?? '',
          startsOn: p.startsOn ?? '',
          doctor: p.doctor ?? '',
          notes: p.notes ?? '',
          documents: Array.isArray(p.documents) ? p.documents : [],
          updatedAt: file.updatedAt ?? '',
        };
      } catch (error) {
        if (strict) throw error;
        return null;
      }
    },

    /** @param {string} certId @returns {Promise<Certification|null>} */
    async getCertification(certId) {
      return api.openCertification(await store.read(`certifications/${certId}.json`));
    },

    /**
     * Creates a card (no `id`) or changes one. `photos`: new card photos (JPEG bytes) by side; a side given with
     * `null` removes the photo of that side. The other fields of a document are kept as they are.
     * @param {{ id?: string, agency: string, agencyName?: string, level: string, number?: string, issuedOn?: string, instructor?: string, instructorNumber?: string, instructorCert?: boolean, photos?: { front?: Uint8Array|null, back?: Uint8Array|null } }} f
     * @returns {Promise<Certification>}
     */
    async saveCertification(f) {
      return api.saveDocument({ ...f, kind: 'certification' });
    },

    /**
     * Creates a document (no `id`) or changes one (task 2026-11-19-309): a card, an insurance, a medical certificate, another
     * document. `files` is the final list of its files: an item with a `hash` is a file already kept, one with `bytes` is
     * new (a JPEG, or a PDF with `mime`); a kept file that is not in the list is removed. Without `files`, `photos` (by
     * side) works as in `saveCertification` and the other files stay.
     * @param {{ id?: string, kind: DocumentKind, agency?: string, agencyName?: string, level?: string, number?: string, issuedOn?: string, instructor?: string, instructorNumber?: string, instructorCert?: boolean, title?: string, expiresOn?: string, notifyDays?: number, insurer?: string, plan?: string, policyNumber?: string, emergencyPhone?: string, startsOn?: string, doctor?: string, notes?: string, photos?: { front?: Uint8Array|null, back?: Uint8Array|null }, files?: { side: 'front'|'back'|'page', page?: number, hash?: string, bytes?: Uint8Array, mime?: string }[] }} f
     * @returns {Promise<Certification>}
     */
    async saveDocument(f) {
      const kind = DOCUMENT_KINDS.includes(f.kind) ? f.kind : 'certification';
      const problems = documentProblems(kind, { ...f, agency: f.agency ?? '', level: f.level ?? '', number: f.number ?? '' }, now().toISOString().slice(0, 10));
      if (Object.keys(problems).length) throw new Error(`INVALID_CERTIFICATION:${Object.keys(problems).join(',')}`);
      const existingFile = f.id ? await store.readStrict(`certifications/${f.id}.json`) : null;
      const existing = existingFile ? await api.openCertification(existingFile, true) : null;
      if (existingFile && !existing) throw new Error('INVALID_CERTIFICATION_FILE');
      const certId = existing?.id ?? id();
      const before = existing?.documents ?? [];
      /** The list to keep or to write, before sealing. @type {{ side: 'front'|'back'|'page', page?: number, hash?: string, bytes?: Uint8Array, mime?: string }[]} */
      let wanted;
      if (f.files) wanted = f.files;
      else {
        wanted = before.map((d) => ({ side: d.side, ...(d.page ? { page: d.page } : {}), hash: d.hash }));
        for (const side of /** @type {const} */ (['front', 'back'])) {
          const bytes = f.photos?.[side];
          if (bytes === undefined) continue;
          wanted = wanted.filter((d) => d.side !== side);
          if (bytes) wanted.push({ side, bytes, mime: 'image/jpeg' });
        }
      }
      /** @type {[string, unknown][]} */
      const writes = [];
      /** @type {DocumentFile[]} */
      const documents = [];
      for (const w of wanted) {
        if (w.hash) {
          const kept = before.find((d) => d.hash === w.hash);
          if (kept) documents.push({ ...kept, side: w.side, ...(w.page ? { page: w.page } : {}) });
        } else if (w.bytes) {
          const mime = w.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
          const sealed = await box.sealBytes(w.bytes, { id: certId, format: 1 });
          const hash = await sha256Hex(fromBase64(sealed.ct));
          writes.push([`documents/${hash}.json`, { format: 1, enc: sealed }]);
          documents.push({ hash, mime, size: w.bytes.length, side: w.side, ...(w.page ? { page: w.page } : {}) });
        }
      }
      const keptHashes = new Set(documents.map((d) => d.hash));
      const removes = before.filter((d) => !keptHashes.has(d.hash)).map((d) => `documents/${d.hash}.json`);
      const text = (/** @type {string|undefined} */ v) => (v ?? '').trim();
      const card = kind === 'certification';
      const payload = {
        ...(card ? {} : { kind }),
        ...(card
          ? {
              agency: f.agency,
              ...(f.agency === 'other' && text(f.agencyName) ? { agencyName: text(f.agencyName) } : {}),
              level: text(f.level),
              number: text(f.number),
              ...(text(f.instructor) ? { instructor: text(f.instructor) } : {}),
              ...(text(f.instructorNumber) ? { instructorNumber: text(f.instructorNumber) } : {}),
              ...(f.instructorCert ? { instructorCert: true } : {}),
            }
          : {}),
        ...(text(f.issuedOn) ? { issuedOn: text(f.issuedOn) } : {}),
        ...Object.fromEntries(OTHER_FIELDS.filter((k) => !card && text(f[k])).map((k) => [k, text(f[k])])),
        ...(!card && text(f.expiresOn) && EXPIRY_LEAD_CHOICES.includes(/** @type {any} */ (f.notifyDays)) ? { notifyDays: f.notifyDays } : {}),
        documents,
      };
      const file = { ...(existingFile ?? { format: 1, createdAt: stamp() }), id: certId, updatedAt: stamp(), enc: await box.seal(payload, { id: certId, format: existingFile?.format ?? 1 }) };
      await commit([...writes, [`certifications/${certId}.json`, file]], removes);
      return /** @type {Certification} */ (await api.openCertification(file));
    },

    /** @param {string} certId */
    async deleteCertification(certId) {
      const file = await store.readStrict(`certifications/${certId}.json`);
      const c = file ? await api.openCertification(file, true) : null;
      if (file && !c) throw new Error('INVALID_CERTIFICATION_FILE');
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
