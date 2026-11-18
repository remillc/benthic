// @ts-check
// isomorphic-git wants a global `Buffer`, which a web view does not have: the `buffer` package provides it. Import this
// module before isomorphic-git.
import { Buffer } from 'buffer';

const g = /** @type {any} */ (globalThis);
if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;
