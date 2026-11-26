// @ts-check
// Suits are pieces (task 2026-11-26-406): every distinct text of the dives' « Combinaison » field becomes a piece of type suit,
// tied to the text through `suitNames` (task 405), for a Benthic+ account. Pure functions: what to create, what to extend, and
// the files that remember the texts the diver deleted. Texts that differ only by case, accents or spaces are one piece.
import { deriveId } from './short-id.js';

/** @typedef {import('./inventory.js').Gear} Gear */

export const DISMISSED_SUITS_FOLDER = 'dismissed-suits/';

/** A suit text as comparable text: accents, case and spaces ignored. @param {string} name */
export const suitNorm = (name) => String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The id of the piece made for a text: the same on every device, so two devices that make it write the same file. @param {string} name */
export const suitPieceId = (name) => deriveId(`suit-piece|${suitNorm(name)}`);

/** The path of the file that remembers a deleted text. @param {string} name */
export const dismissedSuitPath = (name) => `${DISMISSED_SUITS_FOLDER}${deriveId(`suit-dismissed|${suitNorm(name)}`)}.json`;

/** @param {string} name @param {string} stamp */
export const newDismissedSuit = (name, stamp) => ({ id: deriveId(`suit-dismissed|${suitNorm(name)}`), key: suitNorm(name), name: String(name).trim(), createdAt: stamp, updatedAt: stamp });

/** The comparable texts the diver deleted. @param {any[]} files @returns {Set<string>} */
export const dismissedKeys = (files) => new Set(files.filter((f) => f && typeof f.key === 'string' && f.key).map((f) => f.key));

/**
 * What the logbook's suit texts ask of the inventory.
 * - `create`: a text no piece has and the diver did not delete: a new piece (the most used spelling as its name, every spelling
 *   in `suitNames`).
 * - `extend`: a piece that has the text, or a suit piece of the same name, but not one of its spellings: the spellings are added.
 * @param {{ key: string, dives: number }[]} values the texts of the dives with their dive counts
 * @param {Gear[]} pieces every piece, retired ones included
 * @param {Set<string>} [dismissed] the comparable texts the diver deleted
 * @returns {{ create: { id: string, name: string, suitNames: string[] }[], extend: { id: string, suitNames: string[] }[] }}
 */
export function planSuitPieces(values, pieces, dismissed = new Set()) {
  /** @type {Map<string, Map<string, number>>} */
  const groups = new Map();
  for (const v of values) {
    const text = String(v.key ?? '').trim();
    const key = suitNorm(text);
    if (!key || !(v.dives > 0)) continue;
    const spellings = groups.get(key) ?? new Map();
    spellings.set(text, (spellings.get(text) ?? 0) + v.dives);
    groups.set(key, spellings);
  }
  /** @type {Map<string, Gear>} */
  const owner = new Map();
  for (const p of pieces) for (const n of p.suitNames ?? []) if (suitNorm(n)) owner.set(suitNorm(n), p);
  /** @type {Map<string, Gear>} a suit piece by its own name, when it holds no text of that name */
  const byName = new Map();
  for (const p of pieces) if (p.type === 'suit' && suitNorm(p.name) && !byName.has(suitNorm(p.name))) byName.set(suitNorm(p.name), p);

  /** @type {{ id: string, name: string, suitNames: string[] }[]} */
  const create = [];
  /** @type {Map<string, string[]>} */
  const extend = new Map();
  for (const [key, spellings] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
    const target = owner.get(key) ?? byName.get(key);
    if (target) {
      const have = new Set((target.suitNames ?? []).map((n) => n.trim()));
      const missing = ordered.filter((s) => !have.has(s));
      if (missing.length) extend.set(target.id, [...(extend.get(target.id) ?? []), ...missing]);
    } else if (!dismissed.has(key)) {
      create.push({ id: suitPieceId(key), name: ordered[0], suitNames: ordered });
    }
  }
  return { create, extend: [...extend].map(([id, suitNames]) => ({ id, suitNames })) };
}

/** Whether the plan changes nothing. @param {ReturnType<typeof planSuitPieces>} plan */
export const planIsEmpty = (plan) => !plan.create.length && !plan.extend.length;
