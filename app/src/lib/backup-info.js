// @ts-check
// « Sauvegarde et synchronisation » of an OpenDives+ account: what the page can say today, pure so that node:test can
// check it. Temporary content, replaced when the design session's mock-ups arrive.

/**
 * The name of the server the logbook is kept on: the host of its address, '' when there is none.
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function serverName(url) {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
