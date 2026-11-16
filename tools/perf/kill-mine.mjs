// SPDX-License-Identifier: GPL-2.0
// Kills only the audit's own Electron (the one started with --remote-debugging-port=9391) and its process tree.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const script = [
  "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" |",
  "Where-Object { $_.CommandLine -match 'remote-debugging-port=9391' -and $_.CommandLine -notmatch '--type=' } |",
  'ForEach-Object { taskkill /F /T /PID $_.ProcessId | Out-Null }',
].join(' ');

export function killMine() {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
  } catch {
    // Nothing to kill.
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) killMine();
