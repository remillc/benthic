// @ts-check
// The steps of the release edition's first launch (task 2026-11-15-218) as a small machine: the
// stack of steps shown, one push per « forward », one pop per « Retour ». Pure, so that node:test
// can check the order of every path.
//
// Paths:
//   start → new (the name; « Créer le carnet » makes the logbook on the device; task 2026-11-17-263) |
//     cloudService → cloudConnect → cloudConnected | webdav | git (reached from the open and git-link paths)
//   (iCloud Drive, iPhone and macOS only: cloudService → cloudConnected, no sign-in; tasks 2026-11-16-228 and 261)
//   start → import → (file | importDivelogs → importProgress) → importNew (the name; « Importer le carnet » creates it on the device)
//   (The beta's « open » step now offers the OpenDives server only, decided on 18 November 2026: no screen sends to the
//   cloud-drive and git steps below any more; their transitions stay for the desktop paths and the tests.)
//   start → open → (openCloudService → openCloudConnect → openCloudConnected → openChoose | openWebdav | openGit)
//   open → server → serverCode → serverDownload (the OpenDives server, tasks 2026-11-16-259 and 260; its
//     e-mail step is `server`; « Le serveur ne répond pas » is `serverOffline`, over the step that failed)
//   start → signIn → odplusConnect (« Se connecter ou créer un compte ») → email → server → serverCode → a subscribed
//     account: serverDownload → odplusReady (« Votre carnet est prêt »), or createChoice when the account holds no
//     logbook (task 2026-11-17-266: createChoice → createName | createSend → createInterrupted | createOffline);
//     any other account: odplusOffer
//   start → discover → odplusOffer (« OpenDives+, l'offre ») → welcome → odplusWelcome (after a purchase) → odplusHealth (« Vos données de santé », the optional consent, task 2026-11-18-271) → odplusReady
//   Both entries (`signIn`, `discover`) are the choices of the first step; « Continuer sans compte » and
//   « Continuer sans abonnement » go back to it and create nothing (task 2026-11-17-265).
//
// The connection to a cloud service (« Se connecter », in progress, refused) is not a step: it is the
// state of the connect step (lib/cloud-connection.js), so that « Retour » leaves it in one move.

/**
 * @typedef {'start'|'new'|'cloudService'|'cloudConnect'|'cloudConnected'|'webdav'|'git'
 *   |'import'|'importDivelogs'|'importProgress'|'importNew'
 *   |'open'|'openCloudService'|'openCloudConnect'|'openCloudConnected'|'openChoose'|'openWebdav'|'openGit'
 *   |'server'|'serverCode'|'serverOffline'|'serverDownload'
 *   |'odplusConnect'|'odplusOffer'|'odplusReady'|'odplusWelcome'|'odplusHealth'
 *   |'createChoice'|'createName'|'createSend'|'createInterrupted'|'createOffline'} Step
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
  'cloudService:icloud': 'cloudConnected',
  'cloudConnect:connected': 'cloudConnected',
  'import:divelogs': 'importDivelogs',
  'importDivelogs:submit': 'importProgress',
  'import:file': 'importNew',
  'open:cloud': 'openCloudService',
  'open:git': 'openGit',
  'open:server': 'server',
  'server:code': 'serverCode',
  'server:offline': 'serverOffline',
  'serverCode:offline': 'serverOffline',
  'serverDownload:offline': 'serverOffline',
  'serverCode:session': 'serverDownload',
  'start:signIn': 'odplusConnect',
  'start:discover': 'odplusOffer',
  'odplusConnect:email': 'server',
  'odplusOffer:welcome': 'odplusWelcome',
  'odplusOffer:signIn': 'odplusConnect',
  'odplusWelcome:next': 'odplusHealth',
  'odplusHealth:next': 'odplusReady',
  'serverDownload:ready': 'odplusReady',
  'createChoice:blank': 'createName',
  'createChoice:send': 'createSend',
  'createName:offline': 'createOffline',
  'openCloudService:service': 'openCloudConnect',
  'openCloudService:webdav': 'openWebdav',
  'openCloudService:icloud': 'openCloudConnected',
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
  return !NO_BACK.includes(step);
}

/**
 * The steps with no « Retour »: a running import or download (they have « Annuler »), the upload and its two stops
 * (« Annuler l'envoi », « Reprendre l'envoi », « Revenir à l'accueil »), and the end of the OpenDives+ screens, which
 * leave through their own buttons.
 */
const NO_BACK = /** @type {Step[]} */ (['importProgress', 'serverDownload', 'createSend', 'createInterrupted', 'createOffline', 'odplusOffer', 'odplusReady', 'odplusWelcome', 'odplusHealth']);

/**
 * What the system Back (Android back key and gesture, predictive back; the iOS left-edge swipe) does on a step. It does
 * what the on-screen « Retour » does, and never goes where it must not:
 *   - the first step leaves the first launch when it was entered from the logbook's menu, else sends the app to the
 *     background (the first launch cannot be dismissed);
 *   - a step with a « Retour » goes one step back (the stack already cuts the steps that must not be re-entered: after an
 *     e-mail code the stack holds the address step, never the spent code step, see `enterCreate` and `enterOffer`);
 *   - a running import, download or upload presses its own « Annuler » (`cancel`);
 *   - the offer presses « Continuer sans abonnement » (`without`: back to the first step, nothing was created);
 *   - the end screens (purchase done, health, ready) and the stops of an upload do nothing (`ignore`): what was
 *     created or bought is not undone by a gesture.
 * @param {Step[]} stack
 * @param {boolean} fromMenu the first launch was entered from the logbook's menu
 * @returns {{ kind: 'minimize'|'leave'|'back'|'cancel'|'without'|'ignore', selector?: string }}
 */
export function systemBack(stack, fromMenu) {
  const step = stack[stack.length - 1];
  if (step === 'start') return { kind: fromMenu && stack.length === 1 ? 'leave' : 'minimize' };
  if (leavesFirstLaunch(stack, fromMenu)) return { kind: 'leave' };
  if (CANCEL_BUTTON[step]) return { kind: 'cancel', selector: CANCEL_BUTTON[step] };
  if (step === 'odplusOffer') return stack.length > 1 ? { kind: 'without' } : { kind: 'ignore' };
  if (NO_BACK.includes(step)) return { kind: 'ignore' };
  return { kind: 'back' };
}

/** The « Annuler » button of the steps that have no « Retour » (it stops what is running). */
const CANCEL_BUTTON = /** @type {Record<string, string>} */ ({
  importProgress: '.od-first-launch-divelogs--cancel',
  serverDownload: '.od-first-launch-server--cancel',
  createSend: '.od-server-create--text',
});

/**
 * A signed-in account that holds no logbook: « Aucun carnet sur votre compte ». « Retour » leaves for the address
 * step (the code is spent), not for the download.
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function enterCreate(stack) {
  return [...cutAtServer(stack), 'createChoice'];
}

/**
 * An account without a subscription: the offer, over the address step.
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function enterOffer(stack) {
  return [...cutAtServer(stack), 'odplusOffer'];
}

/** The stack up to and including its last address step; the whole stack when it has none. @param {Step[]} stack */
function cutAtServer(stack) {
  const at = stack.lastIndexOf('server');
  return at >= 0 ? stack.slice(0, at + 1) : stack;
}

/**
 * Development only (simulated Google sign-in): a subscribed account goes straight to the download, over the address step so
 * that « Retour » from « Aucun carnet sur votre compte » leaves for it, as after an e-mail code.
 * @param {Step[]} stack
 * @returns {Step[]}
 */
export function enterDownload(stack) {
  const at = stack.lastIndexOf('odplusConnect');
  const base = at >= 0 ? stack.slice(0, at + 1) : cutAtServer(stack);
  return [...base, 'server', 'serverDownload'];
}

/**
 * The top step replaced by another one (the upload and its stops follow one another without growing the stack).
 * @param {Step[]} stack
 * @param {Step} step
 * @returns {Step[]}
 */
export function replaceTop(stack, step) {
  return [...stack.slice(0, -1), step];
}

/**
 * The stack of the first launch entered from the logbook's menu: « Ouvrir un autre carnet » opens the « Ouvrir mon
 * carnet OpenDives » step, « Nouveau carnet » the name step, both above the first screen. The free account sheet
 * (task 2026-11-18-281) opens the offer (« S'abonner ») or « Se connecter ou créer un compte » (« Se connecter »).
 * @param {'open'|'new'|'offer'|'signIn'} first
 * @returns {Step[]}
 */
export function menuEntry(first) {
  if (first === 'offer') return ['start', 'odplusOffer'];
  if (first === 'signIn') return ['start', 'odplusConnect'];
  return ['start', first];
}

/**
 * Whether the offer shows « Déjà abonné ? Se connecter »: not right after a sign-in (the stack holds the address step
 * then), where the diver is already signed in (task 2026-11-18-281).
 * @param {Step[]} stack
 */
export function offerShowsSignIn(stack) {
  return !stack.includes('server');
}

/**
 * Whether « Retour » (or « Continuer sans compte ») on this stack leaves the first launch: it was entered from the
 * logbook's menu on one of the OpenDives+ screens, with nothing before it but the first screen.
 * @param {Step[]} stack
 * @param {boolean} fromMenu
 */
export function leavesFirstLaunch(stack, fromMenu) {
  return fromMenu && stack.length <= 2 && stack[0] === 'start' && (stack[1] === 'odplusOffer' || stack[1] === 'odplusConnect');
}

/**
 * With exactly one logbook found the app opens it without the list.
 * @param {unknown[]} found
 * @returns {'list'|'open'|'none'}
 */
export function chooseOutcome(found) {
  return found.length === 0 ? 'none' : found.length === 1 ? 'open' : 'list';
}
