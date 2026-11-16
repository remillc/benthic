import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// The app's version, from package.json (the one source, Semantic Versioning).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Its release date, from the heading of CHANGELOG.md (updated at each release); none before the release.
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## [${version}] - `));
const releaseDate = heading?.slice(`## [${version}] - `.length).trim() ?? '';

/**
 * The app's code is a graph of about 80 files that start.js pulls in after main.js has loaded the device settings:
 * left to the browser, each level of imports is found only when the level above was fetched. This puts the whole
 * graph in index.html as modulepreload links (the catalogs of the language are started by main.js), so that the files load side by side
 * from the first byte, and the style sheets of that graph with the page.
 * @returns {import('vite').Plugin}
 */
function preloadFirstScreen() {
  return {
    name: 'od-preload-first-screen',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const roots = Object.values(bundle).filter(
          (c) => c.type === 'chunk' && c.facadeModuleId && /src[\/](start.js|lib[\/]language.js)$/.test(c.facadeModuleId),
        );
        /** @type {Set<string>} */
        const files = new Set();
        /** @type {Set<string>} */
        const styles = new Set();
        /** @param {string} name */
        const walk = (name) => {
          const chunk = bundle[name];
          if (!chunk || chunk.type !== 'chunk' || files.has(name)) return;
          files.add(name);
          for (const css of chunk.viteMetadata?.importedCss ?? []) styles.add(css);
          chunk.imports.forEach(walk);
        };
        for (const root of roots) {
          walk(root.fileName);
        }
        /** @type {import('vite').HtmlTagDescriptor[]} */
        const tags = [];
        for (const f of files) tags.push({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: './' + f }, injectTo: 'head' });
        for (const f of styles) tags.push({ tag: 'link', attrs: { rel: 'stylesheet', crossorigin: '', href: './' + f }, injectTo: 'head' });
        return tags;
      },
    },
  };
}

export default defineConfig({
  plugins: [svelte(), preloadFirstScreen()],
  // The local plugin is a link to ../plugins: its imports resolve here.
  resolve: { dedupe: ['@capacitor/core'] },
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version), __APP_RELEASE_DATE__: JSON.stringify(releaseDate) },
  // core/data/regions.txt (offline regions) is imported as an asset from outside app/.
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Modules shared by several screens go together in one file: the first screen would otherwise fetch
        // them as about 50 small files (each a request to the local files of the app).
        codeSplitting: {
          groups: [{ name: 'shared', test: /[\\/]src[\\/](lib|components)[\\/]/, minShareCount: 2 }],
        },
      },
    },
  },
});
