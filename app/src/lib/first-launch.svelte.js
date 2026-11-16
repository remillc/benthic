// @ts-check
// The state of the release edition's first launch (task 2026-11-15-218): the stack of steps shown,
// the logbook's name, what is being imported, the cloud service. The steps and their order are in
// first-launch-steps.js (pure); this file holds them as reactive state for the screens. The blue
// panel does not read it: it stays as it is on every step.
import { back, backToName, forward, importRead } from './first-launch-steps.js';
import { t } from './i18n.js';

/** @typedef {import('./first-launch-steps.js').Step} Step */
/** @typedef {import('./import-summary.js').ImportSummary} ImportSummary */

/**
 * What the diver brings: a picked file, or the divelogs.de logbook downloaded into the app's cache.
 * @typedef {{ kind: 'file', file: File, name: string, summary: ImportSummary, csv?: { params: import('opendives-core').CsvParams, companion: File|null } }
 *   | { kind: 'divelogs', path: string, name: string, summary: ImportSummary }} ImportSource
 */

/**
 * A logbook found in the cloud account (« Choisissez votre carnet »).
 * @typedef {{ id: string, name: string, dives: number, changed: string }} FoundLogbook
 */

export const flow = $state({
  /** @type {Step[]} */
  stack: /** @type {Step[]} */ (['start']),
  /** The way the last move went, for the transition: the column slides the other way on « Retour ». */
  direction: /** @type {'forward'|'back'} */ ('forward'),
  /** The logbook's name (the field of « Nouveau carnet »). */
  name: t('welcomeSteps.defaultName'),
  /** Key of the cloud service chosen (CLOUD_SERVICES). */
  service: '',
  /** The cloud account connected (idea #74: always empty until the cloud is built). */
  account: '',
  /** @type {FoundLogbook[]} */
  found: [],
  /** @type {ImportSource|null} */
  source: null,
  /** The divelogs.de form and its progress; the password is cleared as soon as it is used. */
  divelogs: { user: '', password: '', total: 0, done: 0, phase: /** @type {'download'|'read'} */ ('download'), error: '' },
});

/** @returns {Step} */
export function currentStep() {
  return flow.stack[flow.stack.length - 1];
}

/** @param {string} choice a key of FORWARD in first-launch-steps.js */
export function go(choice) {
  flow.direction = 'forward';
  flow.stack = forward(flow.stack, choice);
}

/** « Retour »: one step back, the transition played backwards. */
export function goBack() {
  flow.direction = 'back';
  flow.stack = back(flow.stack);
}

/** The pencil of the page title: back to the field of the logbook's name. */
export function editName() {
  flow.direction = 'back';
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

/** Forgets what was typed or brought (the first launch closes, or the diver starts over). */
export function resetFlow() {
  flow.stack = ['start'];
  flow.direction = 'forward';
  flow.name = t('welcomeSteps.defaultName');
  flow.service = '';
  flow.account = '';
  flow.found = [];
  flow.source = null;
  Object.assign(flow.divelogs, { user: '', password: '', total: 0, done: 0, phase: 'download', error: '' });
}

// Development builds only: lets a headless check put the first launch in any state.
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__firstLaunch = flow;
