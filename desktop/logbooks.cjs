// SPDX-License-Identifier: GPL-2.0
// Logbooks of the desktop app (task 2026-11-15-173): what a window holds, the list of recent
// logbooks kept on this computer, and the pure helpers around them. Node only, no Electron: it is
// tested on its own (tests/desktop/logbooks.test.mjs).
//
// A logbook is a source. Its descriptor, as the interface sees it (window.odDesktop.logbook):
//   { id, kind, name, location, provider? , branch? }
//   kind 'main'  the logbook of this computer: <userData>/carnet, local or the Subsurface cloud account,
//                exactly as the app had before there were several (id 'main')
//   kind 'file'  a .ssrf file; the core works on a git copy in <userData>/logbooks/<id>/repo that the
//                bridge writes back to the file after every save (bridge.cjs)
//   kind 'git'   a git repository the diver owns (token in the keychain, scoped to this id)
// `location` is the file path, or the repository address (without any token). `provider` is the
// personal cloud whose synchronised folder holds the file, when the diver chose one.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAIN_ID = 'main';
const MAX_RECENT = 12;
const STORE_FILE = 'logbooks.json';
const PROVIDERS = ['googleDrive', 'oneDrive', 'dropbox', 'iCloud', 'webdav'];

/** The logbook of this computer, as before there were several. */
const MAIN = Object.freeze({ id: MAIN_ID, kind: 'main', name: '', location: '' });

/** @param {string} text */
const digest = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

/** The same file gets the same id on every start: a path, in the case the system compares it. */
function filePathKey(/** @type {string} */ file, platform = process.platform) {
  const resolved = path.resolve(file);
  return platform === 'win32' || platform === 'darwin' ? resolved.toLowerCase() : resolved;
}

/** @param {string} file @param {{ name?: string, provider?: string, platform?: string }} [options] */
function fileDescriptor(file, options = {}) {
  const resolved = path.resolve(file);
  return {
    id: `f-${digest(filePathKey(resolved, options.platform))}`,
    kind: 'file',
    name: options.name || path.basename(resolved),
    location: resolved,
    ...(options.provider && PROVIDERS.includes(options.provider) ? { provider: options.provider } : {}),
  };
}

/** The address without its scheme-less trailing slashes, as the diver types it. @param {string} url */
function normalGitUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** @param {{ url: string, branch: string, name?: string }} options */
function gitDescriptor({ url, branch, name }) {
  const address = normalGitUrl(url);
  const short = address.replace(/^[a-z]+:\/\//i, '').replace(/\.git$/i, '');
  return { id: `g-${digest(`${address.toLowerCase()}[${branch}]`)}`, kind: 'git', name: name || short.split('/').pop() || short, location: address, branch };
}

/** @param {unknown} value @returns {boolean} */
function validId(value) {
  return typeof value === 'string' && (value === MAIN_ID || /^[fg]-[0-9a-f]{12}$/.test(value));
}

/** A descriptor read from the file or built by the interface: only known fields, or null. @param {any} value */
function cleanDescriptor(value) {
  if (!value || typeof value !== 'object' || !validId(value.id)) return null;
  const kind = value.id === MAIN_ID ? 'main' : value.id.startsWith('f-') ? 'file' : 'git';
  if (kind !== value.kind) return null;
  const out = { id: value.id, kind, name: String(value.name ?? '').slice(0, 200), location: String(value.location ?? '').slice(0, 2000) };
  if (kind === 'git' && typeof value.branch === 'string') out.branch = value.branch.slice(0, 200);
  if (kind === 'file' && PROVIDERS.includes(value.provider)) out.provider = value.provider;
  if (kind !== 'main' && !out.location) return null;
  return out;
}

/** <userData>/logbooks/<id>: the cache of a file logbook (its git copy) and its bookkeeping. */
function cacheDir(/** @type {string} */ userData, /** @type {string} */ id) {
  if (!validId(id) || id === MAIN_ID) throw new Error('BAD_ARGUMENT: not a logbook id');
  return path.join(userData, 'logbooks', id);
}

/** A file name for a logbook called `name`: nothing a file system refuses, .ssrf added once. */
function logbookFileName(/** @type {string} */ name) {
  // eslint-disable-next-line no-control-regex
  const base = String(name || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 120);
  const stem = base.replace(/\.ssrf$/i, '') || 'carnet';
  return `${stem}.ssrf`;
}

/** @param {string} file */
function isLogbookFile(file) {
  return /\.(ssrf|xml)$/i.test(String(file || ''));
}

/** What a new, empty .ssrf file holds: Subsurface reads it as a logbook without a dive. */
const EMPTY_LOGBOOK = '<divelog program=\'subsurface\' version=\'3\'>\n<settings>\n</settings>\n<divesites>\n</divesites>\n<dives>\n</dives>\n</divelog>\n';

/** SHA-1 of a file, for the bridge to know whether the file changed since it last wrote it. @param {string} file */
function fileHash(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

/**
 * The folders the personal clouds' own desktop clients keep in sync, where they exist. A folder
 * synchronised by the provider's client is a plain folder for OpenDives: the file in it is a file
 * logbook, and the client does the rest. @param {{ platform: string, home: string, env: Record<string, string|undefined>, exists: (p: string) => boolean }} where
 * @returns {{ provider: string, folder: string }[]}
 */
function cloudFolders({ platform, home, env, exists }) {
  /** @type {{ provider: string, folders: (string|undefined)[] }[]} */
  const candidates = [
    { provider: 'googleDrive', folders: [path.join(home, 'Google Drive'), path.join(home, 'My Drive'), 'G:\\My Drive', path.join(home, 'Library', 'CloudStorage', 'GoogleDrive')] },
    { provider: 'oneDrive', folders: [env.OneDrive, env.OneDriveConsumer, path.join(home, 'OneDrive'), path.join(home, 'Library', 'CloudStorage', 'OneDrive-Personal')] },
    { provider: 'dropbox', folders: [path.join(home, 'Dropbox')] },
  ];
  if (platform === 'darwin') candidates.push({ provider: 'iCloud', folders: [path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')] });
  /** @type {{ provider: string, folder: string }[]} */
  const found = [];
  for (const { provider, folders } of candidates) {
    const folder = folders.find((f) => f && exists(f));
    if (folder) found.push({ provider, folder });
  }
  return found;
}

/** The providers a computer offers: iCloud Drive on macOS only. @param {string} platform */
function cloudProviders(platform) {
  return PROVIDERS.filter((p) => p !== 'iCloud' || platform === 'darwin');
}

/** The window's title bar text. @param {{ name?: string }|null} descriptor @param {string} [mainName] */
function windowTitle(descriptor, mainName = '') {
  if (!descriptor) return 'OpenDives';
  const name = descriptor.name || mainName;
  return name ? `OpenDives \u00b7 ${name}` : 'OpenDives';
}

/** The recent logbooks of this computer: <userData>/logbooks.json, newest first. */
class LogbookStore {
  /** @param {string} userData @param {() => number} [now] */
  constructor(userData, now = Date.now) {
    this.file = path.join(userData, STORE_FILE);
    this.now = now;
  }

  /** @returns {(ReturnType<typeof cleanDescriptor> & { openedAt: number })[]} */
  list() {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const entry of Array.isArray(data?.recent) ? data.recent : []) {
      const d = cleanDescriptor(entry);
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({ ...d, openedAt: Number.isFinite(entry.openedAt) ? entry.openedAt : 0 });
    }
    return out.slice(0, MAX_RECENT);
  }

  /** @param {any[]} recent */
  write(recent) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, recent }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** A logbook was opened: first in the list. @param {any} descriptor */
  remember(descriptor) {
    const d = cleanDescriptor(descriptor);
    if (!d) return this.list();
    const recent = [{ ...d, openedAt: this.now() }, ...this.list().filter((e) => e.id !== d.id)].slice(0, MAX_RECENT);
    this.write(recent);
    return recent;
  }

  /** @param {string} id */
  forget(id) {
    const recent = this.list().filter((e) => e.id !== id);
    this.write(recent);
    return recent;
  }

  clear() {
    this.write([]);
    return [];
  }

  /** @param {string} id */
  find(id) {
    return this.list().find((e) => e.id === id) ?? null;
  }
}

module.exports = {
  MAIN,
  MAIN_ID,
  MAX_RECENT,
  PROVIDERS,
  EMPTY_LOGBOOK,
  LogbookStore,
  fileDescriptor,
  gitDescriptor,
  normalGitUrl,
  cleanDescriptor,
  validId,
  cacheDir,
  logbookFileName,
  isLogbookFile,
  fileHash,
  cloudFolders,
  cloudProviders,
  windowTitle,
};
