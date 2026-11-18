// @ts-check
// The state of the release edition's first launch (task 2026-11-15-218): the stack of steps shown,
// the logbook's name, what is being imported, the cloud service. The steps and their order are in
// first-launch-steps.js (pure); this file holds them as reactive state for the screens. The blue
// panel does not read it: it stays as it is on every step.
import { back, backToName, backToStep, enterCreate, enterOffer, forward, importRead, menuEntry, replaceTop } from './first-launch-steps.js';
import { newDownloadProgress } from './first-launch-import.js';
import { t } from './i18n.js';

/** @typedef {import('./first-launch-steps.js').Step} Step */
/** @typedef {import('./import-summary.js').ImportSummary} ImportSummary */

/**
 * What the diver brings: a picked file, or the divelogs.de logbook downloaded into the app's cache.
 * @typedef {{ kind: 'file', file: File, name: string, summary: ImportSummary, csv?: { params: import('opendives-core').CsvParams, companion: File|null } }
 *   | { kind: 'divelogs', path: string, paths?: string[], name: string, summary: ImportSummary }} ImportSource
 * A resumable divelogs.de download is several files (`paths`); `path` is the first one.
 */

/**
 * A logbook found in the cloud account (« Choisissez votre carnet »).
 * @typedef {{ id: string, name: string, dives: number, changed: string }} FoundLogbook
 */

export const flow = $state({
  /** @type {Step[]} */
  stack: /** @type {Step[]} */ (['start']),
  /** Where the first launch was entered from: `'menu'` is the logbook's menu (it can be left), '' the first start. */
  origin: /** @type {''|'menu'} */ (''),
  /** The way the last move went, for the transition: the column slides the other way on « Retour ». */
  direction: /** @type {'forward'|'back'} */ ('forward'),
  /** The logbook's name (the field of « Nouveau carnet »). */
  name: t('welcomeSteps.defaultName'),
  /** Key of the cloud service chosen (CLOUD_SERVICES). */
  service: '',
  /** The connection to the cloud service chosen: not started, the browser page open, or refused (cloud-connection.js). */
  connection: /** @type {import('./cloud-connection.js').Connection} */ ('idle'),
  /** What the git step starts with: `'notEmpty'` or `'noLogbook'` shows the repository error at once (development and tests). */
  gitProblem: /** @type {''|'notEmpty'|'noLogbook'} */ (''),
  /** The WebDAV or Nextcloud form; `error` is `'unreachable'`, `'denied'` or empty. Nothing is kept: the password is cleared when used. */
  webdav: { url: '', user: '', password: '', error: '' },
  /**
   * The OpenDives server sign-in (release edition, tasks 2026-11-16-259 and 260). Only the address and the code live
   * here, and only while the screens are open; the session itself goes to the platform's secure storage.
   * `error` is what the code screen tells; `resendAt` and `lockedUntil` are times (ms) of the countdown and the lock.
   */
  server: {
    email: '',
    emailError: false,
    code: '',
    error: /** @type {''|'WRONG_CODE'|'CODE_EXPIRED'|'TOO_MANY_ATTEMPTS'} */ (''),
    resendAt: 0,
    lockedUntil: 0,
  },
  /**
   * Creating a logbook on the OpenDives server (task 2026-11-17-266). `source` is what is sent: the logbook already on
   * the device, or a Subsurface file (read by the core, then sent from it); `done` of `total` dives are on the server;
   * `deviceLogbook` is the logbook on the device (its name and dives), null when none.
   * @type {{
   *   source: ''|'device'|'file',
   *   file: File|null,
   *   name: string,
   *   total: number,
   *   done: number,
   *   deviceLogbook: { name: string, dives: number }|null,
   *   deviceReady: boolean,
   *   fresh: boolean,
   * }}
   */
  create: { source: '', file: null, name: '', total: 0, done: 0, deviceLogbook: null, deviceReady: false, fresh: false },
  /** The signed-in account of the OpenDives+ screens: the address shown on « Votre carnet est prêt » and the counts. */
  plus: { email: '', counts: { dives: 0, sites: 0, gear: 0, certifications: 0, known: true } },
  /** The cloud account connected (idea #74: always empty until the cloud is built). */
  account: '',
  /** @type {FoundLogbook[]} */
  found: [],
  /** @type {ImportSource|null} */
  source: null,
  /** The divelogs.de form and its progress; the password is cleared as soon as it is used. */
  divelogs: {
    user: '',
    password: '',
    total: 0,
    done: 0,
    phase: /** @type {'download'|'read'} */ ('download'),
    error: '',
    /** The download stopped on a lost connection with part of the dives kept (« Téléchargement interrompu »). */
    interrupted: false,
    /** What a resumable download keeps for « Reprendre » (first-launch-import.js). */
    progress: newDownloadProgress(),
  },
});

/** @returns {Step} */
export function currentStep() {
  return flow.stack[flow.stack.length - 1];
}

/** @param {string} choice a key of FORWARD in first-launch-steps.js */
export function go(choice) {
  flow.direction = 'forward';
  flow.connection = 'idle';
  flow.stack = forward(flow.stack, choice);
}

/**
 * The top step replaced by another (the upload and its stops follow one another).
 * @param {Step} step
 */
export function goReplace(step) {
  flow.direction = 'forward';
  flow.stack = replaceTop(flow.stack, step);
}

/** A signed-in account without a logbook: « Aucun carnet sur votre compte ». */
export function goCreate() {
  flow.direction = 'forward';
  flow.stack = enterCreate(flow.stack);
}

/** A signed-in account without a subscription: the offer. */
export function goOffer() {
  flow.direction = 'forward';
  flow.stack = enterOffer(flow.stack);
}

/** « Retour »: one step back, the transition played backwards. */
export function goBack() {
  flow.direction = 'back';
  flow.connection = 'idle';
  flow.stack = back(flow.stack);
}

/** « Changer de compte »: back to an earlier step of the stack. @param {Step} step */
export function goBackTo(step) {
  flow.direction = 'back';
  flow.connection = 'idle';
  flow.stack = backToStep(flow.stack, step);
}

/** The pencil of the page title: back to the field of the logbook's name. */
export function editName() {
  flow.direction = 'back';
  flow.connection = 'idle';
  flow.stack = backToName(flow.stack);
}

/**
 * The import is read: « Nouveau carnet » with its summary, the form and progress screens left behind.
 * @param {ImportSource} source
 */
export function importIsRead(source) {
  flow.source = source;
  flow.name = source.name;
  flow.direction = 'forward';
  flow.stack = importRead(flow.stack);
}

/**
 * « Ouvrir un autre carnet » and « Nouveau carnet » of the logbook's menu: the first launch opens at that step,
 * with a « Retour » on its first screen that leaves it.
 * @param {'open'|'new'} first
 */
export function enterFromMenu(first) {
  resetFlow();
  flow.origin = 'menu';
  flow.stack = menuEntry(first);
}

/** Forgets what was typed or brought (the first launch closes, or the diver starts over). */
export function resetFlow() {
  flow.origin = '';
  flow.stack = ['start'];
  flow.direction = 'forward';
  flow.name = t('welcomeSteps.defaultName');
  flow.service = '';
  flow.account = '';
  flow.connection = 'idle';
  flow.gitProblem = '';
  Object.assign(flow.webdav, { url: '', user: '', password: '', error: '' });
  Object.assign(flow.server, { email: '', emailError: false, code: '', error: '', resendAt: 0, lockedUntil: 0 });
  flow.found = [];
  flow.source = null;
  Object.assign(flow.create, { source: '', file: null, name: '', total: 0, done: 0, deviceLogbook: null, deviceReady: false, fresh: false });
  Object.assign(flow.plus, { email: '', counts: { dives: 0, sites: 0, gear: 0, certifications: 0, known: true } });
  Object.assign(flow.divelogs, { user: '', password: '', total: 0, done: 0, phase: 'download', error: '', interrupted: false, progress: newDownloadProgress() });
}

// Development builds only: lets a headless check put the first launch in any state.
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__firstLaunch = flow;
