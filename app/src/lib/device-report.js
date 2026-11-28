// @ts-check
// What a device tells the Benthic server about itself with its session (inbox task 2026-11-28-431), so that support can see which
// devices are signed in to an account and sign one out (the console's « Appareils »). Exactly these six fields and nothing else:
// no name given by the owner, no hardware identifier, nothing from the logbook. A device in local mode has no session and sends
// nothing. The server's side of the contract is docs/console.md, « Devices » (benthic-server).
//
// Pure apart from what it is given, so that node:test can check the payload.

import { deviceKind } from './device-name.js';

/**
 * @typedef {Object} DeviceReport
 * @property {'phone'|'tablet'|'desktop'} type
 * @property {'android'|'ios'|'windows'|'macos'|'linux'} os
 * @property {string} osVersion « 15 », « 18.1 », « 11 »
 * @property {string} [model] « Pixel 8 », « iPad Air »; absent on a desktop and when the web view does not say
 * @property {string} appVersion « 0.3.0 »
 * @property {'alpha'|'beta'} edition the release edition is the beta until the public release (docs/architecture.md, 11.9)
 */

/** The only keys a report may carry. */
export const DEVICE_REPORT_KEYS = Object.freeze(['type', 'os', 'osVersion', 'model', 'appVersion', 'edition']);

/** @param {unknown} v @param {number} max */
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * The system version from the user agent (« Android 15 » gives « 15 », « CPU iPhone OS 18_1 » gives « 18.1 »); Chromium's user agent
 * freezes the Windows and macOS versions, so `platformVersion` (User-Agent Client Hints) is read for them when the page has it.
 * @param {DeviceKindName} kind
 * @param {string} ua
 * @param {string} platformVersion
 */
function systemVersion(kind, ua, platformVersion) {
  if (kind === 'androidPhone' || kind === 'androidTablet') return /Android ([\d.]+)/.exec(ua)?.[1] ?? '';
  if (kind === 'iphone' || kind === 'ipad') return (/(?:iPhone|CPU) OS ([\d_]+)/.exec(ua)?.[1] ?? '').replace(/_/g, '.');
  if (kind === 'windows') {
    const major = Number.parseInt(platformVersion, 10);
    if (Number.isFinite(major) && major > 0) return major >= 13 ? '11' : '10';
    return /Windows NT ([\d.]+)/.exec(ua)?.[1] === '10.0' ? '10' : '';
  }
  if (kind === 'mac') return /^\d/.test(platformVersion) ? platformVersion : '';
  return '';
}

/** @typedef {ReturnType<typeof deviceKind>} DeviceKindName */

/**
 * @param {Object} input
 * @param {string} input.ua navigator.userAgent
 * @param {string} [input.desktopPlatform] the desktop app's process.platform (`win32`, `darwin`, `linux`)
 * @param {number} [input.shortSide] the screen's shorter side in CSS pixels (600 and more is a tablet)
 * @param {number} [input.touchPoints] navigator.maxTouchPoints
 * @param {string} [input.navigatorPlatform] navigator.platform
 * @param {string} [input.model] the model from User-Agent Client Hints, when the web view gives it
 * @param {string} [input.platformVersion] the system version from User-Agent Client Hints
 * @param {string} input.appVersion
 * @param {'alpha'|'release'|string} input.edition
 * @returns {DeviceReport|null} null when the system is not one the server knows (nothing is sent then)
 */
export function deviceReport({ ua, desktopPlatform = '', shortSide = 0, touchPoints = 0, navigatorPlatform = '', model = '', platformVersion = '', appVersion, edition }) {
  const kind = deviceKind({ ua, desktopPlatform, shortSide, touchPoints, platform: navigatorPlatform });
  /** @type {Record<string, [DeviceReport['type'], DeviceReport['os']]>} */
  const known = {
    androidPhone: ['phone', 'android'], androidTablet: ['tablet', 'android'], iphone: ['phone', 'ios'], ipad: ['tablet', 'ios'],
    windows: ['desktop', 'windows'], mac: ['desktop', 'macos'], linux: ['desktop', 'linux'],
  };
  const hit = known[kind];
  if (!hit) return null;
  const [type, os] = hit;
  /** @type {DeviceReport} */
  const report = { type, os, osVersion: clean(systemVersion(kind, ua, platformVersion), 40), appVersion: clean(appVersion, 40), edition: edition === 'alpha' ? 'alpha' : 'beta' };
  if (type !== 'desktop') {
    // Chrome's reduced user agent gives « K » for the Android model: a one-letter model is no model.
    const fromUa = os === 'android' ? /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua)?.[1] ?? '' : os === 'ios' ? (kind === 'ipad' ? 'iPad' : 'iPhone') : '';
    const wanted = clean(model, 60) || (fromUa.length > 1 ? clean(fromUa, 60) : '');
    if (wanted) report.model = wanted;
  }
  return report;
}

/**
 * Sends the report with the session, at sign-in and at each sync or desktop access check. Quiet: it never throws and never waits for
 * more than one call; a session the server says has ended (a signed-out device) is passed to `onEnded`.
 * @param {Object} deps
 * @param {(token: string, device: DeviceReport) => Promise<'ok'|'ended'|'failed'>} deps.send
 * @param {() => Promise<DeviceReport|null>} deps.device
 * @param {() => Promise<string>} deps.sessionToken '' when nobody is signed in (local mode): nothing is sent
 * @param {() => void} [deps.onEnded]
 * @param {() => number} [deps.now]
 * @param {number} [deps.minIntervalMs] a sync burst sends one report
 */
export function createDeviceReporter({ send, device, sessionToken, onEnded, now = Date.now, minIntervalMs = 60000 }) {
  let last = -Infinity;
  let running = false;
  return {
    /** @param {{ force?: boolean }} [options] @returns {Promise<'sent'|'skipped'|'ended'|'failed'>} */
    async report({ force = false } = {}) {
      if (running || (!force && now() - last < minIntervalMs)) return 'skipped';
      running = true;
      try {
        const token = await sessionToken();
        if (!token) return 'skipped';
        const d = await device();
        if (!d) return 'skipped';
        const outcome = await send(token, d);
        if (outcome === 'ended') { onEnded?.(); return 'ended'; }
        if (outcome === 'ok') last = now();
        return outcome === 'ok' ? 'sent' : 'failed';
      } catch {
        return 'failed';
      } finally {
        running = false;
      }
    },
  };
}
