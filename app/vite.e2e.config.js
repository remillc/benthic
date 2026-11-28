// Development server of the navigation e2e (tests/e2e/navigation.mjs): the app run in a plain browser, as the
// Android phone's web layer. The desktop shell is switched off (layout.svelte.js reads window.benthicDesktop to know it
// runs in Electron; the test gives the page a stand-in of the bridge only to reach the core). `?desktop=1` switches it on again,
// for the suite's desktop flows.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
const resolved = typeof base === 'function' ? base : () => base;
export default defineConfig((env) => mergeConfig(resolved(env), {
  // BC_E2E_CACHE: a cold dependency cache of its own (shows what Vite optimises while a run goes).
  ...(process.env.BC_E2E_CACHE ? { cacheDir: process.env.BC_E2E_CACHE } : {}),
  // A worktree whose node_modules is a junction to another checkout's: BC_PLUGIN_DIR points 'benthic-core' at this checkout's plugin.
  ...(process.env.BC_PLUGIN_DIR ? { resolve: { alias: { 'benthic-core': process.env.BC_PLUGIN_DIR } } } : {}),
  server: { port: Number(process.env.BC_E2E_PORT || 5541), strictPort: true, host: '127.0.0.1' },
  plugins: [{
    name: 'repro-not-desktop',
    enforce: 'pre',
    transform(code, id) {
      // The right to the desktop app (task 2026-11-27-414) applies only to the tabs opened with `&access=1`: the other flows keep a
      // desktop that is not read only.
      if (id.endsWith('lib/desktop-access.svelte.js')) return code.replace("!!import.meta.env && import.meta.env.VITE_DESKTOP_ACCESS === 'off'", "!new URLSearchParams(location.search).has('access')");
      if (id.endsWith('lib/layout.svelte.js')) return code.replace("!!(/** @type {any} */ (window).benthicDesktop)", "new URLSearchParams(location.search).has('desktop') && !!window.benthicDesktop");
    },
  }],
}));
