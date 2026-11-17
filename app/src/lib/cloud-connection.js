// @ts-check
// The connection to a cloud service on the first launch (task 2026-11-16-224, part 2): « Se connecter à
// {service} » opens the provider's page in the browser; while it is open, and when the diver comes back before the
// provider has answered, the screen says « Connexion en cours… »; a cancelled or refused connection lands on
// « Connexion non établie ». The state belongs to the connect step (not a step of its own), so that
// « Retour » leaves it in one move. Pure, so that node:test can run it.
//
// Until the personal cloud exists (idea #74) nothing opens the browser: `CLOUD_CONNECTION_AVAILABLE` is false and
// the buttons show the « coming » message. The screens are reached in development through `window.__firstLaunch`.

/** @typedef {'idle'|'waiting'|'refused'} Connection */

/** False until idea #74 is built: no provider can be reached yet. */
export const CLOUD_CONNECTION_AVAILABLE = false;

/**
 * @param {Connection} state
 * @param {'start'|'cancel'|'refused'|'connected'} event
 *   `start`: « Se connecter », « Réessayer »; `cancel`: « Annuler »; `refused`: the provider (or the diver, in the
 *   browser) said no; `connected`: the provider said yes.
 * @returns {Connection}
 */
export function connectionNext(state, event) {
  if (event === 'start') return state === 'waiting' ? state : 'waiting';
  if (state !== 'waiting') return state;
  if (event === 'cancel' || event === 'connected') return 'idle';
  if (event === 'refused') return 'refused';
  return state;
}

/**
 * « Connexion au serveur WebDAV » (idea #74): replaced by the plugin's call once the personal cloud exists. Until
 * then it rejects with `COMING`, which the screen answers with the « coming » message.
 * @param {{ url: string, user: string, password: string }} _server
 * @returns {Promise<void>}
 * @throws {Error} `COMING`; later the plugin's codes (UNREACHABLE, BAD_ADDRESS, NETWORK, LOGIN_FAILED, DENIED)
 */
export async function connectWebdav(_server) {
  throw new Error('COMING');
}

/**
 * Which field of the WebDAV form an error code belongs to: the address (« Impossible de joindre ce serveur. »),
 * or the password (« Nom d’utilisateur ou mot de passe incorrect. »).
 * @param {string} code
 * @returns {'unreachable'|'denied'|''} '' for a code the form does not tell (COMING…)
 */
export function webdavProblem(code) {
  if (code === 'UNREACHABLE' || code === 'BAD_ADDRESS' || code === 'NETWORK') return 'unreachable';
  if (code === 'LOGIN_FAILED' || code === 'DENIED') return 'denied';
  return '';
}
