// @ts-check
// Error and crash reports (task #102). Pure apart from what it is given (the store, the transport), so that node:test
// drives it. Nothing here sends by itself: the screen shows the report (reportText) and sends only when the diver taps
// « Envoyer ». What a report holds: the version and edition, the platform, the system and the model, the message and
// the stack of the error, the route at the time, the last lines of the app's own log and the navigation trace (how the
// diver got to that page: lib/nav-trace.js, paths only). Never a dive, a site, a name,
// an address, an account, a position or a token: scrub() (error-scrub.js) is the last net on every text.
// The contract of the server (POST /v1/error-reports) is in docs/architecture.md, section 11.9.
import { scrub, scrubLines, scrubRoute } from './error-scrub.js';

/** @typedef {'js'|'core'|'native'} ReportKind */
/**
 * @typedef {Object} ErrorReport
 * @property {ReportKind} kind js: an error of the web layer; core: a failure returned by the core; native: a crash of Kotlin/Swift code
 * @property {string} appVersion
 * @property {'alpha'|'beta'} edition
 * @property {string} platform android, ios, desktop or web
 * @property {string} osVersion
 * @property {string} device
 * @property {string} route the page at the time, without its query
 * @property {string} occurredAt ISO date
 * @property {string} message
 * @property {string} stack
 * @property {string[]} log the last lines of the app's own log, then the navigation trace (lines that start with `nav `)
 */

/** Lines kept in the log of the app, and in a report. */
export const LOG_LINES = 40;
/** Lines of the navigation trace in a report (lib/nav-trace.js packs several events a line). */
export const NAV_LINES = 60;
/** Reports kept for a later offer (offline, or the app was closed before the answer). */
export const MAX_PENDING = 5;
const STORE_KEY = 'od.errorReports';

/** @type {string[]} */
const ring = [];

/**
 * Adds a line to the log of the app (its own messages only: warnings and errors, routes). Scrubbed when it is read.
 * @param {string} level
 * @param {unknown[]} parts
 */
export function noteLog(level, ...parts) {
  const text = parts.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : safeJson(p))).join(' ');
  ring.push(`${new Date().toISOString().slice(11, 19)} ${level} ${text.slice(0, 300)}`);
  if (ring.length > LOG_LINES) ring.splice(0, ring.length - LOG_LINES);
}

/** @param {unknown} value */
function safeJson(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The log as a report carries it. @returns {string[]} */
export function recentLog() {
  return scrubLines(ring);
}

/** Empties the log (tests). */
export function clearLog() {
  ring.length = 0;
}

/**
 * The system and the model, from the user agent (the web view's, or Electron's).
 * @param {string} ua
 * @param {string} [platform] Capacitor's platform, or 'desktop'
 * @returns {{ osVersion: string, device: string }}
 */
export function deviceFromUserAgent(ua, platform = '') {
  const android = /Android ([\d.]+)/.exec(ua);
  if (android) {
    const model = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua)?.[1] ?? '';
    return { osVersion: `Android ${android[1]}`, device: model };
  }
  const ios = /(?:iPhone|CPU) OS ([\d_]+)/.exec(ua);
  if (ios) return { osVersion: `iOS ${ios[1].replace(/_/g, '.')}`, device: /iPad/.test(ua) ? 'iPad' : 'iPhone' };
  if (platform === 'desktop' || /Electron\//.test(ua)) {
    const os = /Windows NT ([\d.]+)/.exec(ua)?.[0] ?? /Mac OS X ([\d_.]+)/.exec(ua)?.[0]?.replace(/_/g, '.') ?? (/Linux/.test(ua) ? 'Linux' : '');
    return { osVersion: os, device: /Electron\/([\d.]+)/.exec(ua)?.[0] ?? '' };
  }
  return { osVersion: '', device: '' };
}

/**
 * The message and the stack of whatever was thrown.
 * @param {unknown} reason
 * @returns {{ message: string, stack: string }}
 */
export function describeError(reason) {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack ?? '' };
  if (reason && typeof reason === 'object') {
    const r = /** @type {any} */ (reason);
    if (typeof r.message === 'string') return { message: `${typeof r.code === 'string' ? `${r.code}: ` : ''}${r.message}`, stack: typeof r.stack === 'string' ? r.stack : '' };
    return { message: safeJson(reason), stack: '' };
  }
  return { message: String(reason), stack: '' };
}

/**
 * @param {Object} input
 * @param {ReportKind} input.kind
 * @param {string} input.message
 * @param {string} [input.stack]
 * @param {string} [input.route]
 * @param {string[]} [input.log]
 * @param {string[]} [input.nav] the navigation trace, packed (lib/nav-trace.js, traceLines)
 * @param {string} [input.occurredAt]
 * @param {{ appVersion: string, edition: 'alpha'|'beta', platform: string, osVersion: string, device: string }} input.info
 * @returns {ErrorReport} every text scrubbed and cut
 */
export function buildReport({ kind, message, stack = '', route = '', log = [], nav = [], occurredAt, info }) {
  const stamp = occurredAt && !Number.isNaN(Date.parse(occurredAt)) ? new Date(occurredAt).toISOString() : new Date().toISOString();
  return {
    kind,
    appVersion: scrub(info.appVersion, 40),
    edition: info.edition,
    platform: scrub(info.platform, 24),
    osVersion: scrub(info.osVersion, 80),
    device: scrub(info.device, 120),
    route: scrubRoute(route),
    occurredAt: stamp,
    message: scrub(message, 2000),
    stack: scrub(stack, 12000),
    log: [...scrubLines(log.slice(-LOG_LINES), 300), ...scrubLines(nav.slice(-NAV_LINES), 300)],
  };
}

/**
 * What the diver reads before sending: exactly the fields of the report, as text.
 * @param {ErrorReport} report
 * @returns {string}
 */
export function reportText(report) {
  const head = [
    ['version', `${report.appVersion} (${report.edition})`],
    ['platform', [report.platform, report.osVersion].filter(Boolean).join(', ')],
    ['device', report.device],
    ['page', report.route],
    ['date', report.occurredAt],
    ['kind', report.kind],
  ];
  return [
    ...head.map(([k, v]) => `${k}: ${v || '-'}`),
    '',
    report.message,
    ...(report.stack ? ['', report.stack] : []),
    ...(report.log.length ? ['', ...report.log] : []),
  ].join('\n');
}

/** Same error, same place: the key that stops one fault from asking twice. @param {ErrorReport} report */
export function reportKey(report) {
  return `${report.kind}|${report.message}|${report.stack.split('\n').slice(0, 3).join('|')}`;
}

/**
 * @typedef {Object} ReportStore
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/** The reports waiting for an answer or for the network. @param {ReportStore} store @returns {ErrorReport[]} */
export function pendingReports(store) {
  try {
    const list = JSON.parse(store.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => r && typeof r.message === 'string' && typeof r.kind === 'string') : [];
  } catch {
    return [];
  }
}

/** @param {ReportStore} store @param {ErrorReport[]} list */
function savePending(store, list) {
  try {
    if (list.length) store.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_PENDING)));
    else store.removeItem(STORE_KEY);
  } catch {
    // Storage unavailable: the report is only offered now.
  }
}

/**
 * Keeps a report for a later offer. The same fault is kept once.
 * @param {ReportStore} store
 * @param {ErrorReport} report
 * @returns {boolean} false when it was already waiting
 */
export function queueReport(store, report) {
  const list = pendingReports(store);
  if (list.some((r) => reportKey(r) === reportKey(report))) return false;
  savePending(store, [...list, report]);
  return true;
}

/** Forgets a report (sent, or declined). @param {ReportStore} store @param {ErrorReport} report */
export function dropReport(store, report) {
  savePending(store, pendingReports(store).filter((r) => reportKey(r) !== reportKey(report)));
}

/**
 * Sends one report to the server (POST /v1/error-reports). No account, no header but the content type.
 * @param {ErrorReport} report
 * @param {{ baseUrl: string, transport: import('./server-api.js').ServerTransport }} options
 * @returns {Promise<'sent'|'offline'|'refused'>} offline: the network or the server did not answer, keep the report;
 *   refused: the server will not take this report (invalid, too big), drop it
 */
export async function sendReport(report, { baseUrl, transport }) {
  if (!baseUrl) return 'offline';
  let response;
  try {
    response = await transport({ method: 'POST', url: `${baseUrl}/v1/error-reports`, body: report });
  } catch {
    return 'offline';
  }
  if (response.status >= 200 && response.status < 300) return 'sent';
  // 429 (rate limit) and 5xx: try again later; any other 4xx: the report itself is the problem.
  return response.status === 429 || response.status >= 500 ? 'offline' : 'refused';
}
