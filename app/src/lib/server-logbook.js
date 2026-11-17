// @ts-check
// The download of the logbook kept on the OpenDives server (release edition, docs/architecture.md, section 11.3): a git
// repository, branch `main`, in OpenDives' own format. The git host's HTTP interface lists the branch's files and
// returns them one by one; the app keeps the small JSON files (the marker, the dives, the sites), never the samples
// and the media, which are loaded when a dive is opened. Nothing here reads the format's fields: it counts what is
// there and checks the marker, so that the screen can tell what was downloaded. Loading the files into the core is
// not built yet (the open point at the end of section 11.3).

/** The files the download brings. The samples (`profile.json`) and the media wait until a dive is opened. */
const WANTED = /^(opendives\.json|dives\/[0-9a-f]{2}\/[^/]+\/dive\.json|sites\/[^/]+\.json|trips\/[^/]+\.json|gear\/[^/]+\.json|certifications\/[^/]+\.json)$/;

/**
 * The git host's API address of a repository: `https://host/<owner>/<repo>.git` gives
 * `https://host/api/v1/repos/<owner>/<repo>`.
 * @param {string} repositoryUrl
 * @returns {string|null}
 */
export function repositoryApi(repositoryUrl) {
  try {
    const u = new URL(repositoryUrl);
    const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    return `${u.origin}/api/v1/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
  } catch {
    return null;
  }
}

/**
 * The git host's answer to the file list of a branch that does not exist yet (an empty repository): 404 or 409 on some
 * versions, 400 « sha not found » on Forgejo.
 * @param {{ status: number, text: string }} response
 * @returns {boolean}
 */
export function isEmptyBranch(response) {
  return response.status === 404 || response.status === 409 || (response.status === 400 && /not found|does not exist|empty/i.test(response.text));
}

/**
 * Whether `opendives.json` is a logbook this app can read: its kind, and a `minReader` not above the format it knows.
 * @param {any} marker the parsed file
 * @param {number} [knownFormat]
 * @returns {'ok'|'newer'|'notALogbook'}
 */
export function checkMarker(marker, knownFormat = 1) {
  if (!marker || marker.kind !== 'opendives-logbook' || !Number.isInteger(marker.format)) return 'notALogbook';
  return Number.isInteger(marker.minReader) && marker.minReader > knownFormat ? 'newer' : 'ok';
}

/**
 * @typedef {Object} DownloadedLogbook
 * @property {'ok'|'newer'|'notALogbook'|'empty'} marker
 * @property {number} dives
 * @property {number} sites
 * @property {number} trips
 * @property {number} gear
 * @property {number} certifications
 * @property {boolean} openable whether the app can load this logbook into its core: false until the open point of
 *   section 11.3 is built (the format's JSON files are not read into the core yet)
 */

/**
 * Lists the branch's files and downloads the wanted ones, reporting `done` of `total`.
 * @param {{
 *   transport: import('./server-api.js').ServerTransport,
 *   repositoryUrl: string,
 *   branch: string,
 *   token: string,
 *   onProgress?: (done: number, total: number) => void,
 *   cancelled?: () => boolean,
 * }} options
 * @returns {Promise<DownloadedLogbook>} rejects with an Error whose message is `UNREACHABLE` or `CANCELLED`
 */
export async function downloadServerLogbook({ transport, repositoryUrl, branch, token, onProgress, cancelled }) {
  const api = repositoryApi(repositoryUrl);
  if (!api) throw new Error('UNREACHABLE');
  const headers = { Authorization: `token ${token}` };
  /** @param {string} url @returns {Promise<any>} */
  async function json(url) {
    let response;
    try {
      response = await transport({ method: 'GET', url, headers });
    } catch {
      throw new Error('UNREACHABLE');
    }
    if (isEmptyBranch(response)) return null;
    if (response.status < 200 || response.status >= 300) throw new Error('UNREACHABLE');
    try {
      return JSON.parse(response.text);
    } catch {
      throw new Error('UNREACHABLE');
    }
  }

  /** @type {string[]} */
  const paths = [];
  for (let page = 1; page < 200; page++) {
    const tree = await json(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=true&per_page=1000&page=${page}`);
    if (!tree) break;
    for (const entry of tree.tree ?? []) if (entry.type === 'blob' && WANTED.test(entry.path)) paths.push(entry.path);
    if (!tree.truncated && !(tree.total_count > page * 1000)) break;
  }

  const result = /** @type {DownloadedLogbook} */ ({ marker: 'empty', dives: 0, sites: 0, trips: 0, gear: 0, certifications: 0, openable: false });
  if (!paths.includes('opendives.json')) {
    onProgress?.(0, 0);
    return result;
  }
  const total = paths.length;
  let done = 0;
  onProgress?.(0, total);
  // A few at a time: a logbook is hundreds of small files.
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      if (cancelled?.()) throw new Error('CANCELLED');
      const path = paths[next++];
      const file = await json(`${api}/raw/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      if (path === 'opendives.json') result.marker = checkMarker(file);
      else if (path.startsWith('dives/')) result.dives++;
      else if (path.startsWith('sites/')) result.sites++;
      else if (path.startsWith('gear/')) result.gear++;
      else if (path.startsWith('certifications/')) result.certifications++;
      else result.trips++;
      onProgress?.(++done, total);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return result;
}
