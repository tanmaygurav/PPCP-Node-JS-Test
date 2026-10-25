import test from 'node:test';
import assert from 'node:assert/strict';
import { SafeEditor } from '../src/m03/coordination.mjs';

function fixture() {
  let record = { id: 'record', ownerUid: 'owner', lastEdited: '', title: 'Original', timestamp: 'original-date', media: [] };
  const operations = new Map(), dispatched = new Set(); let lock, writes = 0, loseResponse = false;
  const coordinator = {
    keys: (id, op) => [op, id],
    async reserve(id, op, data) { if (operations.has(op)) return { fresh: false, operation: operations.get(op) }; if (lock) return { fresh: false, operation: { state: 'busy' } }; lock = op; operations.set(op, data); return { fresh: true, operation: data }; },
    async finish(id, op, data) { assert.equal(lock, op); operations.set(op, data); lock = null; },
    async command([, key, value, nx]) { if (!nx) { operations.set(key, JSON.parse(value)); return 'OK'; } if (dispatched.has(key)) return null; dispatched.add(key); return 'OK'; }
  };
  const store = { async find() { return structuredClone(record); }, async validateEdit() {}, async updateExisting(item, changes, files, stamp, operationId) { writes++; record = { ...record, ...changes, lastEdited: stamp, lastSaveOperation: operationId }; if (loseResponse) throw new Error('Lost response'); return record; } };
  const input = { id: 'record', uid: 'owner', operationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', expectedLastEdited: '', changes: { title: 'Edited' }, files: [] };
  return { editor: new SafeEditor(store, coordinator), input, store, coordinator, writes: () => writes, lose: () => { loseResponse = true; } };
}
test('lost successful response reconciles without a second write', async () => {
  const f = fixture(); f.lose(); await assert.rejects(f.editor.save(f.input), /Lost response/);
  const result = await f.editor.save(f.input); assert.equal(result.alreadySaved, true); assert.equal(f.writes(), 1); assert.equal(result.item.timestamp, 'original-date');
});
test('concurrent identical operations dispatch once', async () => {
  const f = fixture(); await Promise.allSettled([f.editor.save(f.input), f.editor.save(f.input)]); assert.equal(f.writes(), 1);
});
test('stale edit and changed operation payload do not overwrite', async () => {
  const f = fixture(); await f.editor.save(f.input);
  await assert.rejects(f.editor.save({ ...f.input, changes: { title: 'Different' } }), /another save/);
  await assert.rejects(f.editor.save({ ...f.input, operationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }), /another tab/); assert.equal(f.writes(), 1);
});
test('another owner cannot edit', async () => {
  const f = fixture(); await assert.rejects(f.editor.save({ ...f.input, uid: 'other' }), /not found/); assert.equal(f.writes(), 0);
});
test('ambiguous write stays pending and blocks successors', async () => {
  const f = fixture(); f.store.updateExisting = async () => { throw new Error('Network outcome unknown'); };
  await assert.rejects(f.editor.save(f.input));
  await assert.rejects(f.editor.save(f.input), /pending reconciliation/);
  await assert.rejects(f.editor.save({ ...f.input, operationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }), /Another save is pending/);
});
