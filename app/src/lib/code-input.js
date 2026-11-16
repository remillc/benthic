// The confirmation code field (CodeField.svelte): pure rules for the text typed,
// pasted or deleted, and for which of the six boxes is the active one.

/** Number of digits of a confirmation code. */
export const CODE_LENGTH = 6;

/**
 * What a field keeps of the text it receives (typed, pasted, filled in by the
 * system): the digits only, at most `length` of them. A pasted "482 913" or
 * "482-913" gives 482913.
 * @param {string} text
 * @param {number} [length]
 * @returns {string}
 */
export function sanitizeCode(text, length = CODE_LENGTH) {
  return String(text ?? '').replace(/\D/g, '').slice(0, length);
}

/**
 * The code after Backspace: the last digit goes, so the active box goes back one.
 * @param {string} code
 * @returns {string}
 */
export function deleteLastDigit(code) {
  return code.slice(0, -1);
}

/**
 * The index of the box being typed: the first empty one, or the last when the
 * code is complete.
 * @param {string} code
 * @param {number} [length]
 * @returns {number}
 */
export function activeBox(code, length = CODE_LENGTH) {
  return Math.min(code.length, length - 1);
}

/**
 * The digit shown in each box ('' for an empty one).
 * @param {string} code
 * @param {number} [length]
 * @returns {string[]}
 */
export function boxDigits(code, length = CODE_LENGTH) {
  return Array.from({ length }, (_, i) => code[i] ?? '');
}

/**
 * Whether the code has all its digits.
 * @param {string} code
 * @param {number} [length]
 */
export function codeComplete(code, length = CODE_LENGTH) {
  return code.length === length && /^\d+$/.test(code);
}
