// SPDX-License-Identifier: GPL-2.0
'use strict';
// The connection type for « Seulement sur Wi-Fi ou câble » (task 2026-11-15-202). Electron and Chromium give no
// « metered connection » signal on desktop, so each system is asked the way it can answer:
//   Windows  WinRT NetworkInformation.GetInternetConnectionProfile().GetConnectionCost() through PowerShell: Fixed
//            or Variable cost is metered (Windows marks a phone's Wi-Fi hotspot and a mobile broadband link so),
//            a mobile broadband profile (IsWwanConnectionProfile) too; Unrestricted is not.
//   Linux    NetworkManager: `nmcli -t -f GENERAL.DEVICE,GENERAL.METERED device show`; « yes » or « yes (guessed) » is
//            metered (NetworkManager guesses it from an Android hotspot's DHCP option, a mobile broadband modem).
//            Without NetworkManager or nmcli the answer is unknown.
//   macOS    the default route's interface: its hardware port (iPhone USB, a cellular modem), the iPhone Personal
//            Hotspot's gateway 172.20.10.1, or the DHCP option « ANDROID_METERED » an Android hotspot sends.
// « unknown » (no way to tell, a command that failed or timed out) allows the sync: the switch only stops it where the
// system says the link is metered. The answer is cached; it is asked again when the network interfaces change
// (a cheap in-process check every 15 s while a window watches), at most every 5 minutes otherwise, and never blocks:
// the commands run asynchronously with a timeout.
const os = require('node:os');
const { execFile } = require('node:child_process');

/** @typedef {'metered'|'unmetered'|'unknown'} Cost */

const WINDOWS_SCRIPT =
  "$ErrorActionPreference='Stop';" +
  '[void][Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime];' +
  '$p=[Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile();' +
  "if(-not $p){'none'}else{$c=$p.GetConnectionCost();\"$($c.NetworkCostType)|$($p.IsWwanConnectionProfile)\"}";

/** « Fixed|False » from the script above. @param {string} text @returns {Cost} */
function parseWindows(text) {
  const line = String(text).trim().split(/\r?\n/).pop() || '';
  if (line === 'none') return 'unknown';
  const [cost, wwan] = line.split('|');
  if (cost === 'Fixed' || cost === 'Variable' || wwan === 'True') return 'metered';
  if (cost === 'Unrestricted') return 'unmetered';
  return 'unknown';
}

/** `nmcli -t -f GENERAL.DEVICE,GENERAL.METERED device show`: « GENERAL.METERED:yes (guessed) » per device. @param {string} text @returns {Cost} */
function parseNmcli(text) {
  let seen = false;
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^GENERAL\.METERED:(.*)$/.exec(line.trim());
    if (!m) continue;
    const value = m[1].trim().toLowerCase();
    if (value.startsWith('yes')) return 'metered';
    if (value.startsWith('no')) seen = true;
  }
  return seen ? 'unmetered' : 'unknown';
}

/** @param {string} routeText `route -n get default` @returns {{ iface: string, gateway: string }} */
function parseRoute(routeText) {
  const iface = /interface:\s*(\S+)/.exec(routeText)?.[1] ?? '';
  const gateway = /gateway:\s*(\S+)/.exec(routeText)?.[1] ?? '';
  return { iface, gateway };
}

/** @param {string} portsText `networksetup -listallhardwareports` @param {string} iface @returns {string} its hardware port's name */
function hardwarePortOf(portsText, iface) {
  const blocks = String(portsText).split(/\n\s*\n/);
  for (const block of blocks) {
    if (new RegExp(`^Device:\\s*${iface}\\s*$`, 'm').test(block)) return /Hardware Port:\s*(.+)/.exec(block)?.[1].trim() ?? '';
  }
  return '';
}

/**
 * macOS: from the default route, the hardware port list and, for an Android hotspot, the DHCP packet.
 * @param {{ route: string, ports: string, packet?: string }} text
 * @returns {Cost}
 */
function parseMac({ route, ports, packet = '' }) {
  const { iface, gateway } = parseRoute(route);
  if (!iface) return 'unknown';
  const port = hardwarePortOf(ports, iface);
  if (/iphone|cellular|modem|mobile|wwan|ipad/i.test(port)) return 'metered';
  if (gateway === '172.20.10.1') return 'metered'; // the iPhone's Personal Hotspot
  if (/ANDROID_METERED/i.test(packet)) return 'metered';
  return 'unmetered';
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
function run(file, args, timeout = 8000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
  });
}

/** The real detection, one call. @param {string} platform @param {typeof run} [exec] @returns {Promise<Cost>} */
async function detect(platform, exec = run) {
  // A test switch (checks in the real app without a tethered phone): OD_NETWORK_COST=metered|unmetered|unknown.
  const forced = process.env.OD_NETWORK_COST;
  if (forced === 'metered' || forced === 'unmetered' || forced === 'unknown') return forced;
  try {
    if (platform === 'win32') {
      return parseWindows(await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT]));
    }
    if (platform === 'linux') {
      return parseNmcli(await exec('nmcli', ['-t', '-f', 'GENERAL.DEVICE,GENERAL.METERED', 'device', 'show']));
    }
    if (platform === 'darwin') {
      const route = await exec('/sbin/route', ['-n', 'get', 'default']);
      const ports = await exec('/usr/sbin/networksetup', ['-listallhardwareports']).catch(() => '');
      const { iface } = parseRoute(route);
      const packet = iface ? await exec('/usr/sbin/ipconfig', ['getpacket', iface]).catch(() => '') : '';
      return parseMac({ route, ports, packet });
    }
  } catch {
    // No command, a refusal, a timeout: nobody can tell.
  }
  return 'unknown';
}

/** A signature of the network interfaces that changes when a link comes, goes or changes address. @param {() => Record<string, any>} interfaces */
function signature(interfaces) {
  const all = interfaces() || {};
  return Object.keys(all)
    .sort()
    .map((name) => `${name}:${(all[name] || []).filter((a) => !a.internal).map((a) => a.address).sort().join(',')}`)
    .join('|');
}

/**
 * The cached connection type, refreshed when the interfaces change.
 * @param {{ platform?: string, exec?: typeof run, interfaces?: () => Record<string, any>, onChange?: (cost: Cost) => void,
 *   pollMs?: number, maxAgeMs?: number, now?: () => number }} [options]
 */
function createNetworkMonitor({ platform = process.platform, exec = run, interfaces = os.networkInterfaces, onChange = () => {}, pollMs = 15000, maxAgeMs = 300000, now = Date.now } = {}) {
  /** @type {Cost} */
  let cost = 'unknown';
  let asked = 0;
  let last = '';
  /** @type {Promise<Cost>|null} */
  let running = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;

  /** Asks the system; one question at a time. @returns {Promise<Cost>} */
  function refresh() {
    if (running) return running;
    running = detect(platform, exec).then((value) => {
      running = null;
      asked = now();
      last = signature(interfaces);
      if (value !== cost) {
        cost = value;
        onChange(cost);
      }
      return cost;
    });
    return running;
  }

  return {
    /** The cached answer, asked again first when it is old or the interfaces changed. @returns {Promise<Cost>} */
    async status() {
      if (!asked || now() - asked > maxAgeMs || signature(interfaces) !== last) return refresh();
      return cost;
    },
    refresh,
    /** Starts the cheap interface check (once); a change asks the system again. */
    watch() {
      if (timer) return;
      timer = setInterval(() => {
        if (asked && signature(interfaces) !== last) refresh();
      }, pollMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    current: () => cost,
  };
}

module.exports = { createNetworkMonitor, detect, parseWindows, parseNmcli, parseMac, parseRoute, hardwarePortOf, signature, WINDOWS_SCRIPT };
