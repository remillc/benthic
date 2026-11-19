// @ts-check
// The one progress line of a file import, from the moment a logbook file or a sites file is received or chosen until
// the import is finished. Pure: the screen (components/ImportProgress.svelte) reads the state through a sink; the
// plugin's events and the web layer's piece loops feed `report`.
//
// Phases, in order. A flow takes the ones it needs; the weights are shared out among those only, so the bar always
// reaches 100 % at the end:
//   copy   the file is copied into the app (bytes: native progress events, or the web layer's pieces of 3 MB)
//   check  the file is read in windows of 2 MB (what it is, its sites and years)
//   read   the core reads the dives to count them (first launch, the previous version's logbook): indeterminate
//   import the core imports the dives: the core reports nothing inside the import, the segment is indeterminate
//   save   the logbook is written (and synced)
// The weights are estimates of the time each takes on a 100 MB logbook on a phone; they only shape the bar.

/** @typedef {'copy'|'read'|'check'|'import'|'save'} ImportPhase */

/** @type {Record<ImportPhase, number>} */
export const PHASE_WEIGHTS = { copy: 0.3, read: 0.3, check: 0.2, import: 0.4, save: 0.1 };

/** The phases the diver can still cancel: nothing is in the logbook yet. */
export const CANCELLABLE = /** @type {ImportPhase[]} */ (['copy', 'check']);

/** The error thrown by a reporter once the diver cancelled; the callers clean up and stay silent on it. */
export const CANCELLED = 'CANCELLED';

/** @param {unknown} e whether an error is the diver's cancellation */
export const isCancelled = (e) => String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? e).includes(CANCELLED);

/**
 * @typedef {Object} ImportState
 * @property {boolean} active a flow is running or waiting between its steps
 * @property {boolean} visible the line is on screen (hidden while the diver answers a question)
 * @property {ImportPhase|''} phase
 * @property {number} fraction overall, 0..1, never going back
 * @property {number} done units of the phase (bytes)
 * @property {number} total 0 when unknown
 * @property {boolean} indeterminate the phase reports nothing inside (the core's import)
 * @property {boolean} cancellable
 * @property {boolean} cancelling
 * @property {number} segment grows each time the line comes back after a pause (the time left starts again)
 * @property {string} subject the file's name, for the screen reader
 */

/** @returns {ImportState} */
export const idleState = () => ({ active: false, visible: false, phase: '', fraction: 0, done: 0, total: 0, indeterminate: false, cancellable: false, cancelling: false, segment: 0, subject: '' });

/**
 * The overall fraction of a phase partly done, among the phases of a flow.
 * @param {ImportPhase[]} phases
 * @param {ImportPhase} phase
 * @param {number} inside 0..1 within the phase
 */
export function overallFraction(phases, phase, inside) {
  const index = phases.indexOf(phase);
  if (index < 0) return 0;
  const sum = phases.reduce((n, p) => n + PHASE_WEIGHTS[p], 0);
  const before = phases.slice(0, index).reduce((n, p) => n + PHASE_WEIGHTS[p], 0);
  return Math.min(1, (before + PHASE_WEIGHTS[phase] * Math.min(1, Math.max(0, inside))) / sum);
}

/**
 * @typedef {Object} ImportProgress
 * @property {ImportState} state a copy of the state
 * @property {boolean} active
 * @property {boolean} cancelled the diver pressed « Annuler »
 * @property {(phases: ImportPhase[], subject?: string) => void} begin starts a flow with the phases it will go through
 * @property {(name: ImportPhase, total?: number) => void} phase enters a phase (total 0: unknown); throws CANCELLED once cancelled
 * @property {(done: number, total?: number) => void} report progress of the phase; throws CANCELLED once cancelled
 * @property {(name: ImportPhase) => (done: number, total?: number) => void} reporter a report function that enters the phase on its first call
 * @property {() => void} pause hides the line while the diver answers a question; the next phase brings it back
 * @property {() => void} end the flow is over
 * @property {() => void} cancel « Annuler » (only in a cancellable phase)
 * @property {(handler: () => void) => () => void} onCancel something to do at once on cancel (stop the native copy)
 * @property {<T>(phases: ImportPhase[], subject: string, run: () => Promise<T>) => Promise<T>} session runs `run` inside a
 *   flow; joins the flow already running instead of starting one
 */

/**
 * @param {(state: ImportState) => void} sink receives a copy of the state at each change
 * @returns {ImportProgress}
 */
export function createImportProgress(sink) {
  let state = idleState();
  /** @type {ImportPhase[]} */
  let phases = [];
  let segment = 0;
  let cancelled = false;
  /** @type {Set<() => void>} */
  const handlers = new Set();

  /** @param {Partial<ImportState>} change */
  const set = (change) => {
    state = { ...state, ...change };
    sink({ ...state });
  };

  /** @type {ImportProgress} */
  const api = {
    get state() {
      return { ...state };
    },
    get active() {
      return state.active;
    },
    get cancelled() {
      return cancelled;
    },
    begin(list, subject = '') {
      phases = [...list];
      cancelled = false;
      handlers.clear();
      segment++;
      state = { ...idleState(), active: true, visible: true, segment, subject };
      sink({ ...state });
    },
    phase(name, total = 0) {
      if (!state.active || !phases.includes(name)) return;
      if (cancelled) throw new Error(CANCELLED);
      if (!state.visible) segment++;
      set({
        visible: true,
        segment,
        phase: name,
        done: 0,
        total,
        indeterminate: !(total > 0),
        cancellable: CANCELLABLE.includes(name),
        fraction: Math.max(state.fraction, overallFraction(phases, name, 0)),
      });
    },
    report(done, total) {
      if (!state.active || !state.phase) return;
      if (cancelled) throw new Error(CANCELLED);
      const all = total ?? state.total;
      const phase = /** @type {ImportPhase} */ (state.phase);
      set({ done, total: all, indeterminate: !(all > 0), fraction: Math.max(state.fraction, overallFraction(phases, phase, all > 0 ? done / all : 0)) });
    },
    reporter(name) {
      return (done, total) => {
        if (!state.active) return;
        if (state.phase !== name) api.phase(name, total);
        api.report(done, total);
      };
    },
    pause() {
      if (state.active) set({ visible: false, cancellable: false });
    },
    end() {
      cancelled = false;
      handlers.clear();
      phases = [];
      state = idleState();
      sink({ ...state });
    },
    cancel() {
      if (!state.active || !state.cancellable || cancelled) return;
      cancelled = true;
      set({ cancelling: true });
      for (const h of handlers) h();
    },
    onCancel(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async session(list, subject, run) {
      if (state.active) return run();
      api.begin(list, subject);
      try {
        return await run();
      } finally {
        api.end();
      }
    },
  };
  return api;
}

/**
 * A size as a number and a unit key (kb, mb, gb), for the count « 45 Mo sur 100 Mo ».
 * @param {number} bytes
 * @returns {{ n: number, unit: 'kb'|'mb'|'gb' }}
 */
export function sizeParts(bytes) {
  if (bytes >= 1024 ** 3) return { n: Math.round((bytes / 1024 ** 3) * 10) / 10, unit: 'gb' };
  if (bytes >= 1024 ** 2) return { n: bytes >= 100 * 1024 ** 2 ? Math.round(bytes / 1024 ** 2) : Math.round((bytes / 1024 ** 2) * 10) / 10, unit: 'mb' };
  return { n: Math.max(0, Math.round(bytes / 1024)), unit: 'kb' };
}
