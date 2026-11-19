// SPDX-License-Identifier: GPL-2.0
// A stand-in for benthic-host that behaves like a core holding one logbook, for the windows' tests.
'use strict';
const fs = require('node:fs');
const readline = require('node:readline');

const received = [];
const reply = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
let imported = '';

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, args } = JSON.parse(line);
  received.push(method);
  switch (method) {
    case 'importFile':
      imported = fs.readFileSync(args.source, 'utf8');
      reply({ id, result: 1 });
      break;
    case 'listLoadedDives':
      reply({ id, result: JSON.stringify([{ id: 4 }, { id: 9 }]) });
      break;
    case 'exportDives':
      fs.writeFileSync(args.path, `exported ${args.ids.join(',')} after ${imported.trim()}`);
      reply({ id, result: null });
      break;
    case 'saveLogbookFile':
      // Subsurface's Save As of the whole log (save_logbook_file), which replaced exportDives.
      fs.writeFileSync(args.path, `saved after ${imported.trim()}`);
      reply({ id, result: null });
      break;
    case 'received':
      reply({ id, result: received });
      break;
    case 'ping':
      reply({ id, result: process.pid });
      break;
    default:
      reply({ id, result: method });
  }
});
