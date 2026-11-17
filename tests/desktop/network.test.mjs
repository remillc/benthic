// SPDX-License-Identifier: GPL-2.0
// The connection type of « Seulement sur Wi-Fi ou câble » (task 2026-11-15-202): the parsers of each system's answer,
// the cached monitor with a fake system, and, on Windows, the real detection.
// Run: node --test tests/desktop/network.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createNetworkMonitor, detect, parseWindows, parseNmcli, parseMac } = require('../../desktop/network.cjs');

test('Windows: the connection cost and the mobile broadband flag', () => {
  assert.equal(parseWindows('Unrestricted|False\r\n'), 'unmetered');
  assert.equal(parseWindows('Fixed|False'), 'metered');
  assert.equal(parseWindows('Variable|False'), 'metered');
  assert.equal(parseWindows('Unrestricted|True'), 'metered');
  assert.equal(parseWindows('Unknown|False'), 'unknown');
  assert.equal(parseWindows('none'), 'unknown');
  assert.equal(parseWindows(''), 'unknown');
});

test('Linux: NetworkManager metered property, guessed or set', () => {
  assert.equal(parseNmcli('GENERAL.DEVICE:wlp2s0\nGENERAL.METERED:yes (guessed)\nGENERAL.DEVICE:lo\nGENERAL.METERED:unknown\n'), 'metered');
  assert.equal(parseNmcli('GENERAL.DEVICE:enp3s0\nGENERAL.METERED:no (guessed)\nGENERAL.DEVICE:lo\nGENERAL.METERED:unknown\n'), 'unmetered');
  assert.equal(parseNmcli('GENERAL.DEVICE:enp3s0\nGENERAL.METERED:yes\n'), 'metered');
  assert.equal(parseNmcli('GENERAL.DEVICE:lo\nGENERAL.METERED:unknown\n'), 'unknown');
  assert.equal(parseNmcli(''), 'unknown');
});

test('macOS: hardware port, the iPhone hotspot gateway, an Android hotspot DHCP option', () => {
  const ports = 'Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa\n\nHardware Port: iPhone USB\nDevice: en5\nEthernet Address: bb\n';
  const route = (iface, gateway) => `   route to: default\n    gateway: ${gateway}\n  interface: ${iface}\n`;
  assert.equal(parseMac({ route: route('en0', '192.168.1.1'), ports }), 'unmetered');
  assert.equal(parseMac({ route: route('en5', '172.20.10.1'), ports }), 'metered');
  assert.equal(parseMac({ route: route('en0', '172.20.10.1'), ports }), 'metered');
  assert.equal(parseMac({ route: route('en0', '192.168.43.1'), ports, packet: 'vendor_encapsulated_options (opaque): ANDROID_METERED' }), 'metered');
  assert.equal(parseMac({ route: '', ports }), 'unknown');
});

test('a failed or missing command allows the sync (unknown), a platform without a way too', async () => {
  const boom = async () => {
    throw new Error('ENOENT');
  };
  assert.equal(await detect('linux', boom), 'unknown');
  assert.equal(await detect('win32', boom), 'unknown');
  assert.equal(await detect('darwin', boom), 'unknown');
  assert.equal(await detect('freebsd', boom), 'unknown');
});

test('the monitor caches, asks again when the interfaces change, and announces changes', async () => {
  let calls = 0;
  let answer = 'Unrestricted|False';
  let interfaces = { wlan0: [{ address: '192.168.1.5', internal: false }] };
  const changes = [];
  let now = 1000;
  const monitor = createNetworkMonitor({
    platform: 'win32',
    exec: async () => {
      calls++;
      return answer;
    },
    interfaces: () => interfaces,
    onChange: (c) => changes.push(c),
    now: () => now,
    pollMs: 5,
  });
  assert.equal(await monitor.status(), 'unmetered');
  assert.equal(await monitor.status(), 'unmetered');
  assert.equal(calls, 1, 'the second answer comes from the cache');
  // The diver joins a phone's hotspot: other address, metered cost.
  interfaces = { wlan0: [{ address: '172.20.10.4', internal: false }] };
  answer = 'Variable|False';
  assert.equal(await monitor.status(), 'metered');
  assert.equal(calls, 2);
  assert.deepEqual(changes, ['unmetered', 'metered']);
  // An old answer is asked again.
  now += 301000;
  await monitor.status();
  assert.equal(calls, 3);
  // The watch notices an interface change without anyone asking.
  monitor.watch();
  answer = 'Unrestricted|False';
  interfaces = { eth0: [{ address: '10.0.0.2', internal: false }] };
  await new Promise((r) => setTimeout(r, 60));
  monitor.stop();
  assert.equal(monitor.current(), 'unmetered');
  assert.deepEqual(changes, ['unmetered', 'metered', 'unmetered']);
});

test('the monitor asks the system once at a time', async () => {
  let calls = 0;
  const monitor = createNetworkMonitor({
    platform: 'linux',
    exec: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return 'GENERAL.METERED:no\n';
    },
    interfaces: () => ({}),
  });
  const all = await Promise.all([monitor.status(), monitor.refresh(), monitor.status()]);
  assert.deepEqual(all, ['unmetered', 'unmetered', 'unmetered']);
  assert.equal(calls, 1);
});

test('Windows, for real: the connection cost answers within seconds', { skip: process.platform !== 'win32' }, async () => {
  const started = Date.now();
  const cost = await detect('win32');
  assert.ok(['metered', 'unmetered', 'unknown'].includes(cost), cost);
  assert.ok(Date.now() - started < 8000);
});
