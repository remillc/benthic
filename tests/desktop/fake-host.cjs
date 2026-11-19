// SPDX-License-Identifier: GPL-2.0
// A stand-in for benthic-host that speaks its protocol, for the bridge's tests.
'use strict';
const readline = require('node:readline');

const received = [];
const reply = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, args } = JSON.parse(line);
  received.push(method);
  switch (method) {
    case 'received':
      reply({ id, result: received });
      break;
    case 'echo':
      reply({ id, result: args });
      break;
    case 'fail':
      reply({ id, error: 'CORE: it failed' });
      break;
    case 'progress':
      reply({ event: 'syncProgress', data: { message: 'Sync with cloud storage' } });
      reply({ id, result: null });
      break;
    case 'crash':
      process.exit(3);
      break;
    case 'slow':
      setTimeout(() => reply({ id, result: 'done' }), 200);
      break;
    default:
      reply({ id, result: method });
  }
});
