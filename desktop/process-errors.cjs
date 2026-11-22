// SPDX-License-Identifier: GPL-2.0
'use strict';

/** @param {unknown} error */
function isBrokenPipe(error) {
  const e = /** @type {any} */ (error);
  return e?.code === 'EPIPE'
    || e?.errno === 'EPIPE'
    || e?.errno === -32
    || /(?:broken pipe|EPIPE)/i.test(typeof error === 'string' ? error : String(e?.message || error || ''));
}

/** Prevent a broken logging pipe from becoming an uncaught process exception. */
function guardProcessPipes(processLike) {
  for (const name of ['stdout', 'stderr']) {
    const stream = processLike[name];
    if (stream?.on) stream.on('error', (error) => {
      if (!isBrokenPipe(error) && typeof processLike._rawDebug === 'function') processLike._rawDebug(String(error));
    });
  }
}

/** @param {NodeJS.WritableStream} stream @param {string} text */
function safeWrite(stream, text) {
  try {
    stream.write(text, (error) => {
      if (error && !isBrokenPipe(error) && typeof process.stderr?.write === 'function') process.stderr.write(String(error));
    });
  } catch (error) {
    if (!isBrokenPipe(error)) throw error;
  }
}

module.exports = { isBrokenPipe, guardProcessPipes, safeWrite };
