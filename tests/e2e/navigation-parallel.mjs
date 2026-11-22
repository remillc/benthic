// SPDX-License-Identifier: GPL-2.0
// The navigation e2e in shards: the blocks of tests/e2e/navigation.mjs are shared among N processes that run together
// (each with its own development server, its own Chrome and its own copy of the core, so nothing is shared between them).
//
//   node tests/e2e/navigation-parallel.mjs [--shards=3] [other options of navigation.mjs]
//
// BC_E2E_PORT (default 5541) is the port of the first shard; the others take the ports after it. The exit code is 0 only
// when every shard passed. A shard that cannot start (no Chrome, no core host) ends the run with its own code 2.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const given = process.argv.slice(2);
const shards = Number(given.find((a) => a.startsWith('--shards='))?.slice(9) || process.env.BC_E2E_SHARDS || 3);
const forwarded = given.filter((a) => !a.startsWith('--shards='));
const firstPort = Number(process.env.BC_E2E_PORT || 5541);
const started = Date.now();

/** @param {number} index from 1 @returns {Promise<{ index: number, code: number, checks: number, failures: number }>} */
function run(index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, 'navigation.mjs'), `--shard=${index}/${shards}`, ...forwarded], {
      env: { ...process.env, BC_E2E_PORT: String(firstPort + index - 1) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const take = (/** @type {Buffer} */ d) => (out += d);
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => {
      // A shard's output is printed whole once it ends, so the lines of two shards never mix.
      console.log(`\n=== shard ${index}/${shards} ===\n${out.trimEnd()}`);
      const total = /(\d+) checks, (\d+) failure\(s\)/.exec(out);
      resolve({ index, code: code ?? 1, checks: total ? Number(total[1]) : 0, failures: total ? Number(total[2]) : 0 });
    });
  });
}

const results = await Promise.all(Array.from({ length: shards }, (_, i) => run(i + 1)));
const checks = results.reduce((n, r) => n + r.checks, 0);
const failures = results.reduce((n, r) => n + r.failures, 0);
const seconds = Math.round((Date.now() - started) / 1000);
console.log(`\n${checks} checks in ${shards} shards, ${failures} failure(s), ${seconds} s`);
process.exitCode = results.some((r) => r.code === 2) ? 2 : results.some((r) => r.code !== 0) ? 1 : 0;
