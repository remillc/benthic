// Marks inside translated texts (task 2026-11-16-253): [kbd]label[/kbd] is an interface label of a site,
// [code]value[/code] a value to type or copy. The texts stay plain JSON; the page renders the segments as
// <kbd>, <code> and text, never as HTML. Markers do not nest; an unbalanced or unknown marker stays text.

/** @typedef {{ type: 'text' | 'kbd' | 'code', text: string }} MarkedSegment */

const MARKED = /\[(kbd|code)\]([^[\]]*)\[\/\1\]/g;

/**
 * @param {string} source
 * @returns {MarkedSegment[]}
 */
export function parseMarked(source) {
  /** @type {MarkedSegment[]} */
  const out = [];
  let last = 0;
  for (const m of source.matchAll(MARKED)) {
    if (m.index > last) out.push({ type: 'text', text: source.slice(last, m.index) });
    out.push({ type: /** @type {'kbd' | 'code'} */ (m[1]), text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ type: 'text', text: source.slice(last) });
  return out;
}

/** The text without its markers. @param {string} source */
export function stripMarked(source) {
  return parseMarked(source).map((s) => s.text).join('');
}
