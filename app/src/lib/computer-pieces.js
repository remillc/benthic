// @ts-check
// Dive computers are pieces (Christian's request of 27 November 2026, as suits are: lib/suit-pieces.js): every computer the
// logbook's dives come from (« Ordinateurs du carnet »: model and serial number) becomes a piece of type computer, tied to it
// through `computerModel` and `computerSerial`, for a Benthic+ account. Pure functions: what to create, and the files that
// remember the computers the diver deleted. A computer a piece already stands for (lib/dc-model.js `sameComputer`) is left.
import { deriveId } from './short-id.js';
import { modelKey, sameComputer, serialKey } from './dc-model.js';

/** @typedef {import('./inventory.js').Gear} Gear */

export const DISMISSED_COMPUTERS_FOLDER = 'dismissed-computers/';

/** A logbook computer as comparable text: the model's key and the serial's. @param {string} model @param {string} serial */
export const computerKeyOf = (model, serial) => `${modelKey(model)}|${serialKey(serial)}`;

/** The id of the piece made for a computer: the same on every device. @param {string} model @param {string} serial */
export const computerPieceId = (model, serial) => deriveId(`computer-piece|${computerKeyOf(model, serial)}`);

/** The path of the file that remembers a deleted computer. @param {string} model @param {string} serial */
export const dismissedComputerPath = (model, serial) => `${DISMISSED_COMPUTERS_FOLDER}${deriveId(`computer-dismissed|${computerKeyOf(model, serial)}`)}.json`;

/** @param {string} model @param {string} serial @param {string} stamp */
export const newDismissedComputer = (model, serial, stamp) => ({
  id: deriveId(`computer-dismissed|${computerKeyOf(model, serial)}`),
  key: computerKeyOf(model, serial),
  model: String(model).trim(),
  serial: String(serial ?? '').trim(),
  createdAt: stamp,
  updatedAt: stamp,
});

/** The comparable keys of the computers the diver deleted. @param {any[]} files @returns {Set<string>} */
export const dismissedComputerKeys = (files) => new Set(files.filter((f) => f && typeof f.key === 'string' && f.key).map((f) => f.key));

/**
 * The pieces to make for the logbook's computers: one per computer with dives that no piece stands for and the diver did not
 * delete. Its name is the computer's nickname, else its model.
 * @param {{ model: string, serial: string, nickname?: string, dives: number }[]} computers « Ordinateurs du carnet »
 * @param {Gear[]} pieces every piece, retired ones included
 * @param {Set<string>} [dismissed] the keys of the computers the diver deleted
 * @returns {{ id: string, name: string, computerModel: string, computerSerial: string }[]}
 */
export function planComputerPieces(computers, pieces, dismissed = new Set()) {
  /** @type {Map<string, { id: string, name: string, computerModel: string, computerSerial: string }>} */
  const create = new Map();
  for (const c of computers) {
    const model = String(c.model ?? '').trim();
    if (!modelKey(model) || !(c.dives > 0)) continue;
    const serial = String(c.serial ?? '').trim();
    const key = computerKeyOf(model, serial);
    if (create.has(key) || dismissed.has(key)) continue;
    if (pieces.some((p) => p.type === 'computer' && sameComputer(p, { model, serial }))) continue;
    create.set(key, { id: computerPieceId(model, serial), name: String(c.nickname ?? '').trim() || model, computerModel: model, computerSerial: serial });
  }
  return [...create.values()].sort((a, b) => a.name.localeCompare(b.name));
}
