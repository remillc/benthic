// @ts-check
// The steps of the release edition's first launch (task 2026-11-15-218) as a small machine: the
// stack of steps shown, one push per « forward », one pop per « Retour ». Pure, so that node:test
// can check the order of every path.
//
// Paths:
//   start → new → where (cloud: cloudService → cloudConnect → cloudConnected | git | device)
//   start → import → (file | importDivelogs → importProgress) → importNew → where as above
//   start → open → (openCloudService → openCloudConnect → openCloudConnected → openChoose | openGit)

/**
 * @typedef {'start'|'new'|'cloudService'|'cloudConnect'|'cloudConnected'|'git'
 *   |'import'|'importDivelogs'|'importProgress'|'importNew'
 *   |'open'|'openCloudService'|'openCloudConnect'|'openCloudConnected'|'openChoose'|'openGit'} Step
 */

/** The steps that hold the name field: the pencil of the later steps goes back to the last of them. */
const NAME_STEPS = /** @type {Step[]} */ (['new', 'importNew']);

/** The steps after the name, where the logbook's name is the page title. */
const TITLED_STEPS = /** @type {Step[]} */ (['cloudService', 'cloudConnect', 'cloudConnected', 'git']);

/** @type {Record<string, Step>} */
const FORWARD = {
  'start:create': 'new',
  'start:import': 'import',
  'start:open': 'open',
  'new:cloud': 'cloudService',
  'new:git': 'git',
  'importNew:cloud': 'cloudService',
  'importNew:git': 'git',
  'cloudService:service': 'cloudConnect',
  'cloudConnect:connected': 'cloudConnected',
  'import:divelogs': 'importDivelogs',
  'importDivelogs:submit': 'importProgress',
  'import:file': 'importNew',
  'open:cloud': 'openCloudService',
  'open:git': 'openGit',
  'openCloudService:service': 'openCloudConnect',
  'openCloudConnect:connected': 'openCloudConnected',
  'openCloudConnected:list': 'openChoose',
  'git:openLink': 'open',
};

/**
 * The step a choice leads to; undefined when the choice ends the first launch (« device », a
 * created or opened logbook) or does not exist at this step.
 * @param {Step} step
 * @param {string} choice
 * @returns {Step|undefined}
 */
export function nextStep(step, choice) {
  return FORWARD[`${step}:${choice}`];
}

/**
 * @param {Step[]} stack
 * @param {string} choice
 * @returns {Step[]} the stack with the next step pushed (unchanged when the choice leads nowhere)
 */
export function forward(stack, choice) {
  const next = nextStep(stack[stack.length - 1], choice);
  if (!next) return stack;
  return [...stack, next];
}

/**
 * « Retour »: one step back (never below the first screen).
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function back(stack) {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

/**
 * The pencil of the page title: back to the step that holds the name field.
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function backToName(stack) {
  for (let i = stack.length - 1; i >= 0; i--) if (NAME_STEPS.includes(stack[i])) return stack.slice(0, i + 1);
  return stack;
}

/**
 * The divelogs.de import is read: the form and the progress screen are left, so that « Retour »
 * from « Nouveau carnet » goes to « Importer un carnet ».
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function importRead(stack) {
  const at = stack.indexOf('importDivelogs');
  return [...(at >= 0 ? stack.slice(0, at) : stack), 'importNew'];
}

/** @param {Step} step */
export function hasLogbookTitle(step) {
  return TITLED_STEPS.includes(step);
}

/**
 * Whether the step shows a « Retour »: not the first screen, not the running import (it has « Annuler »).
 * @param {Step} step
 */
export function hasBack(step) {
  return step !== 'start' && step !== 'importProgress';
}

/**
 * With exactly one logbook found the app opens it without the list.
 * @param {unknown[]} found
 * @returns {'list'|'open'|'none'}
 */
export function chooseOutcome(found) {
  return found.length === 0 ? 'none' : found.length === 1 ? 'open' : 'list';
}
