// @ts-check
// A small XML reader for the files the core writes (the .ssrf exports): elements, attributes in file order, text and CDATA.
// It has no DOM dependency, so the same code runs in the web view, in the desktop app and under node:test.
// Not a general XML parser: no DTD, no namespaces (names are kept as written).

/**
 * @typedef {{ name: string, attrs: [string, string][], children: (XmlElement|string)[] }} XmlElement
 */

const ENTITIES = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" });

/** @param {string} text */
function decode(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * @param {string} xml
 * @returns {XmlElement} the document element
 * @throws {Error} when the text is not well-formed
 */
export function parseXml(xml) {
  /** @type {XmlElement[]} */
  const stack = [];
  /** @type {XmlElement|null} */
  let root = null;
  let i = 0;
  const n = xml.length;
  const fail = (/** @type {string} */ why) => {
    throw new Error(`XML: ${why} at ${i}`);
  };
  /** @param {string|XmlElement} node */
  const add = (node) => {
    const parent = stack[stack.length - 1];
    if (parent) {
      if (typeof node === 'string') {
        // Adjacent text (text then CDATA) is one text node.
        const last = parent.children[parent.children.length - 1];
        if (typeof last === 'string') parent.children[parent.children.length - 1] = last + node;
        else if (node) parent.children.push(node);
      } else parent.children.push(node);
    } else if (typeof node !== 'string') {
      if (root) fail('two document elements');
      root = node;
    }
  };
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      if (xml.slice(i).trim()) fail('text after the document');
      break;
    }
    if (lt > i) add(decode(xml.slice(i, lt)));
    i = lt;
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      if (end < 0) fail('unterminated comment');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9);
      if (end < 0) fail('unterminated CDATA');
      add(xml.slice(i + 9, end));
      i = end + 3;
    } else if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2);
      if (end < 0) fail('unterminated declaration');
      i = end + 2;
    } else if (xml.startsWith('<!', i)) {
      const end = xml.indexOf('>', i + 2);
      if (end < 0) fail('unterminated declaration');
      i = end + 1;
    } else if (xml.startsWith('</', i)) {
      const end = xml.indexOf('>', i + 2);
      if (end < 0) fail('unterminated end tag');
      const name = xml.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) fail(`unexpected </${name}>`);
      i = end + 1;
    } else {
      const m = /^<([^\s/>]+)/.exec(xml.slice(i, i + 256));
      if (!m) fail('bad tag');
      /** @type {XmlElement} */
      const el = { name: /** @type {RegExpExecArray} */ (m)[1], attrs: [], children: [] };
      i += /** @type {RegExpExecArray} */ (m)[0].length;
      let selfClosed = false;
      for (;;) {
        while (i < n && /\s/.test(xml[i])) i++;
        if (xml[i] === '/' && xml[i + 1] === '>') {
          selfClosed = true;
          i += 2;
          break;
        }
        if (xml[i] === '>') {
          i++;
          break;
        }
        const am = /^([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(xml.slice(i, i + 65536));
        if (!am) fail('bad attribute');
        const a = /** @type {RegExpExecArray} */ (am);
        el.attrs.push([a[1], decode(a[2] ?? a[3] ?? '')]);
        i += a[0].length;
      }
      add(el);
      if (!selfClosed) stack.push(el);
    }
  }
  if (stack.length) fail(`<${stack[stack.length - 1].name}> is not closed`);
  if (!root) fail('no document element');
  return /** @type {XmlElement} */ (root);
}

/** @param {XmlElement} el @param {string} name @returns {string|undefined} */
export const attr = (el, name) => el.attrs.find(([k]) => k === name)?.[1];

/** The child elements, optionally of one name. @param {XmlElement} el @param {string} [name] @returns {XmlElement[]} */
export const elements = (el, name) => /** @type {XmlElement[]} */ (el.children.filter((c) => typeof c !== 'string' && (!name || c.name === name)));

/** The string value of an element: its text and its descendants' text. @param {XmlElement} el @returns {string} */
export const textOf = (el) => el.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
