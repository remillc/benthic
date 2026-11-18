// @ts-check
// The development switch of the simulated Google sign-in and purchase (VITE_DEV_ACCOUNTS=1 in app/.env.local; never set in a
// release). `__OD_DEV_ACCOUNTS__` is replaced by the bundler (vite.config.js) with a constant: when the switch is off,
// every branch guarded by `devAccounts` and every dynamic import of the dev files is removed from the build, so that a
// release carries none of it (tests/app/dev-accounts.test.mjs builds both ways and checks the bundle).
// Under node:test the identifier does not exist: the switch is off.

/** @type {boolean} */
export const devAccounts = typeof __OD_DEV_ACCOUNTS__ !== 'undefined' && __OD_DEV_ACCOUNTS__ === true;
