// @ts-check
// The name a new device announces when it asks to be paired (docs/account-sync.md, « Pairing by approval »): a sensible default
// from what the web layer knows without a native call. The Android model is not used: Chrome's reduced user agent gives « K »
// for it. The paired device shows the name in « Donner accès à « <name> » ? ».

/**
 * @typedef {'androidPhone'|'androidTablet'|'iphone'|'ipad'|'windows'|'mac'|'linux'|'unknown'} DeviceKind
 */

/**
 * @param {{ ua?: string, desktopPlatform?: string, shortSide?: number, touchPoints?: number, platform?: string }} info
 * `desktopPlatform`: the desktop app's `process.platform` (`win32`, `darwin`, `linux`); `shortSide`: the screen's shorter side in
 * CSS pixels (600 and more is a tablet); `platform`: `navigator.platform`.
 * @returns {DeviceKind}
 */
export function deviceKind({ ua = '', desktopPlatform = '', shortSide = 0, touchPoints = 0, platform = '' }) {
  if (desktopPlatform) return desktopPlatform === 'win32' ? 'windows' : desktopPlatform === 'darwin' ? 'mac' : desktopPlatform === 'linux' ? 'linux' : 'unknown';
  if (/iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return shortSide >= 600 ? 'androidTablet' : 'androidPhone';
  if (/Windows/.test(ua)) return 'windows';
  if (/Mac OS X/.test(ua)) return 'mac';
  if (/Linux/.test(ua)) return 'linux';
  return 'unknown';
}

/** The platform word the request carries (for the paired device's own logic, never shown). @param {DeviceKind} kind */
export const platformOf = (kind) => (kind.startsWith('android') ? 'android' : kind === 'iphone' || kind === 'ipad' ? 'ios' : kind === 'unknown' ? '' : 'desktop');

/** What this device is, read from the browser and the desktop preload. */
export function currentDeviceKind() {
  const g = /** @type {any} */ (globalThis);
  const nav = g.navigator ?? {};
  const screenInfo = g.screen ?? {};
  return deviceKind({
    ua: nav.userAgent ?? '',
    desktopPlatform: g.benthicDesktop?.platform ?? '',
    shortSide: Math.min(screenInfo.width ?? 0, screenInfo.height ?? 0),
    touchPoints: nav.maxTouchPoints ?? 0,
    platform: nav.platform ?? '',
  });
}
