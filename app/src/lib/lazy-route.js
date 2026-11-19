// @ts-check
// A route whose page is its own chunk, shown only once the chunk's style sheets apply: without that wait a page's
// markup can be painted for a frame before its CSS, and every drawing sized by CSS shows at its intrinsic size.

/**
 * Resolves once every style sheet link of the document applies (the ones a chunk's import added included).
 * Vite's preload already waits for the links it creates; this also covers a link that exists but has not loaded yet
 * (a second route opened while the first chunk is still loading). At most `timeout` ms, so that a style sheet that
 * never loads cannot stop navigation.
 * @param {Document} [doc]
 * @param {number} [timeout]
 * @returns {Promise<unknown>}
 */
export function stylesheetsReady(doc = document, timeout = 3000) {
  const pending = [...doc.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !/** @type {HTMLLinkElement} */ (link).sheet)
    .map((link) => new Promise((resolve) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
    }));
  if (!pending.length) return Promise.resolve();
  return Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, timeout))]);
}

/**
 * Wraps the `async` function of a route: when it fails, the route is rejected before the error goes on. Framework7
 * refuses every other page change until an async route is resolved or rejected; left pending, the view would never
 * answer again (docs/architecture.md, section 13).
 * @param {(context: { resolve: Function, reject: Function }) => Promise<void>} fn
 */
export function safeAsync(fn) {
  return async (/** @type {{ resolve: Function, reject: Function }} */ context) => {
    try {
      await fn(context);
    } catch (e) {
      context.reject();
      throw e;
    }
  };
}

/**
 * A Framework7 async route for a page loaded on demand. Framework7 refuses every other page change until the route
 * is resolved or rejected: a failed load rejects it, never leaves it pending (docs/architecture.md, section 13).
 * @param {() => Promise<{ default: any }>} load the dynamic import of the page
 * @param {Record<string, any>} [props] the page's props
 * @param {() => Promise<unknown>} [ready] what to wait for after the import (the style sheets)
 */
export function lazyRoute(load, props, ready = () => stylesheetsReady()) {
  return {
    async: safeAsync(async ({ resolve }) => {
      const page = (await load()).default;
      await ready();
      resolve({ component: page }, props ? { props } : undefined);
    }),
  };
}
