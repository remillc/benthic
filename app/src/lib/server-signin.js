// @ts-check
// The rules of the OpenDives server's sign-in screens (release edition, tasks 2026-11-16-259 and 260), kept apart from
// the screens so that node:test can check them: the countdown of « Renvoyer le code », what each error does to the
// buttons, and the order of the entry points.
import { codeComplete } from './code-input.js';

/**
 * « 0:42 »: the countdown of « Renvoyer le code dans 0:42 ».
 * @param {number} seconds
 */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The minutes told by « Vous pourrez demander un nouveau code dans {minutes} minutes » (rounded up, at least 1).
 * @param {number|undefined} retryAfterSeconds from the server (600 for the 10-minute lock)
 */
export function lockMinutes(retryAfterSeconds) {
  return Math.max(1, Math.ceil((retryAfterSeconds ?? 600) / 60));
}

/**
 * What the code screen shows and allows, from the code typed, the error of the last call and the seconds before a
 * new code may be asked.
 *  - `signIn`: « Se connecter » is on screen and enabled only with all six digits;
 *  - `newCode`: an expired code or a lock replaces it with « Recevoir un nouveau code » (disabled during the lock);
 *  - `resend`: `'link'` (« Renvoyer le code »), `'countdown'` (disabled, « Renvoyer le code dans 0:42 ») or `'none'`.
 * RESEND_TOO_SOON has no message of its own: the link is disabled during the countdown, so the call is never made.
 * @param {{ code: string, error: ''|'WRONG_CODE'|'CODE_EXPIRED'|'TOO_MANY_ATTEMPTS', resendLeft: number, busy?: boolean }} state
 * @returns {{ primary: 'signIn'|'newCode', primaryDisabled: boolean, resend: 'link'|'countdown'|'none', resendDisabled: boolean }}
 */
export function codeScreen({ code, error, resendLeft, busy = false }) {
  if (error === 'TOO_MANY_ATTEMPTS') return { primary: 'newCode', primaryDisabled: true, resend: 'none', resendDisabled: true };
  if (error === 'CODE_EXPIRED') return { primary: 'newCode', primaryDisabled: busy, resend: 'none', resendDisabled: true };
  const counting = resendLeft > 0;
  return {
    primary: 'signIn',
    primaryDisabled: busy || !codeComplete(code),
    resend: counting ? 'countdown' : 'link',
    resendDisabled: counting || busy,
  };
}

/**
 * The seconds left before a new code, from a start time: one source of truth so that a timer only repaints.
 * @param {number} resendAfterSeconds the server's delay
 * @param {number} sentAt Date.now() when the code was asked
 * @param {number} now Date.now()
 */
export function resendLeft(resendAfterSeconds, sentAt, now) {
  return Math.max(0, Math.ceil(resendAfterSeconds - (now - sentAt) / 1000));
}

/**
 * The first choices of « Où est-il ? »: the OpenDives server first and highlighted, then the cloud and git. The
 * cloud row is an ordinary white row.
 * @param {'open'} list
 * @returns {{ key: 'server'|'cloud'|'git', main: boolean }[]}
 */
export function entryRows(list) {
  const rows = /** @type {{ key: 'server'|'cloud'|'git', main: boolean }[]} */ ([
    { key: 'server', main: true },
    { key: 'cloud', main: false },
    { key: 'git', main: false },
  ]);
  return rows;
}
