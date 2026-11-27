// Dive computers are pieces (27 November 2026): every computer of « Ordinateurs du carnet » becomes a computer piece, once,
// unless a piece already stands for it or the diver deleted it (app/src/lib/computer-pieces.js and the inventory).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planComputerPieces, computerPieceId, computerKeyOf, dismissedComputerKeys, newDismissedComputer } from '../../app/src/lib/computer-pieces.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';

const inventory = () => createInventory(createFileStore(memoryBackend()));
const petrel = { model: 'Shearwater Petrel 2', serial: '1A2B3C', nickname: '', dives: 212 };
const perdix = { model: 'Shearwater Perdix', serial: '', nickname: 'Le Perdix', dives: 40 };

test('each logbook computer with dives becomes a piece named by its nickname, else its model', () => {
  const plan = planComputerPieces([petrel, perdix, { model: 'Suunto D5', serial: '9', nickname: '', dives: 0 }], []);
  assert.deepEqual(plan.map((c) => [c.name, c.computerModel, c.computerSerial]), [
    ['Le Perdix', 'Shearwater Perdix', ''],
    ['Shearwater Petrel 2', 'Shearwater Petrel 2', '1A2B3C'],
  ]);
  assert.equal(plan[1].id, computerPieceId('Shearwater Petrel 2', '1A2B3C'), 'the same id on every device');
});

test('a computer a piece already stands for, or one the diver deleted, is not made again', () => {
  const piece = { id: 'p1', type: 'computer', name: 'Mon Petrel', computerModel: 'Shearwater Petrel 2', computerSerial: '1A2B3C', retired: true };
  assert.deepEqual(planComputerPieces([petrel], [/** @type {any} */ (piece)]), []);
  const dismissed = dismissedComputerKeys([newDismissedComputer('Shearwater Perdix', '', '2026-11-27T00:00:00Z')]);
  assert.deepEqual(planComputerPieces([perdix], [], dismissed), []);
  assert.ok(dismissed.has(computerKeyOf('shearwater perdix', '')));
});

test('the inventory makes the pieces once; deleting one remembers its computer', async () => {
  const inv = inventory();
  const plan = planComputerPieces([petrel], await inv.listGear(), await inv.dismissedComputers());
  assert.equal(await inv.applyComputerPlan(plan), 1);
  assert.equal(await inv.applyComputerPlan(plan), 0, 'idempotent');
  const [piece] = await inv.listGear();
  assert.equal(piece.type, 'computer');
  assert.equal(piece.computerSerial, '1A2B3C');
  assert.equal(piece.serial, '1A2B3C');
  await inv.deleteGear(piece.id);
  assert.deepEqual(planComputerPieces([petrel], await inv.listGear(), await inv.dismissedComputers()), [], 'not made again after deletion');
});
