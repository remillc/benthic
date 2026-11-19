// Development server of the navigation e2e (tests/e2e/navigation.mjs): the app run in a plain browser, as the
// Android phone's web layer. The desktop shell is switched off (layout.svelte.js reads window.odDesktop to know it
// runs in Electron; the test gives the page a stand-in of the bridge only to reach the core). `?desktop=1` switches it on again,
// for the suite's desktop flows.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
const resolved = typeof base === 'function' ? base : () => base;
export default defineConfig((env) => mergeConfig(resolved(env), {
  server: { port: Number(process.env.OD_E2E_PORT || 5541), strictPort: true, host: '127.0.0.1' },
  plugins: [{
    name: 'repro-not-desktop',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('lib/layout.svelte.js')) return code.replace("!!(/** @type {any} */ (window).odDesktop)", "new URLSearchParams(location.search).has('desktop') && !!window.odDesktop");
    },
  }],
}));
