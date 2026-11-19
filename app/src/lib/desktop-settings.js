// @ts-check
// The desktop Réglages (task 2026-11-15-202, mock-ups bureau-reglages*): the phone's settings
// shown as categories on the left and the chosen category's cards on the right, with a search
// across every category. Pure logic only (the rows themselves are the phone's, in
// pages/Settings.svelte).

/**
 * The categories, in the order of the left column. `groups` are the ids of the phone's groups of
 * rows (pages/Settings.svelte) and of the few blocks that are not rows (`unitSystem`,
 * `textSize`, `startup`, `logbookFile`, `computersKnown`, `reset`) shown in this category.
 * `icon`: the path of a 24 dp outline icon (the phone's overview uses the same).
 * @type {readonly { id: string, icon: string, groups: readonly string[] }[]}
 */
export const CATEGORIES = [
  { id: 'language', icon: 'M4 5h9 M8.5 3v2 M6 5c1 4 4 7 7 8 M11 5c-1 4-4 7-7 8 M13 20l4-9 4 9 M14.5 17h5', groups: ['language'] },
  { id: 'units', icon: 'M3 17h18v-6H3z M7 11v3 M11 11v2 M15 11v3 M19 11v2', groups: ['unitSystem', 'units', 'units2'] },
  { id: 'display', icon: 'M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18', groups: ['display', 'textSize', 'profileDisplay', 'po2Graph'] },
  { id: 'logbook', icon: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z M9 8h6 M9 12h6', groups: ['logbook', 'startup', 'logbookFile'] },
  { id: 'equipment', icon: 'M10.6 3v2c-2.5.5-4.5 2.7-4.5 5.7V19c0 1.7 1.3 2.5 3 2.5h5.8c1.7 0 3-.8 3-2.5v-8.3c0-3-2-5.2-4.5-5.7V3z', groups: ['equipment', 'cylinderTypes'] },
  { id: 'decompression', icon: 'M3 5l3 7 4 3 5 1 3-4 3-7', groups: ['deco', 'conditions', 'flight'] },
  { id: 'gases', icon: 'M8 21V9a4 4 0 0 1 8 0v12z M12 5V3 M8 14h8', groups: ['partialPressures'] },
  { id: 'rebreather', icon: 'M4 12a8 8 0 0 1 14-5 M20 4v4h-4 M20 12a8 8 0 0 1-14 5 M4 20v-4h4', groups: ['rebreather'] },
  { id: 'devices', icon: 'M7 4h10v16H7z M10 8h4 M12 16h.01', groups: ['computers', 'download', 'computersKnown'] },
  { id: 'maps', icon: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14', groups: ['maps'] },
  { id: 'advanced', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 7.5 4 7 3 10l2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z', groups: ['reset'] },
];

/** The category that shows a group. @param {string} group @returns {string} */
export function categoryOf(group) {
  return CATEGORIES.find((c) => c.groups.includes(group))?.id ?? '';
}

/**
 * Text without accents and in lower case, to compare while typing.
 * @param {string} s
 */
export const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Whether a row answers the search: its label, its helper line or its current value contains
 * the words typed (accents and case ignored). Every word must be found.
 * @param {{ label: string, text?: string, value?: string }} row
 * @param {string} query already folded
 */
export function rowMatches(row, query) {
  const words = query.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([row.label, row.text ?? '', row.value ?? ''].join(' \n '));
  return words.every((w) => haystack.includes(w));
}

/**
 * The blocks of settings left by a search, and how many settings that is.
 * @template {{ id: string, rows: { label: string, text?: string, value?: string }[] }} B
 * @param {B[]} blocks every block of every category, in the order of the categories
 * @param {string} search what was typed
 * @returns {{ blocks: B[], count: number }}
 */
export function searchBlocks(blocks, search) {
  const query = fold(search.trim());
  if (!query) return { blocks, count: blocks.reduce((n, b) => n + b.rows.length, 0) };
  const found = blocks.map((b) => ({ ...b, rows: b.rows.filter((r) => rowMatches(r, query)) })).filter((b) => b.rows.length);
  return { blocks: found, count: found.reduce((n, b) => n + b.rows.length, 0) };
}

/**
 * A text cut into the parts that match the search words and the others, for the highlight of a
 * result. Accents and case are ignored; the parts put together give the text back.
 * @param {string} text
 * @param {string} search what was typed
 * @returns {{ text: string, hit: boolean }[]}
 */
export function highlightParts(text, search) {
  const words = fold(search.trim()).split(/\s+/).filter(Boolean);
  if (!words.length || !text) return [{ text, hit: false }];
  // The folded text, kept letter by letter so that its positions are the text's.
  let folded = '';
  /** @type {number[]} */
  const from = [];
  for (let i = 0; i < text.length; i++) {
    const piece = fold(text[i]);
    for (let k = 0; k < piece.length; k++) from.push(i);
    folded += piece;
  }
  const marked = new Array(text.length).fill(false);
  for (const word of words) {
    for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + 1)) {
      for (let k = at; k < at + word.length; k++) marked[from[k]] = true;
    }
  }
  /** @type {{ text: string, hit: boolean }[]} */
  const parts = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1);
    if (last && last.hit === marked[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marked[i] });
  }
  return parts;
}

/**
 * The categories a result list comes from, in the order of the left column, for « Dans A et B ».
 * @param {{ category: string }[]} blocks
 * @returns {string[]} category ids
 */
export function categoriesOf(blocks) {
  const ids = new Set(blocks.map((b) => b.category));
  return CATEGORIES.map((c) => c.id).filter((id) => ids.has(id));
}

/** The three sizes of « Taille du texte »: the window's zoom factor. */
export const TEXT_SIZES = /** @type {const} */ ([
  { id: 'small', zoom: 0.9 },
  { id: 'normal', zoom: 1 },
  { id: 'large', zoom: 1.15 },
]);

/** @param {unknown} id @returns {'small'|'normal'|'large'} */
export function textSizeOf(id) {
  return id === 'small' || id === 'large' ? id : 'normal';
}

/** @param {'small'|'normal'|'large'} id */
export const zoomOf = (id) => TEXT_SIZES.find((s) => s.id === id)?.zoom ?? 1;

/**
 * The size after Ctrl++ (direction 1) or Ctrl+- (direction -1); it stops at the ends.
 * @param {'small'|'normal'|'large'} current
 * @param {1|-1} direction
 */
export function stepTextSize(current, direction) {
  const at = TEXT_SIZES.findIndex((s) => s.id === current);
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, at + direction))].id;
}
