// A stand-in for the core's `history` calls (core/libbenthic/benthic.h, history_call) on a real git repository driven by
// the git command line, so that the version engine (app/src/lib/backup-history.js) is tested against real commits.
// Not a test file: tests/app/backup-history.test.mjs uses it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export class GitLogbook {
  /** A new repository in a temporary folder, branch `main`. */
  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), 'od-history-'));
    this.git('init', '-q', '-b', 'main');
    this.git('config', 'user.email', 't@example.invalid');
    this.git('config', 'user.name', 'Test');
    this.clock = 1795000000;
  }

  /** @param {string[]} args @param {{ input?: string, env?: Record<string,string> }} [options] */
  git(...args) {
    const last = args[args.length - 1];
    const options = last && typeof last === 'object' ? /** @type {any} */ (args.pop()) : {};
    return execFileSync('git', args, { cwd: this.dir, encoding: 'utf8', input: options.input, env: { ...process.env, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  }

  /** Writes and removes files, then commits (one version). @param {Record<string, string|null>} files @param {string} [message] */
  commit(files, message = 'Changes made:') {
    for (const [path, text] of Object.entries(files)) {
      const full = join(this.dir, path);
      if (text === null) rmSync(full, { force: true, recursive: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
      }
    }
    this.git('add', '-A');
    this.clock += 3600;
    const when = `${this.clock} +0000`;
    this.git('commit', '-q', '--allow-empty', '-m', message, { env: { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } });
    return this.head();
  }

  head() {
    return this.git('rev-parse', 'HEAD').trim();
  }

  /** @param {string} action @param {string[]} [args] */
  async history(action, args = []) {
    switch (action) {
      case 'info':
        return { head: this.head(), remote: null, branch: 'main' };
      case 'log': {
        const [skip, limit, changes] = args.map(Number);
        const ids = this.git('rev-list', '--topo-order', 'HEAD').split('\n').filter(Boolean);
        const slice = ids.slice(skip, skip + limit);
        return {
          commits: slice.map((id) => {
            const [time, author, summary, parents] = this.git('show', '-s', '--format=%ct%n%an%n%s%n%P', id).split('\n');
            const parentList = parents ? parents.split(' ') : [];
            /** @type {any} */
            const commit = { id, time: Number(time), author, summary, message: summary, parents: parentList };
            if (changes) commit.changes = this.diff(parentList[0] ?? '', id);
            return commit;
          }),
          more: ids.length > skip + limit,
        };
      }
      case 'diff':
        return { changes: this.diff(args[0], args[1]) };
      case 'stats':
        return {
          stats: args.map((id) => {
            const files = this.git('ls-tree', '-r', '--name-only', id).split('\n').filter(Boolean);
            return {
              id,
              dives: files.filter((f) => /\/Dive(-\d+)?$/.test(f)).length,
              sites: files.filter((f) => /^01-Divesites\/Site-/.test(f)).length,
              pieces: files.some((f) => f.startsWith('gear/')) ? files.filter((f) => f.startsWith('gear/')).length : null,
            };
          }),
        };
      case 'read':
        try {
          return { text: this.git('show', `${args[0]}:${args[1]}`) };
        } catch {
          return { text: null };
        }
      case 'files':
        return { files: this.git('ls-tree', '-r', '--name-only', args[0]).split('\n').filter((f) => f && f.startsWith(args[1])) };
      case 'restore': {
        const [commit, message, ...paths] = args;
        const index = join(this.dir, '.git', 'restore-index');
        const env = { GIT_INDEX_FILE: index };
        let tree;
        if (!paths.length) tree = this.git('rev-parse', `${commit}^{tree}`).trim();
        else {
          this.git('read-tree', 'HEAD', { env });
          for (const p of paths) {
            this.git('rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', p, { env });
            for (const line of this.git('ls-tree', '-r', commit, '--', p).split('\n').filter(Boolean)) {
              const [meta, path] = line.split('\t');
              const [mode, , sha] = meta.split(' ');
              this.git('update-index', '--add', '--cacheinfo', `${mode},${sha},${path}`, { env });
            }
          }
          tree = this.git('write-tree', { env }).trim();
        }
        if (tree === this.git('rev-parse', 'HEAD^{tree}').trim()) return { commit: null };
        this.clock += 3600;
        const when = `${this.clock} +0000`;
        const created = this.git('commit-tree', tree, '-p', 'HEAD', '-m', message, { env: { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } }).trim();
        this.git('update-ref', 'refs/heads/main', created);
        this.git('reset', '-q', '--hard', 'HEAD');
        return { commit: created };
      }
      default:
        throw new Error(`BAD_ACTION ${action}`);
    }
  }

  /** @param {string} from @param {string} to */
  diff(from, to) {
    const out = this.git('diff-tree', '-r', '--no-renames', '--name-status', from || EMPTY_TREE, to);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split('\t');
        return { path, state: status === 'A' ? 'new' : status === 'D' ? 'deleted' : 'modified' };
      });
  }

  /** The files of the current commit. */
  files() {
    return this.git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean);
  }

  /** @param {string} path */
  readNow(path) {
    return this.git('show', `HEAD:${path}`);
  }

  dispose() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
