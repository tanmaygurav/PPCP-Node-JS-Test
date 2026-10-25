import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { RedisCoordination, SafeEditor } from '../src/m03/coordination.mjs';
loadM03Env(); const config = m03Config();
if (config.checkpoint !== 'M03-B') throw new Error('M03-B only.');
const namespace = `m03-b-coordination-test-${Date.now()}`, a = new RedisCoordination({ ...config.redis, namespace }), b = new RedisCoordination({ ...config.redis, namespace });
let writes = 0, completeWrite; const barrier = new Promise(resolve => { completeWrite = resolve; });
let record = { id: 'fixture', ownerUid: 'owner', lastEdited: '', media: [{ fileId: 'removed-file' }], title: 'Original' };
const store = { async find() { return structuredClone(record); }, async validateEdit() {}, async updateExisting(item, changes, files, timestamp, operationId) { writes++; await barrier; record = { ...record, ...changes, media: [], lastEdited: timestamp, lastSaveOperation: operationId }; return record; }, async trashAttachment(id, file) { assert.equal(id, 'fixture'); assert.equal(file, 'removed-file'); } };
const first = { id: 'fixture', uid: 'owner', operationId: randomUUID(), expectedLastEdited: '', changes: { title: 'Edited' }, files: [], requestHash: 'fixture-hash' };
const second = { ...first, operationId: randomUUID() }, results = [];
try {
  const saving = new SafeEditor(store, a).save(first);
  while (!writes) await new Promise(resolve => setTimeout(resolve, 25));
  await assert.rejects(new SafeEditor(store, b).save(second), /Another save is pending/);
  completeWrite(); await saving; assert.equal(writes, 1);
  results.push({ name: 'R01 separate Redis clients serialize the same record', status: 'passed' });
  const resumed = await new SafeEditor(store, b).resume(first.id, first.uid, first.operationId, first.requestHash); assert.equal(resumed.alreadySaved, true); assert.equal(writes, 1);
  results.push({ name: 'R02 another instance reconciles without repeating the write', status: 'passed' });
  assert.equal(await a.command(['HLEN', `${namespace}:cleanup`]), 1);
  const cleaned = await b.retryCleanup(store); assert.deepEqual(cleaned, { completed: 1, failed: 0 });
  results.push({ name: 'R03 committed cleanup survives across Redis clients', status: 'passed' });
} catch (error) { completeWrite(); results.push({ name: 'shared Redis verification', status: 'failed', error: error.name }); process.exitCode = 1; }
finally {
  // Exact synthetic keys only; never scan, flush or delete a pilot reservation.
  const keys = [...a.keys(first.id, first.operationId), ...a.keys(second.id, second.operationId), `${a.keys(first.id, first.operationId)[0]}:dispatched`, `${a.keys(second.id, second.operationId)[0]}:dispatched`, `${namespace}:cleanup`];
  await a.command(['DEL', ...new Set(keys)]);
  mkdirSync('output/m03', { recursive: true }); const path = `output/m03/redis-${Date.now()}.json`; writeFileSync(path, JSON.stringify({ namespace, results }, null, 2)); console.log(JSON.stringify({ path, results }));
}
