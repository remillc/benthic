// @ts-check
// Which scanned Bluetooth names really are a dive computer. The core matches a
// name to a model by its prefix (Subsurface's table); a prefix of two or three
// characters then takes in names of other devices: "S19 A69C LE" (a lamp, a
// scale) starts with "S1", the Oceans S1's prefix. The rule, here and only here:
// a match on a short prefix is dropped when the next character of the name is a
// digit ("S19" is not "S1"); "S1", "S1 1234", "S1-ABCD" stay.

/**
 * The prefixes of two or three characters in the core's table of names
 * (core/libopendives/download.cpp, namePattern), with the model each one gives.
 * Longer prefixes ("Perdix", "Teric", "OSTC", "Predator", "Sirius", "Puck",
 * "COSMIQ", "EON Core"...) name a product on their own and are not affected; the
 * names built on a pattern (Pelagic "FQ123456", Ratio, Cressi "2_00af") are
 * matched by the core on their whole shape.
 * @type {{ prefix: string, vendor: string, product: string }[]}
 */
export const SHORT_PREFIXES = [
  { prefix: 'S1', vendor: 'Oceans', product: 'S1' },
  { prefix: 'G2', vendor: 'Scubapro', product: 'G2' },
  { prefix: 'G3', vendor: 'Scubapro', product: 'G3' },
  { prefix: 'A1', vendor: 'Scubapro', product: 'Aladin A1' },
  { prefix: 'A2', vendor: 'Scubapro', product: 'Aladin A2' },
  { prefix: 'HUD', vendor: 'Scubapro', product: 'G2 HUD' },
];

/**
 * The model the core found for a scanned name, or null when the match is only
 * the beginning of an unrelated name.
 * @template {{ vendor: string, product: string }} C
 * @param {string} name the advertised name
 * @param {C|null|undefined} computer the core's match
 * @returns {C|null}
 */
export function confirmedComputer(name, computer) {
  if (!computer) return null;
  const lower = (name ?? '').toLowerCase();
  for (const { prefix, vendor, product } of SHORT_PREFIXES) {
    if (computer.vendor !== vendor || computer.product !== product) continue;
    const p = prefix.toLowerCase();
    if (lower.startsWith(p) && /\d/.test(lower.charAt(p.length))) return null;
  }
  return computer;
}
