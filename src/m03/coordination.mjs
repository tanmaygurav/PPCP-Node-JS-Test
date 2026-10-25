import { createHash } from 'node:crypto';
import { AppError } from '../domain.mjs';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// One atomic Lua transition; no expiring record lock. An interrupted writer must
// be reconciled before a successor is permitted to write to Google Sheets.
const RESERVE = `
local existing = redis.call('GET', KEYS[1])
if existing then return cjson.encode({fresh=false,operation=cjson.decode(existing)}) end
local holder = redis.call('GET', KEYS[2])
if holder then return cjson.encode({fresh=false,operation={state='busy'}}) end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], KEYS[1])
return cjson.encode({fresh=true,operation=cjson.decode(ARGV[1])})`;
const FINISH = `
if redis.call('GET', KEYS[2]) ~= KEYS[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
local op = cjson.decode(ARGV[1])
if op.state == 'complete' and op.cleanup then
  for _, file in ipairs(op.cleanup) do redis.call('HSET', KEYS[3], file, op.submissionId) end
end
redis.call('DEL', KEYS[2])
return 1`;

export class RedisCoordination {
  constructor({ url, token, namespace }, fetcher = fetch) {
    if (!url || new URL(url).protocol !== 'https:' || !token || !/^m03-[ab]-[\w-]+$/.test(namespace)) throw new Error('Configure isolated M03 Redis HTTPS credentials and namespace.');
    Object.assign(this, { url, token, namespace, fetch: fetcher });
  }
  keys(id, operationId) { return [`${this.namespace}:operation:${id}:${operationId}`, `${this.namespace}:record:${id}`]; }
  async command(command) {
    const response = await this.fetch(this.url, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new AppError(503, 'Save coordination is unavailable. Keep your draft and retry the same operation.');
    const result = await response.json();
    if (result.error) throw new AppError(503, 'Save coordination failed. Keep your draft.');
    return result.result;
  }
  async reserve(id, operationId, metadata) {
    return JSON.parse(await this.command(['EVAL', RESERVE, 2, ...this.keys(id, operationId), JSON.stringify(metadata)]));
  }
  async finish(id, operationId, metadata) {
    if (await this.command(['EVAL', FINISH, 3, ...this.keys(id, operationId), `${this.namespace}:cleanup`, JSON.stringify(metadata)]) !== 1) throw new AppError(503, 'Save requires reconciliation.');
  }
  async retryCleanup(store, limit = 10) {
    const entries = await this.command(['HGETALL', `${this.namespace}:cleanup`]) || [];
    let completed = 0, failed = 0;
    for (let i = 0; i < Math.min(entries.length, limit * 2); i += 2) {
      try {
        const current = await store.find(entries[i + 1]);
        if (!current || current.media.some(file => file.fileId === entries[i])) { failed++; continue; }
        await store.trashAttachment(entries[i + 1], entries[i]);
        await this.command(['HDEL', `${this.namespace}:cleanup`, entries[i]]); completed++;
      } catch { failed++; }
    }
    return { completed, failed };
  }
}

export class SafeEditor {
  constructor(store, coordination) { Object.assign(this, { store, coordination }); }
  async resume(id, uid, operationId, requestHash) {
    const raw = await this.coordination.command(['GET', this.coordination.keys(id, operationId)[0]]);
    if (!raw) return null;
    const operation = JSON.parse(raw);
    if (operation.uid !== uid || operation.requestHash !== requestHash) throw new AppError(409, 'Operation ID already belongs to another save.');
    if (operation.state === 'failed') throw new AppError(operation.status, operation.message);
    const item = await this.store.find(id);
    if (!item || item.ownerUid !== uid) throw new AppError(404, 'Submission not found.');
    if (operation.state === 'complete') return { item, alreadySaved: true };
    if (item.lastEdited === operation.timestamp && item.lastSaveOperation === operationId) {
      await this.coordination.finish(id, operationId, { ...operation, state: 'complete' });
      return { item, alreadySaved: true };
    }
    throw new AppError(409, 'Save outcome is pending reconciliation. Keep your draft and retry this operation later.');
  }
  async save({ id, uid, operationId, expectedLastEdited, changes, files, requestHash }) {
    if (!/^[a-f0-9-]{36}$/i.test(operationId || '')) throw new AppError(400, 'A save operation UUID is required.');
    const fingerprint = digest({ uid, expectedLastEdited, changes, files });
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(expectedLastEdited) || 0) + 1)).toISOString();
    const { fresh, operation: reservation } = await this.coordination.reserve(id, operationId, { state: 'pending', uid, fingerprint, timestamp, requestHash });
    if (reservation.state === 'busy') throw new AppError(409, 'Another save is pending. Keep your draft and reconcile it first.');
    if (reservation.uid !== uid || reservation.fingerprint !== fingerprint) throw new AppError(409, 'Operation ID already belongs to another save.');
    if (reservation.state === 'failed') throw new AppError(reservation.status, reservation.message);
    if (reservation.state === 'complete') return { item: await this.store.find(id), alreadySaved: true };
    // Only the process that created the reservation may dispatch a write. A
    // repeated request reads the target timestamp; it never repeats the write.
    const item = await this.store.find(id);
    if (!item || item.ownerUid !== uid) {
      await this.coordination.finish(id, operationId, { ...reservation, state: 'failed', status: 404, message: 'Submission not found.' });
      throw new AppError(404, 'Submission not found.');
    }
    if (!fresh && item.lastEdited === reservation.timestamp && item.lastSaveOperation === operationId) {
      await this.coordination.finish(id, operationId, { ...reservation, state: 'complete' });
      return { item, alreadySaved: true };
    }
    // Dispatch claim is atomic and remains durable even if the HTTP response is lost.
    const claim = await this.coordination.command(['SET', `${this.coordination.keys(id, operationId)[0]}:dispatched`, '1', 'NX']);
    if (!claim) throw new AppError(409, 'Save outcome is pending reconciliation. Keep your draft and retry this operation later.');
    try {
      if ((item.lastEdited || '') !== expectedLastEdited) throw new AppError(409, 'This pain point changed in another tab. Keep your draft and reload the saved version.');
      await this.store.validateEdit(item, changes, files);
    } catch (error) {
      await this.coordination.finish(id, operationId, { ...reservation, state: 'failed', status: error.status || 502, message: error instanceof AppError ? error.message : 'Validation failed.' });
      throw error;
    }
    // From this point any failure is ambiguous. Keep the reservation indefinitely;
    // reconciliation may confirm the timestamp but must not redispatch this PUT.
    const pending = { ...reservation, submissionId: id, cleanup: item.media.filter(old => !files.some(file => file.id === old.fileId)).map(file => file.fileId) };
    await this.coordination.command(['SET', this.coordination.keys(id, operationId)[0], JSON.stringify(pending)]);
    const saved = await this.store.updateExisting(item, changes, files, reservation.timestamp, operationId);
    await this.coordination.finish(id, operationId, { ...pending, state: 'complete' });
    return { item: saved, alreadySaved: false };
  }
}
