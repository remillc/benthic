// @ts-check
// The scrubber of error reports (task #102). Everything that leaves the device in an error report goes through it first:
// e-mail addresses, tokens and secrets, coordinates, and user names in file paths are replaced by a placeholder in
// square brackets. It is a net, not a promise: the report is also shown to the diver, who decides whether to send it.

/** Longest piece of text kept for one field, whatever its content. */
const MAX_FIELD = 12000;

const RULES = /** @type {[RegExp, string][]} */ ([
  // Credentials inside an address: https://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1[credentials]@'],
  // Authorization headers and bearer tokens.
  [/\b(authorization\s*[:=]\s*)(?:basic|bearer)?\s*[^\s,;"']+/gi, '$1[token]'],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [token]'],
  // key=value or "key": "value" for secret-looking keys.
  [/(["']?\b[\w.-]*(?:token|secret|password|passwd|pwd|api[_-]?key|apikey|session|cookie|credential|auth)[\w.-]*["']?\s*[:=]\s*)(["']?)(?!\[)[^\s"',;&)}\]]+\2/gi, '$1[token]'],
  // A JSON web token.
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, '[token]'],
  // E-mail addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]'],
  // Home folders: the user name is dropped, the rest of the path stays (it shows which file failed).
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, '$1[user]'],
  [/(file:\/\/\/[A-Za-z]:\/Users\/)[^/\s"']+/gi, '$1[user]'],
  [/(\/Users\/)[^/\s"']+/g, '$1[user]'],
  [/(\/home\/)[^/\s"']+/g, '$1[user]'],
  [/(\/storage\/emulated\/)\d+/g, '$1[user]'],
  [/(\/data\/user\/)\d+/g, '$1[user]'],
  [/(\/var\/mobile\/Containers\/(?:Data|Shared)\/[A-Za-z]+\/)[0-9A-F-]{36}/gi, '$1[id]'],
  // A latitude/longitude with its label, whatever the format.
  [/\b(lat(?:itude)?|lon(?:g|gitude)?|lng)\b(["']?\s*[:=]\s*)["']?-?\d+(?:[.,]\d+)?["']?/gi, '$1$2[coordinate]'],
  // A decimal number with three or more decimals in the range of a coordinate (versions and line numbers have none).
  [/(?<![\w.])-?(?:1[0-7]\d|\d{1,2})[.,]\d{3,}(?![\w.])/g, '[coordinate]'],
  // Degrees, minutes, seconds: 43°17'46"N
  [/\b\d{1,3}\s*°\s*\d{1,2}(?:['′]\s*\d{1,2}(?:[.,]\d+)?["″]?)?\s*[NSEOW]\b/g, '[coordinate]'],
  // A long random-looking string (hexadecimal or base64) is a key, a hash or a token.
  [/(?<![\w/.-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}(?![\w-])/g, '[token]'],
]);

/**
 * @param {unknown} text
 * @param {number} [max] longest result, in characters
 * @returns {string} the text without what must not leave the device
 */
export function scrub(text, max = MAX_FIELD) {
  let out = typeof text === 'string' ? text : text == null ? '' : String(text);
  if (out.length > max * 4) out = out.slice(0, max * 4);
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/**
 * A route as the report keeps it: the path only (the query and the fragment can hold a search or a name).
 * @param {unknown} route
 * @returns {string}
 */
export function scrubRoute(route) {
  const path = typeof route === 'string' ? route.split(/[?#]/)[0] : '';
  return scrub(path, 200);
}

/**
 * @param {unknown[]} lines
 * @param {number} [perLine]
 * @returns {string[]}
 */
export function scrubLines(lines, perLine = 300) {
  return lines.map((line) => scrub(line, perLine));
}
