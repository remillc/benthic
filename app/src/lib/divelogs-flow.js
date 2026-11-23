// @ts-check
// The states of the « Envoyer vers divelogs.de » dialogs (task 2026-11-23-337), apart from the screen so that they can be
// tested: what an error of the upload leads to, and the steps of the progress card.

/** @typedef {{ phase: 'login'|'send', kind: 'network'|'server' }} UploadFailure */

/**
 * Where an error of the upload leads. Refused credentials bring the connection dialog back with its password field in error;
 * anything else stays on the progress dialog, with the failed step and « Réessayer ». A token refused during the sending
 * (the account was changed meanwhile) is a refusal of the sending, not of the credentials.
 * @param {string|undefined} code the error's code (divelogs-upload.js)
 * @param {boolean} signedIn divelogs.de had accepted the credentials
 * @returns {{ to: 'none' } | { to: 'connect' } | { to: 'progress', failure: UploadFailure }}
 */
export function outcomeOf(code, signedIn) {
  if (code === 'CANCELLED') return { to: 'none' };
  if (code === 'LOGIN_FAILED' && !signedIn) return { to: 'connect' };
  return { to: 'progress', failure: { phase: signedIn ? 'send' : 'login', kind: code === 'NETWORK' ? 'network' : 'server' } };
}

/**
 * The two steps of the progress card. The third step of the first launch's card, « Vérification par divelogs.de », does not
 * exist here: divelogs.de answers each request with a status and nothing else, so there is nothing to check afterwards.
 * @param {{ failure: UploadFailure|null, signedIn: boolean, account: string, done: number, total: number }} state
 * @param {(key: string, params?: Record<string, any>) => string} t
 * @returns {{ state: 'done'|'current'|'waiting'|'failed', name: string, detail?: string, progress?: { done: number, total: number, count: string } }[]}
 */
export function progressSteps({ failure, signedIn, account, done, total }, t) {
  const phase = failure?.phase;
  const network = failure?.kind === 'network';
  const detail = failure ? t(`divelogsUpload.${network ? (phase === 'login' ? 'unreachableDetail' : 'interruptedDetail') : 'refusedDetail'}`, { done, total }) : '';
  return [
    phase === 'login'
      ? { state: 'failed', name: t(`divelogsUpload.${network ? 'unreachable' : 'refused'}`), detail }
      : { state: signedIn ? 'done' : 'current', name: t('divelogsUpload.stepConnect'), ...(signedIn ? { detail: t('divelogsUpload.stepAccount', { user: account }) } : {}) },
    phase === 'send'
      ? { state: 'failed', name: t(`divelogsUpload.${network ? 'interrupted' : 'refused'}`), detail }
      : signedIn
        ? { state: 'current', name: t('divelogsUpload.stepSend'), progress: { done, total, count: t('divelogsUpload.count', { done, total }) } }
        : { state: 'waiting', name: t('divelogsUpload.stepSend') },
  ];
}
