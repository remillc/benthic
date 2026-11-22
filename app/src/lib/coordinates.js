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
  if (!dm) return null;
  /** @param {string} d @param {string} m @param {string} s @param {string} h */
  const value = (d, m, s, h) => {
    const negative = /[SWOswo]/.test(h);
    if ((d.startsWith('-') && !negative) || (d.startsWith('+') && negative)) return NaN;
    const v = Math.abs(Number(d)) + Number(m ?? 0) / 60 + Number(s ?? 0) / 3600;
    return negative ? -v : v;
  };
  return check(value(dm[1], dm[2], dm[3], dm[4]), value(dm[5], dm[6], dm[7], dm[8]));
}

/** @param {number} lat @param {number} lon */
function check(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latUdeg: Math.round(lat * 1e6), lonUdeg: Math.round(lon * 1e6) };
}
