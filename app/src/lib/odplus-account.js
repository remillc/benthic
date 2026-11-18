// @ts-check
// What « Gérer le compte » asks of the OpenDives server and of the platform (task 2026-11-18-281). Each call is one
// function; the screen calls these and nothing else.
//   - overview: how the diver signs in, the subscription (store, price, renewal) and the photo space. The server does not
//     answer `GET /v1/account` yet: the answer is `null` and the screen shows its placeholder.
//   - deleteAccount: `DELETE /v1/account`, not on the server yet: the screen shows that the account could not be deleted.
//   - downloadMyData: the full export of the logbook, the equipment and the certifications in an open format (to-do #57)
//     is not built: it answers « unavailable ».
// Nothing here stores a secret: the session token is read when needed and not kept.
import { OpenDivesCore } from 'opendives-core';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';

/** @typedef {import('./server-api.js').AccountOverview} AccountOverview */

/** @type {Pick<ReturnType<typeof createServerApi>, 'accountOverview'|'deleteAccount'>|null} */
let api = null;
/** @type {(() => Promise<string>)|null} */
let token = null;

/**
 * Replaces the server calls (the tests and the headless checks give a fake; nothing then reaches the network).
 * @param {{ api: Pick<ReturnType<typeof createServerApi>, 'accountOverview'|'deleteAccount'>, sessionToken?: () => Promise<string> }|null} fake
 */
export function useAccountApi(fake) {
  api = fake ? fake.api : null;
  token = fake?.sessionToken ?? null;
}

// Development builds only: lets a headless check give the screen a fake server.
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__accountApi = useAccountApi;

/** @returns {Pick<ReturnType<typeof createServerApi>, 'accountOverview'|'deleteAccount'>} */
function server() {
  return api ?? createServerApi({ baseUrl: serverUrl(), transport: serverTransport });
}

/** @returns {Promise<string>} '' when there is no session on this device */
async function sessionToken() {
  if (token) return token();
  try {
    return (await OpenDivesCore.serverSessionAccess()).sessionToken || '';
  } catch {
    return '';
  }
}

/**
 * @returns {Promise<AccountOverview|null>} null when the server cannot tell (no session, no route, no network)
 */
export async function loadOverview() {
  const session = await sessionToken();
  if (!session) return null;
  try {
    return await server().accountOverview(session);
  } catch {
    return null;
  }
}

/**
 * Deletes the account on the server. Throws when it could not be done.
 * @returns {Promise<void>}
 */
export async function deleteServerAccount() {
  const session = await sessionToken();
  if (!session) throw new Error('No session');
  await server().deleteAccount(session);
}

/**
 * « Télécharger mes données » (to-do #57, not built).
 * @returns {Promise<{ status: 'unavailable' }>}
 */
export async function downloadMyData() {
  return { status: 'unavailable' };
}
