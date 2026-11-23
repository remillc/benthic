// A stand-in for the core's `bgit*` calls (core/libbenthic/bgit.cpp, plugins/benthic-core/core-api.js) on real git,
// driven by the git command line: a bare « server » repository (FakeRemote) and, per device, working copies made under
// one folder (FakeBgit). Re-exported by tests/app/git-history-core.mjs; used by tests/app/account-sync.test.mjs and
// account-join.test.mjs to run two devices on one account. The semantics follow bgit.cpp: a conflicting pull leaves the
// disk unchanged and lists base/ours/theirs, and bgitCommit with `mergeParent` builds the merge of HEAD and that commit
// with the given files taken from the disk.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** A bare repository playing the server. */
export class FakeRemote {
  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), 'bc-remote-'));
    execFileSync('git', ['init', '-q', '--bare', '-b', 'benthic', this.dir]);
  }

  /** The files of the branch's head, by path. @returns {Record<string, string>} */
  files() {
    /** @type {Record<string, string>} */
    const out = {};
    let names;
    try {
      names = execFileSync('git', ['ls-tree', '-r', '--name-only', 'benthic'], { cwd: this.dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
    } catch {
      return out;
    }
    for (const name of names) out[name] = execFileSync('git', ['show', `benthic:${name}`], { cwd: this.dir, encoding: 'utf8' });
    return out;
  }

  head() {
    try {
      return execFileSync('git', ['rev-parse', '-q', '--verify', 'benthic'], { cwd: this.dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  }

  dispose() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/** The error of a core call: a code, as the plugin rejects. @param {string} code */
const fail = (code) => Object.assign(new Error(code), { code });

export class FakeBgit {
  /** @param {{ remote: FakeRemote, url?: string, name?: string }} options */
  constructor({ remote, url = 'https://server.example/diver/log.git', name = 'device' }) {
    this.remote = remote;
    this.url = url;
    this.root = mkdtempSync(join(tmpdir(), `bc-${name}-`));
    /** Hooks by call name, run before the call: `before.bgitPush = async () => {...}`. @type {Record<string, () => Promise<void>|void>} */
    this.before = {};
    /** The calls made, in order. @type {string[]} */
    this.calls = [];
    this.clock = 1795000000;
    /** The next pushes to refuse, as if the server had moved. */
    this.rejectNextPush = 0;
  }

  /** @param {string} name */
  async hook(name) {
    this.calls.push(name);
    await this.before[name]?.();
  }

  /** @param {string} dir @param {string[]} args @param {{ env?: Record<string,string> }} [options] */
  git(dir, args, options = {}) {
    return execFileSync('git', args, { cwd: join(this.root, dir), encoding: 'utf8', env: { ...process.env, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  }

  /** @param {string} dir @param {string[]} args */
  tryGit(dir, args) {
    try {
      return this.git(dir, args);
    } catch {
      return null;
    }
  }

  /** @param {string} dir */
  requireCopy(dir) {
    if (!existsSync(join(this.root, dir, '.git'))) throw fail('NO_WORKING_COPY');
  }

  commitEnv() {
    this.clock += 60;
    const when = `${this.clock} +0000`;
    return { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
  }

  async serverSessionAccess() {
    return { repositoryUrl: this.url, username: 'diver', token: 'token', branch: 'benthic', sessionToken: 'session' };
  }

  /** @param {{ dir: string }} o */
  async bgitClone({ dir }) {
    await this.hook('bgitClone');
    if (existsSync(join(this.root, dir, '.git'))) throw fail('EXISTS');
    mkdirSync(join(this.root, dir), { recursive: true });
    this.git(dir, ['init', '-q', '-b', 'benthic']);
    this.git(dir, ['config', 'user.email', 'd@example.invalid']);
    this.git(dir, ['config', 'user.name', 'Device']);
    this.git(dir, ['config', 'core.autocrlf', 'false']);
    this.git(dir, ['remote', 'add', 'origin', this.remote.dir]);
    if (!this.remote.head()) return { result: 'empty', head: null };
    this.git(dir, ['fetch', '-q', 'origin', 'benthic']);
    this.git(dir, ['checkout', '-q', '-f', '-B', 'benthic', 'origin/benthic']);
    return { result: 'cloned', head: this.head(dir) };
  }

  /** @param {string} dir */
  head(dir) {
    return this.tryGit(dir, ['rev-parse', '-q', '--verify', 'HEAD'])?.trim() ?? null;
  }

  /** @param {{ dir: string }} o */
  async bgitPull({ dir }) {
    await this.hook('bgitPull');
    this.requireCopy(dir);
    if (!this.remote.head()) return { result: 'empty', head: this.head(dir) };
    this.git(dir, ['fetch', '-q', 'origin', 'benthic']);
    const theirs = this.git(dir, ['rev-parse', 'origin/benthic']).trim();
    const ours = this.head(dir);
    if (!ours) {
      this.git(dir, ['checkout', '-q', '-f', '-B', 'benthic', 'origin/benthic']);
      return { result: 'fastForward', head: theirs };
    }
    if (ours === theirs) return { result: 'upToDate', head: ours };
    const base = this.tryGit(dir, ['merge-base', ours, theirs])?.trim();
    if (base === theirs) return { result: 'upToDate', head: ours };
    if (base === ours) {
      this.git(dir, ['reset', '-q', '--hard', theirs]);
      return { result: 'fastForward', head: theirs };
    }
    let clean = true;
    try {
      this.git(dir, ['merge', '-q', '--no-commit', '--no-ff', '--allow-unrelated-histories', 'origin/benthic']);
    } catch {
      clean = false;
    }
    if (clean) {
      this.git(dir, ['commit', '-q', '-m', 'Merge origin/benthic'], { env: this.commitEnv() });
      return { result: 'merged', head: this.head(dir) };
    }
    const paths = this.git(dir, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    const stage = (/** @type {number} */ n, /** @type {string} */ p) => this.tryGit(dir, ['show', `:${n}:${p}`]);
    const files = paths.map((path) => ({ path, base: stage(1, path), ours: stage(2, path), theirs: stage(3, path) }));
    this.git(dir, ['merge', '--abort']);
    return { result: 'conflict', ours, theirs, files };
  }

  /** @param {{ dir: string, paths: string[], message: string, mergeParent?: string }} o */
  async bgitCommit({ dir, paths, message, mergeParent }) {
    await this.hook('bgitCommit');
    this.requireCopy(dir);
    const env = this.commitEnv();
    if (mergeParent) {
      const saved = paths.map((p) => [p, existsSync(join(this.root, dir, p)) ? readFileSync(join(this.root, dir, p), 'utf8') : null]);
      this.git(dir, ['reset', '-q', '--hard', 'HEAD']);
      try {
        this.git(dir, ['merge', '-q', '--no-commit', '--no-ff', '--allow-unrelated-histories', mergeParent]);
      } catch {
        // The conflicts are resolved below.
      }
      for (const [p, text] of saved) {
        if (text === null) {
          this.tryGit(dir, ['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', p]);
          rmSync(join(this.root, dir, p), { force: true });
        } else {
          mkdirSync(dirname(join(this.root, dir, p)), { recursive: true });
          writeFileSync(join(this.root, dir, p), text);
          this.git(dir, ['add', '-f', '--', p]);
        }
      }
      if (this.git(dir, ['diff', '--name-only', '--diff-filter=U']).trim()) throw fail('GIT_ERROR');
      this.git(dir, ['commit', '-q', '-m', message], { env });
      return { commit: this.head(dir) };
    }
    for (const p of paths) {
      if (existsSync(join(this.root, dir, p))) this.git(dir, ['add', '-f', '--', p]);
      else this.tryGit(dir, ['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', p]);
    }
    const unborn = !this.head(dir);
    if (!unborn && this.tryGit(dir, ['diff', '--cached', '--quiet']) !== null) return { commit: null };
    if (unborn && !this.git(dir, ['ls-files']).trim()) return { commit: null };
    this.git(dir, ['commit', '-q', '-m', message], { env });
    return { commit: this.head(dir) };
  }

  /** @param {{ dir: string }} o */
  async bgitPush({ dir }) {
    await this.hook('bgitPush');
    this.requireCopy(dir);
    if (this.rejectNextPush > 0) {
      this.rejectNextPush--;
      throw fail('REJECTED');
    }
    const before = this.remote.head();
    try {
      this.git(dir, ['push', '-q', 'origin', 'HEAD:refs/heads/benthic']);
    } catch (e) {
      if (/rejected|non-fast-forward|fetch first/i.test(String(/** @type {any} */ (e).stderr))) throw fail('REJECTED');
      throw fail('GIT_ERROR');
    }
    return { result: this.remote.head() === before ? 'upToDate' : 'pushed', head: this.head(dir) };
  }

  /** @param {{ dir: string }} o */
  async bgitHead({ dir }) {
    await this.hook('bgitHead');
    this.requireCopy(dir);
    return { head: this.head(dir), remote: this.tryGit(dir, ['rev-parse', '-q', '--verify', 'origin/benthic'])?.trim() ?? null };
  }

  /** @param {{ dir: string }} o */
  async bgitUnpushed({ dir }) {
    this.requireCopy(dir);
    const remote = this.tryGit(dir, ['rev-parse', '-q', '--verify', 'origin/benthic'])?.trim();
    if (!this.head(dir)) return { ahead: 0, behind: 0 };
    if (!remote) return { ahead: Number(this.git(dir, ['rev-list', '--count', 'HEAD']).trim()), behind: 0 };
    const [behind, ahead] = this.git(dir, ['rev-list', '--left-right', '--count', 'origin/benthic...HEAD']).trim().split(/\s+/).map(Number);
    return { ahead, behind };
  }

  /** @param {{ dir: string, files: { path: string, text: string|null }[] }} o */
  async bgitWrite({ dir, files }) {
    await this.hook('bgitWrite');
    this.requireCopy(dir);
    let written = 0;
    let deleted = 0;
    for (const { path, text } of files) {
      if (path.startsWith('/') || path.includes('..') || path.startsWith('.git')) throw fail('BAD_PATH');
      const full = join(this.root, dir, path);
      if (text === null) {
        rmSync(full, { force: true });
        deleted++;
      } else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
        written++;
      }
    }
    return { written, deleted };
  }

  /** @param {{ dir: string, paths: string[] }} o */
  async bgitRead({ dir, paths }) {
    await this.hook('bgitRead');
    this.requireCopy(dir);
    return { texts: paths.map((p) => this.tryGit(dir, ['show', `HEAD:${p}`])) };
  }

  /** @param {{ dir: string, fromCommit: string, toCommit?: string }} o */
  async bgitDiff({ dir, fromCommit, toCommit }) {
    await this.hook('bgitDiff');
    this.requireCopy(dir);
    const to = !toCommit || toCommit === 'HEAD' ? 'HEAD' : toCommit;
    if (fromCommit && this.tryGit(dir, ['cat-file', '-e', `${fromCommit}^{commit}`]) === null) throw fail('UNKNOWN_COMMIT');
    const out = this.git(dir, ['diff-tree', '-r', '--no-renames', '--name-status', fromCommit || EMPTY_TREE, to]);
    return {
      changes: out.split('\n').filter(Boolean).map((line) => {
        const [status, path] = line.split('\t');
        return { path, state: status === 'A' ? 'new' : status === 'D' ? 'deleted' : 'modified' };
      }),
    };
  }

  /** @param {{ dir: string }} o */
  async bgitFiles({ dir }) {
    this.requireCopy(dir);
    if (!this.head(dir)) return { files: [] };
    return { files: this.git(dir, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean) };
  }

  /** @param {{ dir: string }} o */
  async bgitRemove({ dir }) {
    rmSync(join(this.root, dir), { recursive: true, force: true });
  }

  /** The files of the working copy's head, by path. @param {string} dir @returns {Record<string, string>} */
  tree(dir) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const p of (this.head(dir) ? this.git(dir, ['ls-tree', '-r', '--name-only', 'HEAD']) : '').split('\n').filter(Boolean)) out[p] = this.git(dir, ['show', `HEAD:${p}`]);
    return out;
  }

  dispose() {
    rmSync(this.root, { recursive: true, force: true });
  }
}
