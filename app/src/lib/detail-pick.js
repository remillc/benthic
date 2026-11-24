// @ts-check
// What the phone's detail sheet (components/DetailSheet.svelte) and the kit menu show: the rows that match the typed
// text, and the kit menu's rows (« Plongée précédente », the kits with their piece counts, « Gérer les kits »).

/**
 * The rows whose label contains the text (not case sensitive); all of them for an empty text.
 * @template {{ label: string }} T
 * @param {T[]} options
 * @param {string} query
 * @returns {T[]}
 */
export function filterSheetOptions(options, query) {
  const q = query.trim().toLocaleLowerCase();
  return q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options;
}

/** The values of the kit menu's two fixed rows. */
export const KIT_PREVIOUS = '__previous__';
export const KIT_MANAGE = '__manage__';

/**
 * The rows of the kit menu: « Plongée précédente » first when there is a dive before this one, the diver's kits with
 * their piece counts, then a divider and « Gérer les kits ».
 * @param {{ id: string, name: string, gearIds: string[] }[]} kits
 * @param {{ number: number }|null} previous the dive before this one, or null
 * @param {{ previous: string, previousLine: (number: number) => string, pieces: (n: number) => string, manage: string }} words
 * @returns {{ value: string, label: string, example?: string, icon?: string, divider?: boolean }[]}
 */
export function kitMenuOptions(kits, previous, words) {
  return [
    ...(previous ? [{ value: KIT_PREVIOUS, label: words.previous, example: words.previousLine(previous.number), icon: 'copy' }] : []),
    ...kits.map((kit) => ({ value: kit.id, label: kit.name, example: words.pieces(kit.gearIds.length) })),
    { value: KIT_MANAGE, label: words.manage, icon: 'settings', divider: true },
  ];
}
