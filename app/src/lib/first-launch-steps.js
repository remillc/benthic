// @ts-check
// The steps of the release edition's first launch (task 2026-11-15-218) as a small machine: the
// stack of steps shown, one push per « forward », one pop per « Retour ». Pure, so that node:test
// can check the order of every path.
//
// Paths:
//   start → new → where (cloud: cloudService → cloudConnect → cloudConnected | webdav | git | device)
//   start → import → (file | importDivelogs → importProgress) → importNew → where as above
//   start → open → (openCloudService → openCloudConnect → openCloudConnected → openChoose | openWebdav | openGit)
//
// The connection to a cloud service (« Se connecter », in progress, refused) is not a step: it is the
// state of the connect step (lib/cloud-connection.js), so that « Retour » leaves it in one move.

/**
 * @typedef {'start'|'new'|'cloudService'|'cloudConnect'|'cloudConnected'|'webdav'|'git'
 *   |'import'|'importDivelogs'|'importProgress'|'importNew'
 *   |'open'|'openCloudService'|'openCloudConnect'|'openCloudConnected'|'openChoose'|'openWebdav'|'openGit'} Step
 */

/** The steps that hold the name field: the pencil of the later steps goes back to the last of them. */
const NAME_STEPS = /** @type {Step[]} */ (['new', 'importNew']);

/** The steps after the name, where the logbook's name is the page title. */
const TITLED_STEPS = /** @type {Step[]} */ (['cloudService', 'cloudConnect', 'cloudConnected', 'webdav', 'git']);

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
  'cloudService:webdav': 'webdav',
  'cloudConnect:connected': 'cloudConnected',
  'import:divelogs': 'importDivelogs',
  'importDivelogs:submit': 'importProgress',
  'import:file': 'importNew',
  'open:cloud': 'openCloudService',
  'open:git': 'openGit',
  'openCloudService:service': 'openCloudConnect',
  'openCloudService:webdav': 'openWebdav',
  'openCloudConnect:connected': 'openCloudConnected',
  'openCloudConnected:list': 'openChoose',
  'openChoose:createHere': 'cloudConnected',
  'webdav:openLink': 'open',
  'git:openLink': 'open',
  'openGit:createLink': 'new',
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
 * « Changer de compte » of « Aucun carnet dans ce compte »: back to the given step, when it is in the stack.
 * @param {Step[]} stack
 * @param {Step} step
 * @returns {Step[]}
 */
export function backToStep(stack, step) {
  const at = stack.lastIndexOf(step);
  return at >= 0 ? stack.slice(0, at + 1) : stack;
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
 * Whether the step shows a « Retour »: not the first screen, not the running import (it has « Annuler »). The
 * first screen has one when the first launch was entered from the logbook's menu (« Ouvrir un autre carnet »,
 * « Nouveau carnet »): it leaves the first launch and the logbook stays as it was.
 * @param {Step} step
 * @param {boolean} [leavable] the first launch can be left
 */
export function hasBack(step, leavable = false) {
  if (step === 'start') return leavable;
  return step !== 'importProgress';
}

/**
 * The stack of the first launch entered from the logbook's menu: « Ouvrir un autre carnet » opens the « Ouvrir mon
 * carnet OpenDives » step, « Nouveau carnet » the name step, both above the first screen.
 * @param {'open'|'new'} first
 * @returns {Step[]}
 */
export function menuEntry(first) {
  return ['start', first];
}

/**
 * With exactly one logbook found the app opens it without the list.
 * @param {unknown[]} found
 * @returns {'list'|'open'|'none'}
 */
export function chooseOutcome(found) {
  return found.length === 0 ? 'none' : found.length === 1 ? 'open' : 'list';
}
