// @ts-check
// When the logbook shown as offline should try the server again: the network
// came back (an 'online' event, the Network plugin, the app coming to the
// front), whether or not changes are waiting to be sent.

/**
 * @param {{ email: string|null|undefined, autoSync: boolean, sync: string, loading: boolean, error: unknown, conflict: unknown }} state
 * @returns {boolean}
 */
export function shouldReconnect(state) {
  return !!state.email && state.autoSync && state.sync === 'offline' && !state.loading && !state.error && !state.conflict;
}
