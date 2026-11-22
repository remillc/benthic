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
//   kind 'cloud' a .ssrf file in a personal cloud (Google Drive, OneDrive, Dropbox) reached through the
//                service's API (desktop/cloud.cjs); the core works on a git copy built from a local
//                working copy, <userData>/logbooks/<id>/logbook.ssrf, kept in step with the remote file
// `location` is the file path, the repository address (without any token), or for a cloud logbook the
// remote path shown to the diver ("OpenDives/plongees.ssrf"). `provider` is the personal cloud of a
// cloud logbook (or, in older recent lists, of a file in a synchronised folder).
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAIN_ID = 'main';
const MAX_RECENT = 12;
const STORE_FILE = 'logbooks.json';
const PROVIDERS = ['googleDrive', 'oneDrive', 'dropbox', 'webdav'];
/** What the start-up opens: the logbooks open at the last quit, or the start screen. */
const STARTUP_MODES = ['last', 'ask'];

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
  return typeof value === 'string' && (value === MAIN_ID || /^[fgc]-[0-9a-f]{12}$/.test(value));
}

/**
 * A cloud logbook: a remote file in `folder` (a path inside the app's folder, or the folder OpenDives
 * created on Google Drive), `fileName` its name there.
 * @param {{ provider: string, folder?: string, name: string, fileName?: string }} options
 */
function cloudDescriptor({ provider, folder = '', name, fileName }) {
  if (!PROVIDERS.includes(provider)) throw new Error('BAD_ARGUMENT: unknown service');
  const dir = cleanRemoteFolder(folder);
  const file = fileName || logbookFileName(name);
  return {
    id: `c-${digest(`${provider}:${dir.toLowerCase()}/${file.toLowerCase()}`)}`,
    kind: 'cloud',
    name: name || file,
    location: dir ? `${dir}/${file}` : file,
    provider,
    folder: dir,
    fileName: file,
  };
}

/**
 * A folder path typed by the diver, as the services take it: segments joined by "/", no empty one, no
 * "." or "..", nothing a service refuses. '' is the root of the app's folder. Throws BAD_ARGUMENT.
 * @param {string} folder
 */
function cleanRemoteFolder(folder) {
  const segments = String(folder ?? '').replaceAll(String.fromCharCode(92), '/').split('/').map((s) => s.trim()).filter(Boolean);
  const bad = (s) => s === '.' || s === '..' || s.length > 100 || [...s].some((c) => c.charCodeAt(0) < 32 || '<>:"|?*'.includes(c));
  if (segments.length > 6 || segments.some(bad)) throw new Error('BAD_ARGUMENT: folder');
  return segments.join('/');
}

/** A descriptor read from the file or built by the interface: only known fields, or null. @param {any} value */
function cleanDescriptor(value) {
  if (!value || typeof value !== 'object' || !validId(value.id)) return null;
  const kind = value.id === MAIN_ID ? 'main' : value.id.startsWith('f-') ? 'file' : value.id.startsWith('c-') ? 'cloud' : 'git';
  if (kind !== value.kind) return null;
  const out = { id: value.id, kind, name: String(value.name ?? '').slice(0, 200), location: String(value.location ?? '').slice(0, 2000) };
  if (kind === 'git' && typeof value.branch === 'string') out.branch = value.branch.slice(0, 200);
  if (kind === 'file' && PROVIDERS.includes(value.provider)) out.provider = value.provider;
  if (kind === 'cloud') {
    if (!PROVIDERS.includes(value.provider) || typeof value.fileName !== 'string' || !value.fileName) return null;
    try {
      out.folder = cleanRemoteFolder(value.folder);
    } catch {
      return null;
    }
    out.provider = value.provider;
    out.fileName = value.fileName.slice(0, 200);
  }
  if (kind !== 'main' && !out.location) return null;
  return out;
}

/** <userData>/logbooks/<id>: the cache of a file logbook (its git copy) and its bookkeeping. */
function cacheDir(/** @type {string} */ userData, /** @type {string} */ id) {
  if (!validId(id) || id === MAIN_ID) throw new Error('BAD_ARGUMENT: not a logbook id');
  return path.join(userData, 'logbooks', id);
}

/** The file the core's git copy is built from: the logbook's own file, or a cloud logbook's working copy. */
function localFileOf(/** @type {string} */ userData, /** @type {any} */ descriptor) {
  if (!descriptor) return null;
  if (descriptor.kind === 'file') return descriptor.location;
  if (descriptor.kind === 'cloud') return path.join(cacheDir(userData, descriptor.id), 'logbook.ssrf');
  return null;
}

/** The bookkeeping of a file or cloud logbook: <cache>/meta.json. @returns {Record<string, any>} */
function readMeta(/** @type {string} */ userData, /** @type {string} */ id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cacheDir(userData, id), 'meta.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Merges `patch` into the bookkeeping. @returns {Record<string, any>} */
function writeMeta(/** @type {string} */ userData, /** @type {string} */ id, /** @type {Record<string, any>} */ patch) {
  const file = path.join(cacheDir(userData, id), 'meta.json');
  const next = { ...readMeta(userData, id), ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next));
  return next;
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

/** The window's title bar text. @param {{ name?: string }|null} descriptor @param {string} [mainName] */
function windowTitle(descriptor, mainName = '') {
  if (!descriptor) return 'Benthic Log';
  const name = descriptor.name || mainName;
  return name ? `Benthic Log \u00b7 ${name}` : 'Benthic Log';
}

/**
 * What this computer remembers about its logbooks: <userData>/logbooks.json.
 *   recent    the recent logbooks, newest first
 *   names     user-chosen display names by logbook id, independent of recent entries
 *   startup   'last' (reopen the logbooks open at the last quit, the default) or 'ask' (the start screen)
 *   lastOpen  the descriptors open at the last quit, in window order
 */
class LogbookStore {
  /** @param {string} userData @param {() => number} [now] */
  constructor(userData, now = Date.now) {
    this.file = path.join(userData, STORE_FILE);
    this.now = now;
  }

  /** @returns {Record<string, any>} */
  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  /** @param {Record<string, any>} patch */
  save(patch) {
    const data = { ...this.read(), version: 1, ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** @returns {(ReturnType<typeof cleanDescriptor> & { openedAt: number })[]} */
  list() {
    const data = this.read();
    const seen = new Set();
    const out = [];
    for (const entry of Array.isArray(data.recent) ? data.recent : []) {
      const d = cleanDescriptor(entry);
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({ ...d, openedAt: Number.isFinite(entry.openedAt) ? entry.openedAt : 0 });
    }
    return out.slice(0, MAX_RECENT);
  }

  /** @param {any[]} recent */
  write(recent) {
    this.save({ recent });
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

  /** @param {any} descriptor */
  withSavedName(descriptor) {
    const d = cleanDescriptor(descriptor);
    if (!d) return null;
    const names = this.read().names;
    const name = names && typeof names === 'object' ? names[d.id] : undefined;
    return typeof name === 'string' && name.trim() && name.length <= 100 ? { ...d, name } : d;
  }

  /** @param {any} descriptor @param {unknown} name */
  rename(descriptor, name) {
    const d = cleanDescriptor(descriptor);
    if (!d || typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('BAD_ARGUMENT: logbook name');
    const renamed = { ...d, name: name.trim() };
    const data = this.read();
    const names = data.names && typeof data.names === 'object' && !Array.isArray(data.names) ? data.names : {};
    const recent = this.list().map((entry) => (entry.id === d.id ? { ...entry, name: renamed.name } : entry));
    const lastOpen = this.lastOpen().map((entry) => (entry.id === d.id ? { ...entry, name: renamed.name } : entry));
    this.save({ names: { ...names, [d.id]: renamed.name }, recent, lastOpen });
    return renamed;
  }

  /** « Ouvrir au démarrage » (Réglages › Carnet): 'last' unless the diver chose 'ask'. @returns {'last'|'ask'} */
  startup() {
    const mode = this.read().startup;
    return STARTUP_MODES.includes(mode) ? mode : 'last';
  }

  /** @param {string} mode */
  setStartup(mode) {
    if (!STARTUP_MODES.includes(mode)) throw new Error('BAD_ARGUMENT: start-up mode');
    this.save({ startup: mode });
    return mode;
  }

  /** The logbooks that were open at the last quit. @returns {NonNullable<ReturnType<typeof cleanDescriptor>>[]} */
  lastOpen() {
    const data = this.read();
    const seen = new Set();
    const out = [];
    for (const entry of Array.isArray(data.lastOpen) ? data.lastOpen : []) {
      const d = cleanDescriptor(entry);
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
    return out;
  }

  /** @param {any[]} descriptors */
  setLastOpen(descriptors) {
    const out = [];
    for (const entry of descriptors) {
      const d = cleanDescriptor(entry);
      if (d && !out.some((e) => e.id === d.id)) out.push(d);
    }
    this.save({ lastOpen: out });
    return out;
  }
}

module.exports = {
  MAIN,
  MAIN_ID,
  MAX_RECENT,
  PROVIDERS,
  STARTUP_MODES,
  cloudDescriptor,
  cleanRemoteFolder,
  localFileOf,
  readMeta,
  writeMeta,
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
  windowTitle,
};
