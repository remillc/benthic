// @ts-check

/**
 * Parses decimal degrees, degrees and minutes, or degrees, minutes and seconds.
 * A decimal comma requires a semicolon or whitespace between the coordinates.
 * @param {string} text
 * @returns {{latUdeg: number, lonUdeg: number}|null}
 */
export function parseCoordinates(text) {
  const raw = text.trim();
  const decimalPair = /^([+-]?\d+(?:\.\d+)?)\s*°?\s*[;,\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?$/;
  const points = raw.match(decimalPair);
  if (points) return check(Number(points[1]), Number(points[2]));

  const t = raw.replace(/(\d),(?=\d)/g, '$1.');
  const decimal = t.match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*[;\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?$/);
  if (decimal) return check(Number(decimal[1]), Number(decimal[2]));
  const part = String.raw`([+-]?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEWOnsewo])`;
  const dm = t.match(new RegExp(`^${part}[\\s,;]*${part}$`));
  if (!dm) return parseLoose(t);
  /** @param {string} d @param {string} m @param {string} s @param {string} h */
  const value = (d, m, s, h) => {
    const negative = /[SWOswo]/.test(h);
    if ((d.startsWith('-') && !negative) || (d.startsWith('+') && negative)) return NaN;
    const v = Math.abs(Number(d)) + Number(m ?? 0) / 60 + Number(s ?? 0) / 3600;
    return negative ? -v : v;
  };
  return check(value(dm[1], dm[2], dm[3], dm[4]), value(dm[5], dm[6], dm[7], dm[8]));
}

/**
 * The other written forms: the hemisphere before or after each part (N 36.27 W 174.8, 36.27N 174.8W), the degree sign
 * and the minute and second marks optional (36 16.2 S 174 48.4 E), degrees, minutes and seconds with a plain comma
 * or semicolon between the two parts (-36 16 12.7, 174 48 23).
 * @param {string} text decimal commas already turned into points
 * @returns {{latUdeg: number, lonUdeg: number}|null}
 */
function parseLoose(text) {
  const t = text.replace(/[′’`]/g, "'").replace(/″/g, '"').replace(/''/g, '"').replace(/\s+/g, ' ').trim();
  const letters = [...t.matchAll(/[NSEWOnsewo]/g)].map((m) => ({ at: /** @type {number} */ (m.index), mark: m[0] }));
  /** @type {string[]} */
  let halves;
  let marks = ['', ''];
  if (letters.length === 2) {
    const [first, second] = letters;
    if (first.at === 0) {
      halves = [t.slice(1, second.at), t.slice(second.at + 1)];
    } else if (second.at === t.length - 1) {
      halves = [t.slice(0, first.at), t.slice(first.at + 1, second.at)];
    } else return null;
    marks = [first.mark, second.mark];
    if (!/[NSns]/.test(marks[0]) || !/[EWOewo]/.test(marks[1])) return null;
  } else if (letters.length === 0) {
    halves = t.split(/\s*[,;]\s*/);
    if (halves.length !== 2) return null;
  } else return null;
  /** @param {string} half @param {string} mark */
  const value = (half, mark) => {
    const m = half.replace(/^[\s,;]+|[\s,;]+$/g, '').match(/^([+-]?)\s*(\d+(?:\.\d+)?)\s*°?(?:\s*(\d+(?:\.\d+)?)\s*'?)?(?:\s*(\d+(?:\.\d+)?)\s*"?)?$/);
    if (!m) return NaN;
    const [, sign, d, min, sec] = m;
    if ((min !== undefined && Number(min) >= 60) || (sec !== undefined && Number(sec) >= 60)) return NaN;
    const negative = /[SWOswo]/.test(mark);
    if ((sign === '-' && mark && !negative) || (sign === '+' && negative)) return NaN;
    const v = Number(d) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600;
    return negative || (sign === '-' && !mark) ? -v : v;
  };
  return check(value(halves[0], marks[0]), value(halves[1], marks[1]));
}

/** @param {number} lat @param {number} lon */
function check(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latUdeg: Math.round(lat * 1e6), lonUdeg: Math.round(lon * 1e6) };
}
