// @ts-check
// Logic of the release edition's first launch (tasks 2026-11-15-213 and 218; pages/WelcomeStartRelease.svelte,
// components/FirstLaunch*.svelte): the decorative profile drawn to the size it is given, the cloud services,
// the « coming in a later version » message, and the creation of the device logbook (empty, or from a file or
// a divelogs.de download). Kept apart from the screens so that node:test can run it.

/** The size the profile of the mock-up is drawn at (android-tablette-premier-lancement-production-paysage.dc.html). */
const DRAWN = { width: 588, height: 300 };

/** The profile of the mock-up, in its own 588 × 300 coordinates (absolute cubic curves). */
const PROFILE_PATH =
  'M0.0 12.6 C2.7 30.9 9.8 87.0 16.0 122.2 C22.2 157.6 29.9 199.1 36.8 224.4 C43.7 249.6 50.5 264.0 57.4 274.1 C64.4 284.2 71.3 286.1 78.2 284.7 C85.2 283.3 93.8 270.9 98.9 265.9 C104.0 260.8 104.0 271.6 109.3 254.1 C114.6 236.5 123.9 184.9 130.1 160.4 C136.3 135.9 142.5 116.1 146.4 107.1 C150.3 98.1 151.8 106.3 153.8 106.6 C155.7 106.9 156.2 107.5 158.0 108.9 C159.8 110.4 160.4 115.1 164.9 114.8 C169.6 114.5 178.7 107.1 185.6 107.1 C192.5 107.1 199.5 111.9 206.4 114.5 C213.3 117.0 220.1 122.1 227.1 122.2 C234.0 122.4 240.9 120.2 247.9 115.7 C254.8 111.3 261.6 100.3 268.5 95.7 C275.5 91.1 282.4 89.2 289.3 87.9 C296.3 86.7 303.0 89.7 310.0 87.9 C316.9 86.2 323.9 78.0 330.8 77.8 C337.7 77.5 344.5 87.3 351.4 86.5 C358.4 85.7 365.3 78.0 372.2 73.3 C379.2 68.5 386.0 60.0 392.9 58.3 C399.8 56.5 406.8 62.1 413.7 62.4 C420.6 62.7 427.4 61.3 434.4 60.5 C441.3 59.7 448.2 60.0 455.2 57.8 C462.1 55.6 468.9 49.7 475.8 46.9 C482.8 44.1 489.7 40.4 496.6 40.4 C503.6 40.6 510.4 47.2 517.3 47.4 C524.2 47.5 531.2 43.7 538.1 41.4 C545.0 39.0 551.8 34.1 558.8 33.2 C565.7 32.2 574.7 39.0 579.6 35.5 C584.4 32.1 586.6 16.4 588.0 12.6';

/** The surface line, the deepest point (the white dot) and the line's end, in the same coordinates. */
const SURFACE_Y = 12.6;
const DEEPEST = { x: 78.2, y: 284.7 };

/**
 * The profile scaled to `width` × `height` (the numbers of a path are x, y pairs).
 * @param {number} width
 * @param {number} height
 * @returns {{ line: string, area: string, surfaceY: number, deepest: { x: number, y: number } }}
 */
export function scaledProfile(width, height) {
  const sx = width / DRAWN.width;
  const sy = height / DRAWN.height;
  let index = 0;
  const line = PROFILE_PATH.replace(/-?\d+\.?\d*/g, (n) => (Number(n) * (index++ % 2 === 0 ? sx : sy)).toFixed(1));
  return {
    line,
    area: line + ' Z',
    surfaceY: +(SURFACE_Y * sy).toFixed(1),
    deepest: { x: +(DEEPEST.x * sx).toFixed(1), y: +(DEEPEST.y * sy).toFixed(1) },
  };
}


/**
 * The cloud services of « Choisissez votre service » and « Dans quel service ? »: generic icons, never a
 * brand logo. `name` is what « Connexion à {service} » and « Se connecter à {service} » show.
 * @type {{ key: string, text: string, icon: 'cloud'|'server' }[]}
 */
export const CLOUD_SERVICES = [
  { key: 'googleDrive', text: 'welcomeSteps.googleDrive', icon: 'cloud' },
  { key: 'oneDrive', text: 'welcomeSteps.oneDrive', icon: 'cloud' },
  { key: 'dropbox', text: 'welcomeSteps.dropbox', icon: 'cloud' },
  { key: 'webdav', text: 'welcomeSteps.webdav', icon: 'server' },
];

/**
 * « Se connecter à {service} » and the other cloud actions: idea #74 is not built yet, they say so.
 * @param {(text: string) => void} show the snackbar
 * @param {(key: string) => string} t
 */
export function cloudComing(show, t) {
  show(t('welcomeSteps.cloudSoon'));
}

/**
 * The device's logbook is started for a new logbook. When the device had none, the sample dives that
 * starting adds are removed: the logbook is empty, or made of what the importer adds.
 * @param {{
 *   deviceLogExists: () => Promise<boolean>,
 *   start: () => Promise<unknown>,
 *   sampleIds: () => number[],
 *   remove: (ids: number[]) => Promise<unknown>,
 * }} deps
 * @param {(() => Promise<number>)|null} [importer] adds the dives to the started logbook
 * @returns {Promise<number>} the number of dives imported (0 without an importer)
 */
export async function createDeviceLogbook(deps, importer = null) {
  const hadLogbook = await deps.deviceLogExists();
  await deps.start();
  if (!hadLogbook) {
    const sample = deps.sampleIds();
    if (sample.length) await deps.remove(sample);
  }
  return importer ? importer() : 0;
}

/**
 * A file picked on first launch: read first without touching anything (staged, counted, discarded), so
 * that a file that cannot be read leaves first launch as it was.
 * @param {File} file
 * @param {{
 *   readBase64: (file: File) => Promise<string>,
 *   stage: (options: { name: string, data: string }) => Promise<{ path: string }>,
 *   count: (options: { path: string }) => Promise<{ dives: number }>,
 *   discard: (options: { path: string }) => Promise<unknown>,
 * }} deps
 * @returns {Promise<number>} the dives the file holds
 * @throws {Error} `NO_DIVES` or the core's code (IMPORT_FAILED…)
 */
export async function readImportFile(file, deps) {
  const staged = await deps.stage({ name: file.name, data: await deps.readBase64(file) });
  let dives = 0;
  try {
    dives = (await deps.count({ path: staged.path })).dives;
  } finally {
    await deps.discard({ path: staged.path }).catch(() => {});
  }
  if (!dives) throw new Error('NO_DIVES');
  return dives;
}

/**
 * The divelogs.de archive downloaded into the app's cache, read back as a file the app's import takes
 * (the WebView serves the cache through Capacitor's file URL). The core reads `.dld` archives.
 * @param {string} path
 * @param {(path: string) => string} toUrl Capacitor.convertFileSrc
 * @param {(url: string) => Promise<{ blob: () => Promise<Blob>, ok: boolean }>} fetcher
 * @returns {Promise<File>}
 */
export async function downloadedFile(path, toUrl, fetcher) {
  const response = await fetcher(toUrl(path));
  if (!response.ok) throw new Error('IMPORT_FAILED');
  return new File([await response.blob()], 'divelogs.dld');
}
