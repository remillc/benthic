// @ts-check
// The edition of the build, read in one place (task 2026-11-15-213). The release edition (the beta) is the
// default; `VITE_EDITION=alpha` builds the alpha behaviour (its first launch, no profile, no equipment
// inventory, no server). Set it in the environment or in `.env.local` before `vite build` /
// `npm run android:sync` (see app/README.md, « Editions »).

/**
 * @param {unknown} value the raw `VITE_EDITION`
 * @returns {'alpha'|'release'}
 */
export function editionFrom(value) {
  return String(value ?? '').trim().toLowerCase() === 'alpha' ? 'alpha' : 'release';
}

/** The edition this build was made for. */
// Written out in full (no cast): Vite replaces `import.meta.env.VITE_EDITION` as it reads the file.
// @ts-ignore import.meta.env is added by Vite; it does not exist under node:test, where the edition is the release.
export const edition = editionFrom(import.meta.env ? import.meta.env.VITE_EDITION : undefined);

/** True in the release edition (the default). */
export const isRelease = edition === 'release';
