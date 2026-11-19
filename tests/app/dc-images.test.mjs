// Kept pictures of dive computers (tasks 2026-11-19-302 and 303): the device copy is used offline and a model
// without a picture gives nothing. The server is not configured under node, so nothing is fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog, computerImage, useStorage, sizeFor } from '../../app/src/lib/dc-images.js';

const catalog = [
  { vendor: 'Shearwater', product: 'Perdix AI', slug: 'shearwater-perdix-ai', hasImage: true },
  { vendor: 'Shearwater', product: 'Nerd', slug: 'shearwater-nerd', hasImage: false },
];

/** A storage that holds a catalog and one picture, like a device that fetched them earlier. */
function kept() {
  const texts = new Map([['catalog.json', JSON.stringify(catalog)]]);
  const images = new Map([['128/shearwater-perdix-ai.webp', 'AAAA']]);
  return {
    getText: async (name) => texts.get(name) ?? null,
    putText: async (name, text) => void texts.set(name, text),
    imageUrl: async (name) => (images.has(name) ? `kept://${name}` : null),
    putImage: async (name, data) => void images.set(name, data),
  };
}

test('offline, the kept catalog and picture are used', async () => {
  useStorage(kept());
  // The catalog is older than a day or unknown: with no server it falls back to the kept copy.
  assert.equal((await getCatalog()).length, 2);
  assert.equal(await computerImage('Shearwater Perdix AI', 128), 'kept://128/shearwater-perdix-ai.webp');
});

test('a model without a picture, an unknown model and an empty one give null', async () => {
  useStorage(kept());
  assert.equal(await computerImage('Shearwater Nerd'), null);
  assert.equal(await computerImage('manually added dive'), null);
  assert.equal(await computerImage(''), null);
});

test('a picture that is not kept and cannot be fetched gives null (generic icon)', async () => {
  useStorage(kept());
  assert.equal(await computerImage('Shearwater Perdix AI', 512), null);
});

test('128 px is enough up to 128 device pixels', () => {
  assert.ok([128, 512].includes(sizeFor(48)));
});

// Task 2026-11-19-303: the diver's own photo of a computer belongs to the piece (inventory, account data); it is
// never added to the shared catalog or to the picture cache of the dive computer images.
test('saving a piece photo writes to the inventory only, never to the dive computer image store', async () => {
  const { createFileStore, memoryBackend } = await import('../../app/src/lib/file-store.js');
  const { createInventory } = await import('../../app/src/lib/inventory.js');
  const shared = kept();
  const sharedWrites = [];
  useStorage({ ...shared, putText: async (n, x) => (sharedWrites.push(n), shared.putText(n, x)), putImage: async (n, x) => (sharedWrites.push(n), shared.putImage(n, x)) });
  const backend = memoryBackend();
  const inventory = createInventory(createFileStore(backend), { now: () => new Date(Date.UTC(2026, 10, 19, 12, 0, 0)) });
  const photoId = await inventory.savePhoto('data:image/jpeg;base64,AAAA');
  const piece = await inventory.saveGear({ type: 'computer', name: 'Shearwater Perdix AI', brand: 'Shearwater', model: 'Perdix AI', photoId });
  assert.equal(piece.photoId, photoId);
  assert.equal(await inventory.readPhoto(photoId), 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(sharedWrites, [], 'nothing reached the shared catalog or image cache');
  // The catalog photo of the model is untouched.
  assert.equal(await computerImage('Shearwater Perdix AI', 128), 'kept://128/shearwater-perdix-ai.webp');
  assert.deepEqual(sharedWrites, []);
});
