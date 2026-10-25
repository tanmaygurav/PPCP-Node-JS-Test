import { AppError } from '../domain.mjs';

export async function createOnce(store, coordination, { id, uid, operationId, requestHash }, prepare, write) {
  if (!/^[a-f0-9-]{36}$/i.test(operationId || '')) throw new AppError(400, 'A save operation UUID is required.');
  const { fresh, operation } = await coordination.reserve(id, operationId, { state: 'pending', uid, requestHash, submissionId: id, timestamp: new Date().toISOString() });
  if (operation.state === 'busy') throw new AppError(409, 'A save is pending for this submission.');
  if (operation.uid !== uid || operation.requestHash !== requestHash) throw new AppError(409, 'Operation ID already belongs to another save.');
  if (operation.state === 'failed') throw new AppError(operation.status, operation.message);
  let existing;
  try { existing = await store.find(id); }
  catch (error) {
    if (fresh) await coordination.finish(id, operationId, { ...operation, state: 'failed', status: error.status || 502, message: 'Could not read submissions. No append was dispatched.' });
    throw error;
  }
  if (existing) {
    if (existing.ownerUid !== uid) throw new AppError(404, 'Submission not found.');
    if (operation.state !== 'complete') {
      if (existing.lastSaveOperation !== operationId) {
        if (fresh) await coordination.finish(id, operationId, { ...operation, state: 'failed', status: 409, message: 'Submission already exists under another save.' });
        throw new AppError(409, 'Submission already exists under another save.');
      }
      await coordination.finish(id, operationId, { ...operation, state: 'complete' });
    }
    return { item: existing, alreadySaved: true };
  }
  if (!fresh || operation.state === 'complete') throw new AppError(409, 'Save outcome is pending reconciliation. Keep your draft.');
  let prepared;
  try { prepared = await prepare(); }
  catch (error) {
    await coordination.finish(id, operationId, { ...operation, state: 'failed', status: error.status || 502, message: error instanceof AppError ? error.message : 'Submission validation failed.' });
    throw error;
  }
  const item = await write(prepared);
  await coordination.finish(id, operationId, { ...operation, state: 'complete' });
  return { item, alreadySaved: false };
}
