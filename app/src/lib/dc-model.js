// @ts-check
// Which catalog entry is a dive computer (docs/architecture.md, section 12; tasks 2026-11-19-302 and 303).
// Subsurface stores a dive's computer as the text "Shearwater Perdix AI" (vendor and product as libdivecomputer
// names them, sometimes the product alone, sometimes with a note such as "(Imported from file)"). The catalog lists
// each model as { vendor, product }. Pure functions: no network, no storage.

/**
 * @typedef {{ vendor: string, product: string, slug: string, hasImage: boolean, image512?: string, image128?: string, approx?: boolean }} CatalogEntry
 */

/**
 * A comparable form of a model name: lower case, "+" read as "plus", accents and every character that is not a
 * letter or a digit dropped, so spacing, hyphens and case do not matter ("OSTC 3+" is "ostc3plus").
 * @param {string} text
 * @returns {string}
 */
export function modelKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '');
}

/** The text without a trailing note in brackets: "Divesoft Freedom (Imported from file)" → "Divesoft Freedom". @param {string} text */
const withoutNote = (text) => String(text ?? '').replace(/\s*[([].*$/, '');

/**
 * The catalog entry of a computer model, or null. The whole text must be the vendor and the product, in any case
 * and spacing; the product alone is accepted when it belongs to a single entry. A model the catalog does not list
 * (or lists without an image) gives null: the generic icon is shown.
 * @param {CatalogEntry[]|null|undefined} catalog
 * @param {string|null|undefined} model
 * @param {string} [vendor] the vendor when it is known apart from the model
 * @returns {CatalogEntry|null}
 */
export function findEntry(catalog, model, vendor = '') {
  if (!catalog?.length || !model) return null;
  for (const text of [model, withoutNote(model)]) {
    const key = modelKey(vendor ? `${vendor} ${text}` : text);
    if (!key) continue;
    const exact = catalog.find((e) => modelKey(`${e.vendor} ${e.product}`) === key);
    if (exact) return exact;
    if (vendor) continue;
    const alone = catalog.filter((e) => modelKey(e.product) === key);
    if (alone.length === 1) return alone[0];
  }
  return null;
}

/**
 * The entry to show: only a model with an image has one.
 * @param {CatalogEntry[]|null|undefined} catalog
 * @param {string|null|undefined} model
 * @param {string} [vendor]
 * @returns {CatalogEntry|null}
 */
export function imageEntry(catalog, model, vendor = '') {
  const entry = findEntry(catalog, model, vendor);
  return entry?.hasImage ? entry : null;
}

/**
 * The brands and, per brand, the models to suggest in a field: those of the core's list, beginning with what is
 * typed (any case), or containing it when nothing begins with it.
 * @param {string[]} options
 * @param {string} typed
 * @returns {string[]}
 */
export function suggest(options, typed) {
  const key = modelKey(typed);
  if (!key) return options;
  const starts = options.filter((o) => modelKey(o).startsWith(key));
  return starts.length ? starts : options.filter((o) => modelKey(o).includes(key));
}

/**
 * The brands and their models for the suggestion fields: the core's list of models that download over Bluetooth
 * and the catalog's (both use libdivecomputer's names), each model once per brand (any case or spacing), sorted.
 * @param {{ vendor: string, products: { name: string }[] }[]} bluetooth
 * @param {CatalogEntry[]} catalog
 * @returns {{ vendors: string[], modelsOf: (vendor: string) => string[] }}
 */
export function brandModels(bluetooth, catalog) {
  /** @type {Map<string, { vendor: string, products: Map<string, string> }>} */
  const byVendor = new Map();
  /** @param {string} vendor @param {string} product */
  const add = (vendor, product) => {
    if (!vendor) return;
    const key = modelKey(vendor);
    const entry = byVendor.get(key) ?? { vendor, products: new Map() };
    byVendor.set(key, entry);
    if (product && !entry.products.has(modelKey(product))) entry.products.set(modelKey(product), product);
  };
  for (const v of bluetooth ?? []) for (const p of v.products ?? []) add(v.vendor, p.name);
  for (const e of catalog ?? []) add(e.vendor, e.product);
  const sort = (/** @type {string[]} */ list) => list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return {
    vendors: sort([...byVendor.values()].map((v) => v.vendor)),
    modelsOf: (vendor) => sort([...(byVendor.get(modelKey(vendor))?.products.values() ?? [])]),
  };
}

/** A serial number as comparable text: blanks, "0x" and leading zeros dropped, lower case. @param {string|undefined|null} serial */
export const serialKey = (serial) =>
  String(serial ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/^0+/, '');

/**
 * A dive computer of the equipment and a computer of the logbook are the same when brand, model and serial number
 * match (task 2026-11-19-306). The piece's model text is the logbook's when the piece came from a download
 * (`computerModel`), else its brand and model, else its name. Pure.
 * @param {{ computerModel?: string, computerSerial?: string, brand?: string, model?: string, name?: string, serial?: string }} piece
 * @param {{ model: string, serial: string }} computer
 * @returns {boolean}
 */
export function sameComputer(piece, computer) {
  const typed = [piece.brand, piece.model].filter(Boolean).join(' ');
  const texts = [piece.computerModel, typed, piece.name].filter(Boolean);
  const key = modelKey(computer.model);
  if (!key || !texts.some((text) => modelKey(/** @type {string} */ (text)) === key)) return false;
  return serialKey(piece.computerSerial ?? piece.serial) === serialKey(computer.serial);
}
