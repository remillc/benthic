// @ts-check
// Where an upload to the OpenDives server reads its dives from: the core, through the plugin. The core gives each dive
// as JSON (`getDive`); the mapping to the OpenDives format is JavaScript (lib/server-logbook-format.js). Kept apart
// from the screens so that node:test can drive it with a fake core.

/**
 * @param {Pick<import('opendives-core').OpenDivesCorePlugin, 'listLoadedDives'|'listDives'|'getDive'>} core
 * @returns {import('./server-upload.js').UploadSource}
 */
export function coreSource(core) {
  return {
    async list() {
      let rows = await core.listLoadedDives();
      // The logbook is not loaded while the first launch is open: the stored one is read.
      if (!rows.length) rows = (await core.listDives()).dives;
      return rows.map((d) => ({
        id: d.id,
        date: d.date,
        site: d.site,
        number: d.number,
        durationSeconds: d.durationSeconds,
        maxDepthMm: d.maxDepthMm,
        trip: d.trip ? { id: d.trip.id, location: d.trip.location, autogen: d.trip.autogen } : null,
      }));
    },
    detail: (id) => core.getDive({ id }),
  };
}

/** A source with no dive: the empty logbook (only the marker is written). @type {import('./server-upload.js').UploadSource} */
export const emptySource = {
  list: async () => [],
  detail: async () => {
    throw new Error('NO_DIVES');
  },
};
