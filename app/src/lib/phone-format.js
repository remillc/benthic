// @ts-check
// Phone numbers of the emergency contact (task 2026-11-18-272): a country (« CA +1 ») and a number that formats itself
// for that country as it is typed. A small formatter of our own, not a phone library: the diver types a number to be
// shown and dialled by a person, nothing here validates a line. The country list covers the places divers live and
// travel from most; a number of any other country keeps its digits in one group.

/**
 * `groups`: how the national number is cut, as the digits of each group (the last group takes the rest);
 * `trunk`: the leading 0 a country writes in front of the national number and drops after its code.
 * @typedef {{ code: string, dial: string, groups: number[], trunk?: string, length: number }} Country
 */

/** @type {Country[]} */
export const COUNTRIES = [
  { code: 'CA', dial: '1', groups: [3, 3, 4], length: 10 },
  { code: 'US', dial: '1', groups: [3, 3, 4], length: 10 },
  { code: 'FR', dial: '33', groups: [1, 2, 2, 2, 2], trunk: '0', length: 9 },
  { code: 'BE', dial: '32', groups: [3, 2, 2, 2], trunk: '0', length: 9 },
  { code: 'CH', dial: '41', groups: [2, 3, 2, 2], trunk: '0', length: 9 },
  { code: 'LU', dial: '352', groups: [3, 3, 3], length: 9 },
  { code: 'GB', dial: '44', groups: [4, 6], trunk: '0', length: 10 },
  { code: 'DE', dial: '49', groups: [3, 8], trunk: '0', length: 11 },
  { code: 'ES', dial: '34', groups: [3, 3, 3], length: 9 },
  { code: 'IT', dial: '39', groups: [3, 3, 4], length: 10 },
  { code: 'PT', dial: '351', groups: [3, 3, 3], length: 9 },
  { code: 'MX', dial: '52', groups: [2, 4, 4], length: 10 },
  { code: 'BR', dial: '55', groups: [2, 5, 4], length: 11 },
  { code: 'AU', dial: '61', groups: [3, 3, 3], trunk: '0', length: 9 },
  { code: 'NZ', dial: '64', groups: [2, 3, 4], trunk: '0', length: 9 },
  { code: 'EG', dial: '20', groups: [3, 3, 4], trunk: '0', length: 10 },
  { code: 'TH', dial: '66', groups: [2, 3, 4], trunk: '0', length: 9 },
  { code: 'ID', dial: '62', groups: [3, 4, 4], trunk: '0', length: 11 },
  { code: 'PH', dial: '63', groups: [3, 3, 4], trunk: '0', length: 10 },
  { code: 'MY', dial: '60', groups: [2, 4, 4], trunk: '0', length: 9 },
  { code: 'JP', dial: '81', groups: [2, 4, 4], trunk: '0', length: 10 },
  { code: 'ZA', dial: '27', groups: [2, 3, 4], trunk: '0', length: 9 },
];

/** @param {string} code @returns {Country} the country (CA when unknown) */
export const countryOf = (code) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** « CA +1 ». @param {string} code */
export const countryLabel = (code) => {
  const c = countryOf(code);
  return `${c.code} +${c.dial}`;
};

/**
 * The digits a country keeps of what was typed: only digits, the leading trunk 0 and the country's own code dropped
 * (a pasted « +1 514… » or « 06… » is understood), no more than the national length.
 * @param {string} text @param {string} code
 * @returns {string}
 */
export function nationalDigits(text, code) {
  const c = countryOf(code);
  const plus = text.trim().startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (plus && digits.startsWith(c.dial) && digits.length > c.dial.length) digits = digits.slice(c.dial.length);
  else if (c.dial === '1' && digits.length === c.length + 1 && digits.startsWith('1')) digits = digits.slice(1);
  if (c.trunk && digits.startsWith(c.trunk)) digits = digits.slice(c.trunk.length);
  return digits.slice(0, c.length);
}

/**
 * The number as it is typed, formatted for the country: « 514 555-0142 » (CA, US), « 6 12 34 56 78 » (FR). A partial
 * number is formatted as far as it goes, so the field never fights the typing.
 * @param {string} text @param {string} code
 * @returns {string}
 */
export function formatNational(text, code) {
  const c = countryOf(code);
  const digits = nationalDigits(text, code);
  if (c.dial === '1') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  /** @type {string[]} */
  const out = [];
  let at = 0;
  c.groups.forEach((size, i) => {
    if (at >= digits.length) return;
    const last = i === c.groups.length - 1;
    out.push(digits.slice(at, last ? undefined : at + size));
    at += size;
  });
  return out.join(' ');
}

/**
 * The number as it is shown, with its country code: « +1 514 555-0142 ».
 * @param {{ country: string, number: string }} phone `number`: the digits as stored
 * @returns {string} '' when there is no number
 */
export function formatInternational(phone) {
  const national = formatNational(phone.number, phone.country);
  return national ? `+${countryOf(phone.country).dial} ${national}` : '';
}

/**
 * Whether the number is complete for the country.
 * @param {string} text @param {string} code
 */
export const isCompletePhone = (text, code) => nationalDigits(text, code).length === countryOf(code).length;
