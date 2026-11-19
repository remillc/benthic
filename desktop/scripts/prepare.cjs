// SPDX-License-Identifier: GPL-2.0
// Gathers what the desktop app ships, in build/desktop/stage/: the interface (app/dist,
// built without the development switches of app/.env.local), the core's helper for this
// system (native/desktop/build.sh), Subsurface's XSLT stylesheets, its sample logbook and the translations
// read by the macOS menu bar.
//   node scripts/prepare.cjs [target]   target: win-x64, linux-x64, mac-arm64, mac-x64
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
// OD_STAGE: another folder, e.g. while a development window runs from the usual one.
const stage = process.env.OD_STAGE ? path.resolve(process.env.OD_STAGE) : path.join(root, 'build', 'desktop', 'stage');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const system = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
const target = process.argv[2] || `${system}-${arch}`;
const exe = target.startsWith('win') ? '.exe' : '';

fs.rmSync(stage, { recursive: true, force: true });
for (const dir of ['web', 'bin', 'xslt', 'i18n']) fs.mkdirSync(path.join(stage, dir), { recursive: true });

// A release is built without the development switches of app/.env.local (AGENTS.md).
// Vite reads app/.env.local in every mode; values already in the environment win over it.
execSync('npx vite build --mode production', {
  cwd: path.join(root, 'app'),
  stdio: 'inherit',
  env: { ...process.env, VITE_SHOW_ROUTE: '0', VITE_SHOW_PERF: '0' },
});
fs.cpSync(path.join(root, 'app', 'dist'), path.join(stage, 'web'), { recursive: true });

const host = path.join(root, 'build', 'desktop', target, 'bin', `benthic-host${exe}`);
if (!fs.existsSync(host)) throw new Error(`missing ${host}: run native/desktop/build.sh ${target}`);
fs.copyFileSync(host, path.join(stage, 'bin', `benthic-host${exe}`));

const xslt = path.join(root, 'third_party', 'subsurface', 'xslt');
for (const name of fs.readdirSync(xslt).filter((n) => /\.xslt?$/.test(n))) fs.copyFileSync(path.join(xslt, name), path.join(stage, 'xslt', name));

// The sample logbook (« Essayer avec des plongées d'exemple »), as on Android.
fs.copyFileSync(path.join(root, 'core', 'sample', 'SampleLogbook.ssrf'), path.join(stage, 'SampleDivesV2.ssrf'));

for (const lang of ['fr', 'en']) fs.copyFileSync(path.join(root, 'app', 'src', 'i18n', `${lang}.json`), path.join(stage, 'i18n', `${lang}.json`));
console.log(`staged ${target} in ${stage}`);
