// @ts-check
// The error reports as the screens see them (task #102): which errors are caught, the report waiting for the diver's
// answer, and what « Envoyer » does. Nothing leaves the device before that tap. The pure parts (building, scrubbing, queue,
// sending) are in error-report.js and error-scrub.js.
import { Capacitor } from '@capacitor/core';
import { OpenDivesCore, setCoreErrorHook } from 'opendives-core';
import { deviceStore } from './device-store.js';
import { edition } from './edition.js';
import { serverUrl } from './server-url.js';
import { serverTransport } from './server-transport.js';
import { sideWindow } from './layout.svelte.js';
import {
  buildReport, describeError, deviceFromUserAgent, dropReport, noteLog, pendingReports, queueReport, recentLog, reportKey, sendReport,
} from './error-report.js';

/** What the report dialog shows. `status`: idle, sending, or offline (the last try found no network). */
export const errorReport = $state({
  /** @type {import('./error-report.js').ErrorReport|null} */
  report: null,
  open: false,
  /** @type {'idle'|'sending'|'offline'} */
  status: 'idle',
});

/** At most this many offers in one session: a loop of errors must not become a loop of questions. */
const MAX_OFFERS = 3;
/** Rejections that are an expected answer, not a fault. */
const EXPECTED = new Set([
  'CORE_ERROR', 'CANCELLED', 'USER_CANCELLED', 'UNAVAILABLE', 'NOT_AVAILABLE', 'PERMISSION', 'NO_BLUETOOTH', 'BLUETOOTH_OFF', 'NO_ACCOUNT',
  'NOT_SIGNED_IN', 'NETWORK', 'UNREACHABLE', 'NOT_FOUND', 'BAD_ARGUMENT', 'CREDENTIALS_NOT_SAVED', 'TOO_BIG', 'NO_DIVES',
]);
const IGNORED_MESSAGES = /ResizeObserver loop|^Script error\.?$|Load failed|The operation was aborted/i;

let offers = 0;
/** @type {Set<string>} */
const seen = new Set();
let started = false;
/** @type {() => string} */
let routeNow = () => '';

/** What the app knows of itself, for the report. */
function info() {
  const desktop = /** @type {any} */ (globalThis).odDesktop;
  const platform = desktop ? 'desktop' : Capacitor.getPlatform();
  return {
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    // The release edition is the beta until the public release (docs/architecture.md, section 11.9).
    edition: /** @type {'alpha'|'beta'} */ (edition === 'alpha' ? 'alpha' : 'beta'),
    platform,
    ...deviceFromUserAgent(globalThis.navigator?.userAgent ?? '', platform),
  };
}

/** A server is the only place a report goes; without one nothing is kept and nothing is asked. */
const canSend = () => !!serverUrl();

/**
 * Catches an error: builds its report, keeps it, and offers it to the diver (never sends it).
 * @param {import('./error-report.js').ReportKind} kind
 * @param {unknown} reason
 */
export function reportError(kind, reason) {
  try {
    const { message, stack } = describeError(reason);
    if (!message || IGNORED_MESSAGES.test(message)) return;
    const code = reason && typeof reason === 'object' ? /** @type {any} */ (reason).code : '';
    if (typeof code === 'string' && EXPECTED.has(code)) return;
    noteLog('error', message);
    if (!canSend()) return;
    const report = buildReport({ kind, message, stack, route: routeNow(), log: recentLog(), info: info() });
    if (seen.has(reportKey(report))) return;
    seen.add(reportKey(report));
    queueReport(deviceStore, report);
    offerNext();
  } catch {
    // A fault in the reporting itself must never raise another one.
  }
}

/** Offers the first waiting report, when nothing is being asked. */
export function offerNext() {
  if (errorReport.open || offers >= MAX_OFFERS || !canSend()) return;
  const next = pendingReports(deviceStore)[0];
  if (!next) return;
  offers++;
  errorReport.report = next;
  errorReport.status = 'idle';
  errorReport.open = true;
}

/** « Envoyer ». */
export async function sendCurrent() {
  const report = errorReport.report;
  if (!report || errorReport.status === 'sending') return;
  errorReport.status = 'sending';
  const result = await sendReport(report, { baseUrl: serverUrl(), transport: serverTransport });
  if (result === 'offline') {
    // Kept: it is offered again at the next launch.
    errorReport.status = 'offline';
    return;
  }
  dropReport(deviceStore, report);
  errorReport.open = false;
  errorReport.status = 'idle';
}

/** « Ne pas envoyer »: the report is forgotten. When the network was missing, « Plus tard » keeps it. */
export function declineCurrent() {
  const report = errorReport.report;
  if (report && errorReport.status !== 'offline') dropReport(deviceStore, report);
  errorReport.open = false;
  errorReport.status = 'idle';
}

/** A crash that Kotlin or Swift code saved before the app died: it becomes a report of its own. */
async function collectNativeCrash() {
  try {
    const saved = await OpenDivesCore.pendingCrashReport();
    if (!saved?.json) return;
    const crash = JSON.parse(saved.json);
    await OpenDivesCore.clearCrashReport();
    const base = info();
    const report = buildReport({
      kind: 'native',
      message: String(crash.message ?? 'Crash'),
      stack: String(crash.stack ?? ''),
      route: '',
      log: [],
      occurredAt: typeof crash.occurredAt === 'string' ? crash.occurredAt : undefined,
      info: { ...base, osVersion: String(crash.osVersion || base.osVersion), device: String(crash.device || base.device) },
    });
    queueReport(deviceStore, report);
  } catch {
    // No such method (an older plugin) or nothing saved.
  }
}

/**
 * Installs the catchers, once. `route` returns the page the app is on.
 * @param {{ route?: () => string }} [options]
 */
export function startErrorReports({ route } = {}) {
  if (started || sideWindow) return;
  started = true;
  if (route) routeNow = route;
  for (const level of /** @type {const} */ (['warn', 'error'])) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      noteLog(level, ...args);
      original(...args);
    };
  }
  globalThis.addEventListener('error', (event) => {
    // An error of a script or a resource of another origin says nothing useful; a failed image or file has no `error`.
    if (!event.error && !event.message) return;
    reportError('js', event.error ?? event.message);
  });
  globalThis.addEventListener('unhandledrejection', (event) => reportError('js', event.reason));
  setCoreErrorHook((method, error, caller) => {
    const base = describeError(error);
    const e = new Error(`${method}: ${base.message}`);
    e.stack = [base.stack, caller ? `called from:\n${caller}` : ''].filter(Boolean).join('\n');
    reportError('core', e);
  });
  // Pending reports (offline last time, or a crash of the last run) are offered a few seconds after the start.
  setTimeout(async () => {
    if (canSend()) await collectNativeCrash();
    offerNext();
  }, 4000);
}
