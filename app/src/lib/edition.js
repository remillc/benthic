// @ts-check
// The edition of the build, read in one place (task 2026-11-15-213). `VITE_EDITION=release` builds
// the release edition (its own first launch, on tablets for now); anything else, or nothing, is
// the beta edition, which is the default. Set it in the environment or in `.env.local` before
// `vite build` / `npm run android:sync` (see app/README.md, « Editions »).

/**
 * @param {unknown} value the raw `VITE_EDITION`
 * @returns {'beta'|'release'}
 */
export function editionFrom(value) {
  return String(value ?? '').trim().toLowerCase() === 'release' ? 'release' : 'beta';
}

/** The edition this build was made for. */
// Written out in full (no cast): Vite replaces `import.meta.env.VITE_EDITION` as it reads the file.
// @ts-ignore import.meta.env is added by Vite; it does not exist under node:test, where the edition is the beta.
export const edition = editionFrom(import.meta.env ? import.meta.env.VITE_EDITION : undefined);

/** True in the release edition. */
export const isRelease = edition === 'release';
