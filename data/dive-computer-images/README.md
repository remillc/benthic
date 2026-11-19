# Dive computer images

`catalog.json` lists one entry per libdivecomputer model (vendor, product, slug, `hasImage`, server paths `image512`/`image128`, source page and original URLs, `confidence`, `approx` (true when confidence is low: a close model's picture), `fetched_at`, original width and height, `cropped`: `manual` or `auto`). The normalized webp files are not in git: they are published by the OpenDives server (`/v1/dc-images/512/<slug>.webp`, `/v1/dc-images/128/<slug>.webp`).

`crops.json` holds the manual crops: `{"<vendor>|<product>": {"x","y","w","h"}}` in original pixels. A model without a crop is trimmed automatically.

## Rebuild

1. Originals live outside git, in `F:/projets/dc-images-originals/` (override with `DC_ORIGINALS`), named `<slug>.<ext>`. `node tools/dc-images/download.mjs` fetches them from `tools/dc-images/images-retenues.tsv` (paced per host, one retry; failures go to `failures.json` there).
2. `cd tools/dc-images && npm ci` (sharp is a dev dependency of this folder only).
3. `node tools/dc-images/build.mjs` trims or crops, fits each image centred on a white square with a 6% margin, writes `512/` and `128/` webp (quality 82) into `<originals>/out` (override with `DC_OUT`) and rewrites `catalog.json`.
4. To re-crop: `node tools/dc-images/review.mjs` writes `<originals>/review.html` (open it in a browser: normalized image next to the original, "Recadrer" per model, "Exporter crops.json"). Put the exported file here as `crops.json` and rerun `build.mjs`.
5. To publish: copy `out/512`, `out/128` and `catalog.json` into the private server repository (`api/data/dc-images/`, see its `docs/dc-images.md`).

Slugs are `<vendor>-<product>` in lower case with hyphens (`+` becomes `plus`). A changed picture keeps its slug until published; the app keeps files for ever, so a replaced picture needs a new slug.
