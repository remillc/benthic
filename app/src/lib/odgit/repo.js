// @ts-check
// A logbook of the OpenDives server as a real git working copy on the device (docs/architecture.md, « Git on the
// device »): isomorphic-git in JavaScript, files in the app's data folder, the server's git host over HTTP. Clone,
// pull (fetch + merge), commit, push in packs, status. The git host's web API is not used for the logbook any more.
//
// Every working copy has its own folder, made by `workingCopyDir`, and is only ever touched by this module: another git
// implementation on the same folder would leave an index that rehashes every file at the first status.
import './buffer-setup.js';
import git from 'isomorphic-git';

export const AUTHOR = { name: 'OpenDives', email: 'noreply@opendives.app' };

/** The error of a git operation: `UNREACHABLE` (no answer, a 5xx), `REFUSED` (401, 403, a push the host refuses), `CONFLICT`. */
export class GitError extends Error {
  /** @param {'UNREACHABLE'|'REFUSED'|'CONFLICT'|'CANCELLED'} code @param {string[]} [paths] the conflicting files */
  constructor(code, paths = []) {
    super(code);
    this.name = 'GitError';
    this.code = code;
    this.paths = paths;
  }
}

/**
 * The folder of a repository's working copy: one per host, owner and repository, so that two accounts or two logbooks
 * never meet.
 * @param {string} repositoryUrl
 * @returns {string} a path inside the backend's root
 */
export function workingCopyDir(repositoryUrl) {
  let name;
  try {
    const u = new URL(repositoryUrl);
    name = `${u.host}${u.pathname}`.replace(/\.git$/, '');
  } catch {
    name = repositoryUrl;
  }
  return `/${name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'logbook'}`;
}

/** @param {any} e @returns {GitError} */
export function toGitError(e) {
  if (e instanceof GitError) return e;
  const name = String(e?.name ?? '');
  const code = String(e?.code ?? '');
  if (code === 'MergeConflictError' || name === 'MergeConflictError') return new GitError('CONFLICT', e?.data?.filepaths ?? []);
  if (code === 'HttpError' || name === 'HttpError') {
    const status = Number(e?.data?.statusCode);
    return new GitError(status === 401 || status === 403 || status === 404 ? 'REFUSED' : 'UNREACHABLE');
  }
  if (code === 'PushRejectedError' || name === 'PushRejectedError' || code === 'UserCanceledError' || code === 'MissingUsernameError') return new GitError('REFUSED');
  return new GitError('UNREACHABLE');
}

/**
 * @typedef {Object} RepoOptions
 * @property {any} fs from createGitFs
 * @property {any} http from createGitHttp
 * @property {string} dir the working copy's folder
 * @property {string} url the repository's address
 * @property {string} branch
 * @property {string} token the git token of the session (secure storage), sent as `Authorization: token ...`
 * @property {{ name: string, email: string }} [author]
 */

/**
 * @typedef {Object} Progress
 * @property {string} phase
 * @property {number} loaded
 * @property {number} [total]
 */

/**
 * @param {RepoOptions} o
 */
export function openRepo(o) {
  const { fs, http, dir, url, branch } = o;
  const author = o.author ?? AUTHOR;
  const headers = { Authorization: `token ${o.token}` };
  const remoteRef = `refs/remotes/origin/${branch}`;
  // isomorphic-git keeps the parsed index and the packs it read in this object: one per working copy, reused by every call.
  const cache = {};
  /** @param {string} p */
  const file = (p) => `${dir}/${p}`;

  /** @param {unknown} e */
  const fail = (e) => {
    throw toGitError(e);
  };

  async function hasWorkingCopy() {
    try {
      await fs.promises.stat(`${dir}/.git/HEAD`);
      return true;
    } catch {
      return false;
    }
  }

  /** An empty repository on the host: init and remote only. */
  async function initEmpty() {
    await git.init({ fs, dir, defaultBranch: branch });
    await git.addRemote({ fs, dir, remote: 'origin', url, force: true });
  }

  /** Whether the host has the branch yet. @returns {Promise<boolean>} */
  async function remoteHasBranch() {
    try {
      const info = await git.getRemoteInfo({ http, url, headers });
      return !!info.refs?.heads?.[branch];
    } catch (e) {
      return fail(e);
    }
  }

  return {
    hasWorkingCopy,
    dir,

    /**
     * The first load of a logbook. An empty repository gives an empty working copy (`'empty'`).
     * @param {(p: Progress) => void} [onProgress]
     * @returns {Promise<'cloned'|'empty'>}
     */
    async clone(onProgress) {
      if (await hasWorkingCopy()) throw new Error('EXISTS');
      if (!(await remoteHasBranch())) {
        await initEmpty();
        return 'empty';
      }
      try {
        await git.clone({ fs, http, dir, cache, url, ref: branch, singleBranch: true, noTags: true, headers, onProgress });
      } catch (e) {
        // A half-made working copy would pass for a complete one: removed.
        await fs.promises.rmdir(dir).catch(() => {});
        return fail(e);
      }
      return 'cloned';
    },

    /**
     * Fetch, then merge into the branch. A conflict leaves the working copy as it was and says which files.
     * @param {(p: Progress) => void} [onProgress]
     * @returns {Promise<'upToDate'|'fastForward'|'merged'|'empty'>}
     */
    async pull(onProgress) {
      if (!(await remoteHasBranch())) return 'empty';
      try {
        await git.fetch({ fs, http, dir, cache, url, remote: 'origin', ref: branch, singleBranch: true, tags: false, headers, onProgress });
        const ours = await git.resolveRef({ fs, dir, ref: branch }).catch(() => null);
        const theirs = await git.resolveRef({ fs, dir, ref: remoteRef });
        if (ours === theirs) return 'upToDate';
        const result = await git.merge({ fs, dir, cache, ours: branch, theirs: remoteRef, author, abortOnConflict: true });
        if (result.alreadyMerged) return 'upToDate';
        await git.checkout({ fs, dir, cache, ref: branch, onProgress });
        return result.fastForward ? 'fastForward' : 'merged';
      } catch (e) {
        return fail(e);
      }
    },

    /**
     * Writes the files, stages them and commits. Resolves with the commit's id (null when there is nothing to commit).
     * @param {{ path: string, text: string }[]} files
     * @param {string} message
     * @returns {Promise<string|null>}
     */
    async commitFiles(files, message) {
      if (!files.length) return null;
      const enc = new TextEncoder();
      for (const f of files) await fs.promises.writeFile(file(f.path), enc.encode(f.text));
      return this.commitStaged(files.map((f) => f.path), message);
    },

    /** Stages files already written in the working copy, and commits. @param {string[]} paths @param {string} message */
    async commitStaged(paths, message) {
      if (!paths.length) return null;
      try {
        await git.add({ fs, dir, cache, filepath: paths, parallel: true });
        return await git.commit({ fs, dir, cache, message, author, committer: author });
      } catch (e) {
        return fail(e);
      }
    },

    /** @param {string} path @param {string} text */
    writeText: (path, text) => fs.promises.writeFile(file(path), new TextEncoder().encode(text)),

    /** @param {string} path @returns {Promise<string|null>} */
    async readText(path) {
      try {
        return /** @type {string} */ (await fs.promises.readFile(file(path), 'utf8'));
      } catch {
        return null;
      }
    },

    /** Sends the commits the host does not have. @param {(p: Progress) => void} [onProgress] */
    async push(onProgress) {
      try {
        const result = await git.push({ fs, http, dir, cache, url, remote: 'origin', ref: branch, remoteRef: branch, headers, onProgress });
        if (!result.ok) throw new GitError('REFUSED');
      } catch (e) {
        return fail(e);
      }
    },

    /** The commits not pushed yet (the host's branch as the last fetch or push left it). @returns {Promise<number>} */
    async unpushed() {
      const head = await git.resolveRef({ fs, dir, ref: branch }).catch(() => null);
      if (!head) return 0;
      const remote = await git.resolveRef({ fs, dir, ref: remoteRef }).catch(() => null);
      if (remote === head) return 0;
      // The commits after the common ancestor (all of them when the host has nothing yet or the histories are unrelated).
      const bases = remote ? await git.findMergeBase({ fs, dir, oids: [head, remote] }).catch(() => []) : [];
      let n = 0;
      for (const c of await git.log({ fs, dir, ref: branch })) {
        if (bases.includes(c.oid)) break;
        n++;
      }
      return n;
    },

    /** Everything staged or committed, as paths. @returns {Promise<string[]>} */
    listFiles: () => git.listFiles({ fs, dir, cache }),

    /**
     * What differs from the last commit: `'unmodified'`, `'modified'`, `'added'`, `'deleted'` or `'absent'`, for the
     * given files only (a status of the whole tree reads every file).
     * @param {string[]} [paths]
     * @returns {Promise<Record<string, 'unmodified'|'modified'|'added'|'deleted'|'absent'>>}
     */
    async status(paths) {
      const rows = await git.statusMatrix({ fs, dir, cache, filepaths: paths });
      /** @type {Record<string, 'unmodified'|'modified'|'added'|'deleted'|'absent'>} */
      const out = {};
      for (const [p, head, workdir, stage] of rows) {
        out[p] = head === 1 && workdir === 1 && stage === 1 ? 'unmodified' : head === 0 ? 'added' : workdir === 0 ? 'deleted' : 'modified';
      }
      return out;
    },

    /** Removes the working copy (a sign-out, a reset). */
    async remove() {
      await fs.promises.rmdir(dir).catch(() => {});
    },
  };
}
