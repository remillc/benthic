// @ts-check
// The files chosen for an import, ready for the core: base64 contents and original names. A .zip
// holding .fit files (Garmin Connect's « Export Original ») gives its .fit files in its place, as
// the core cannot read them inside the archive.
import { fitFilesInZip, isZipName, toBase64 } from './zip-fit.js';

/**
 * @param {File[]} files the files chosen together
 * @returns {Promise<{ name: string, data: string }[]>}
 */
export async function importPayload(files) {
  /** @type {{ name: string, data: string }[]} */
  const out = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isZipName(file.name)) {
      const fits = await fitFilesInZip(bytes);
      if (fits.length) {
        for (const fit of fits) out.push({ name: fit.name, data: toBase64(fit.data) });
        continue;
      }
    }
    out.push({ name: file.name, data: toBase64(bytes) });
  }
  return out;
}
