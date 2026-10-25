import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnce } from '../src/m03/create.mjs';
import { AppError } from '../src/domain.mjs';
function fixture() {
  const operations = new Map(); let lock = null, record, writes = 0;
  const coordination = {
    async reserve(id, op, value) {
      if (operations.has(op)) return { fresh: false, operation: operations.get(op) };
      if (lock) return { fresh: false, operation: { state: 'busy' } };
      lock = op; operations.set(op, value); return { fresh: true, operation: value };
    },
    async finish(id, op, value) { assert.equal(lock, op); operations.set(op, value); lock = null; }
  };
  const store = { async find() { return record; } };
  const input = { id: 'fixture', uid: 'owner', operationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', requestHash: 'fixture-digest' };
  const write = async () => { writes++; record = { id: input.id, ownerUid: input.uid, lastSaveOperation: input.operationId }; return record; };
  return { coordination, store, input, write, writes: () => writes };
}
test('new submissions are appended once under duplicate concurrent requests', async () => {
  const f = fixture(); const save = () => createOnce(f.store, f.coordination, f.input, async () => [], f.write);
  await Promise.allSettled([save(), save()]); assert.equal(f.writes(), 1);
  assert.equal((await save()).alreadySaved, true); assert.equal(f.writes(), 1);
});
test('uncertain append response reconciles by the saved operation marker', async () => {
  const f = fixture();
  await assert.rejects(createOnce(f.store, f.coordination, f.input, async () => [], async () => { await f.write(); throw new Error('Lost append response'); }));
  assert.equal((await createOnce(f.store, f.coordination, f.input, async () => [], f.write)).alreadySaved, true); assert.equal(f.writes(), 1);
});
test('failed upload validation releases reservation without an append', async () => {
  const f = fixture();
  await assert.rejects(createOnce(f.store, f.coordination, f.input, async () => { throw new AppError(409, 'Incomplete upload'); }, f.write), /Incomplete upload/);
  assert.equal(f.writes(), 0);
  const input = { ...f.input, operationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
  await createOnce(f.store, f.coordination, input, async () => [], f.write); assert.equal(f.writes(), 1);
});
