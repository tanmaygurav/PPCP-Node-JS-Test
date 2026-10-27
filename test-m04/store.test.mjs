import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { MemoryDB } from './memory.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { AppError, digest, files } from '../src/m04/domain.mjs';
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const config = { secret: 'test-secret'.repeat(4), bootstrapUids: ['admin'] };
const identity = { uid: 'student', email: 'student@welingkar.org' };
const input = { title: 'Water access', domain: 'Education', description: 'A real problem', solution: '' };
async function fixture() {
  const db = emulator ? new Firestore({ projectId: 'demo-ppcp-m04', databaseId: `test-${randomUUID()}` }) : new MemoryDB();
  const savedFiles = new Map();
  const drive = { reserve: async list => list.map(() => randomUUID()), start: async (upload, file) => { savedFiles.set(file.id, { file, ownerUid: upload.ownerUid, submissionId: upload.submissionId, uploadId: upload.id, complete: false }); return { ...file, uploadUrl: 'https://www.googleapis.com/test' }; }, verify: async (file, ownerUid, submissionId, uploadId) => { const actual = savedFiles.get(file.id); if (!actual) throw new AppError(404, 'Missing'); if (!actual.complete || actual.ownerUid !== ownerUid || actual.submissionId !== submissionId || (uploadId && actual.uploadId !== uploadId)) throw new AppError(409, 'Incomplete or foreign file'); return actual; }, publish: async (file, ownerUid, submissionId, uploadId) => { await drive.verify(file, ownerUid, submissionId, uploadId); return { ...file, webViewLink: `https://drive.google.com/file/d/${file.id}/view` }; } };
  const store = new M04Store(config, db, drive);
  await store.ref('domains', digest('education')).set({ name: 'Education', active: true });
  const student = await store.register(identity, { name: 'Student', program: 'PGDM', studentId: 'S1', role: 'admin' });
  const admin = await store.register({ uid: 'admin', email: 'admin@welingkarmail.org' }, { name: 'Admin', program: 'Staff', studentId: 'A1' });
  const faculty = await store.register({ uid: 'faculty', email: 'faculty@welingkar.org' }, { name: 'Faculty', program: 'Staff', studentId: 'F1' });
  await store.changeUser(admin, faculty.uid, { role: 'faculty', status: 'active', operationId: randomUUID() }); faculty.role = 'faculty';
  async function create(extra = {}) { const operationId = randomUUID(), upload = await store.prepare(student, { operationId, files: [] }); return store.save(student, { ...input, operationId, uploadId: upload.uploadId, ...extra }); }
  return { db, store, student, admin, faculty, drive, savedFiles, create };
}
test('registration ignores role injection; bootstrap occurs only once', async () => {
  const { store, student, admin } = await fixture(); assert.equal(student.role, 'student'); assert.equal(admin.role, 'admin');
  await store.changeUser(admin, student.uid, { role: 'admin', status: 'active', operationId: randomUUID() });
  await store.changeUser(admin, admin.uid, { role: 'student', status: 'active', operationId: randomUUID() });
  assert.equal((await store.register({ uid: 'admin', email: admin.email }, { name: 'A', program: 'A', studentId: 'A' })).role, 'student');
});
test('20 concurrent creates receive unique immutable numeric and readable IDs', async () => {
  const { create, store, student } = await fixture(); const results = await Promise.all(Array.from({ length: 20 }, () => create()));
  assert.equal(new Set(results.map(r => r.displayId)).size, 20);
  assert.deepEqual(results.map(r => Number(r.displayId.slice(2))).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const result of results) { const item = await store.find(student, result.submissionId); assert.equal(item.displayId, result.displayId); assert.notEqual(item.id, item.displayId); }
});
test('lost create response and changed payload reuse reconcile without another write', async () => {
  const { store, student } = await fixture(), operationId = randomUUID(), upload = await store.prepare(student, { operationId, files: [] }), data = { ...input, operationId, uploadId: upload.uploadId };
  const first = await store.save(student, data); assert.deepEqual(await store.save(student, data), first); assert.deepEqual(await store.receipt(student, operationId), first);
  await assert.rejects(store.save(student, { ...data, title: 'Changed' }), { status: 409 });
});
test('ownership, faculty content editing and incomplete replacement leave current content intact', async () => {
  const { store, student, faculty, create } = await fixture(), created = await create(), item = await store.find(student, created.submissionId);
  await assert.rejects(store.find({ ...student, uid: 'other' }, item.id), { status: 404 });
  await assert.rejects(store.save(faculty, {}, item.id), { status: 403 });
  const operationId = randomUUID(), upload = await store.prepare(student, { operationId, submissionId: item.id, expectedVersion: item.version, files: [{ name: 'new.pdf', size: 10 }] });
  await assert.rejects(store.save(student, { ...input, title: 'Bad replacement', operationId, uploadId: upload.uploadId, expectedVersion: item.version }, item.id), { status: 409 });
  assert.deepEqual(await store.find(student, item.id), item);
});
test('lock/save races reject one side; unlock permits a fresh edit and preserves remarks', async () => {
  const { store, student, faculty, create } = await fixture(), created = await create(), item = await store.find(student, created.submissionId), operationId = randomUUID();
  const upload = await store.prepare(student, { operationId, submissionId: item.id, expectedVersion: 1, files: [] });
  await store.mutate(faculty, item.id, 'remarks', { operationId: randomUUID(), remark: 'Review this' });
  const results = await Promise.allSettled([store.mutate(student, item.id, 'lock', { operationId: randomUUID(), expectedVersion: 1 }), store.save(student, { ...input, operationId, uploadId: upload.uploadId, expectedVersion: 1 }, item.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const current = await store.find(student, item.id); assert.equal(current.version, 2); assert(current.hasRemarks);
  if (!current.locked) await store.mutate(faculty, item.id, 'lock', { operationId: randomUUID(), expectedVersion: current.version });
  const locked = await store.find(student, item.id);
  await assert.rejects(store.prepare(student, { operationId: randomUUID(), submissionId: item.id, expectedVersion: locked.version, files: [] }), { status: 409 });
  await assert.rejects(store.mutate(student, item.id, 'unlock', { operationId: randomUUID(), expectedVersion: locked.version }), { status: 403 });
  await store.mutate(faculty, item.id, 'unlock', { operationId: randomUUID(), expectedVersion: locked.version });
  const unlocked = await store.find(student, item.id), editOp = randomUUID(), next = await store.prepare(student, { operationId: editOp, submissionId: item.id, expectedVersion: unlocked.version, files: [] });
  const data = { ...input, title: 'Updated', operationId: editOp, uploadId: next.uploadId, expectedVersion: unlocked.version };
  const saved = await store.save(student, data, item.id); assert.deepEqual(await store.save(student, data, item.id), saved); assert((await store.find(student, item.id)).hasRemarks);
});
test('last administrator is protected under concurrent demotions; disabled sessions lose write access', async () => {
  const { store, admin, student, faculty } = await fixture();
  await assert.rejects(store.changeUser(admin, admin.uid, { role: 'student', status: 'active', operationId: randomUUID() }), { status: 409 });
  await store.changeUser(admin, faculty.uid, { role: 'admin', status: 'active', operationId: randomUUID() }); faculty.role = 'admin';
  const results = await Promise.allSettled([store.changeUser(admin, admin.uid, { role: 'student', status: 'active', operationId: randomUUID() }), store.changeUser(faculty, faculty.uid, { role: 'student', status: 'active', operationId: randomUUID() })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const remaining = (await store.profile(admin.uid)).role === 'admin' ? admin : faculty;
  await store.changeUser(remaining, student.uid, { role: 'student', status: 'disabled', operationId: randomUUID() });
  await assert.rejects(store.prepare(student, { operationId: randomUUID(), files: [] }), { status: 403 });
});
test('combined retained/new file limits and sharing failure cannot change saved submission', async () => {
  const { store, student, savedFiles, drive } = await fixture(), operationId = randomUUID();
  const upload = await store.prepare(student, { operationId, files: [{ name: 'a.pdf', size: 5000000 }, { name: 'b.pdf', size: 5000000 }] });
  for (const record of savedFiles.values()) record.complete = true;
  const receipt = await store.save(student, { ...input, operationId, uploadId: upload.uploadId }), item = await store.find(student, receipt.submissionId);
  await assert.rejects(store.prepare(student, { operationId: randomUUID(), submissionId: item.id, expectedVersion: 1, retainedIds: item.media.map(f => f.id), files: [{ name: 'extra.pdf', size: 1 }] }), { status: 400 });
  const editOp = randomUUID(), edit = await store.prepare(student, { operationId: editOp, submissionId: item.id, expectedVersion: 1, files: [] });
  const original = drive.publish; drive.publish = async () => { throw new AppError(502, 'Sharing denied'); };
  // Retain a file to exercise the sharing gate.
  const failOp = randomUUID(), fail = await store.prepare(student, { operationId: failOp, submissionId: item.id, expectedVersion: 1, retainedIds: [item.media[0].id], files: [] });
  await assert.rejects(store.save(student, { ...input, operationId: failOp, uploadId: fail.uploadId, expectedVersion: 1 }, item.id), { status: 502 }); assert.deepEqual(await store.find(student, item.id), item);
  drive.publish = original; await store.save(student, { ...input, operationId: editOp, uploadId: edit.uploadId, expectedVersion: 1 }, item.id);
  assert.equal((await store.ref('cleanup', item.media[0].id).get()).data().status, 'pending');
});
test('Firestore emulator: indexed query combinations, cursor pages and remarks', { skip: !emulator }, async () => {
  const { store, student, faculty, create } = await fixture();
  for (let i = 0; i < 7; i++) await create({ title: `Water ${i}` });
  const first = await store.list(faculty, new URLSearchParams('limit=3&sort=id')), second = await store.list(faculty, new URLSearchParams({ limit: '3', sort: 'id', cursor: first.nextCursor }));
  assert.equal(first.items.length, 3); assert.equal(second.items.length, 3); assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 6);
  await assert.rejects(store.list(student, new URLSearchParams({ limit: '3', sort: 'id', cursor: first.nextCursor })));
  for (const sort of ['newest', 'oldest', 'edited', 'id']) for (const searchBy of ['id', 'email', 'domain', 'name', 'title']) {
    const search = { id: first.items[0].displayId, email: student.email, domain: 'Education', name: 'Stud', title: 'Wat' }[searchBy];
    for (const profile of [student, faculty]) { const result = await store.list(profile, new URLSearchParams({ sort, searchBy, search, domain: 'Education', locked: 'false', remarked: 'false', from: '2026-01-01', to: '2030-01-01' })); assert(result.items.length > 0); }
  }
  await store.mutate(faculty, first.items[0].id, 'remarks', { operationId: randomUUID(), remark: 'Hello' });
  assert.equal((await store.remarks(student, first.items[0].id)).items[0].authorName, 'Faculty');
});
