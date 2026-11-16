// Stand-in for the native plugin 'opendives-core' in the Node tests: any call
// answers with an empty object. The tests never reach the core, except those that
// count the calls: they set a method (OpenDivesCore.getDive = async () => ...) and delete it after.
/** @type {Map<string|symbol, Function>} */
const replaced = new Map();
export const OpenDivesCore = new Proxy(
  {},
  {
    get: (_, name) => replaced.get(name) ?? (async () => ({})),
    set: (_, name, value) => (replaced.set(name, value), true),
    deleteProperty: (_, name) => replaced.delete(name),
  },
);
