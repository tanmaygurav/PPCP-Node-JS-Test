import { randomUUID } from 'node:crypto';
import { AppError, canRead, digest, displayId, facets, files, identifier, institutional, normalize, requireRole, submission, text, version } from './domain.mjs';
import { sign, verify } from '../security.mjs';
import { listSpec } from './query.mjs';
import { testGate, testPrefix, TestRuns } from './test-runs.mjs';
import { span, count } from './telemetry.mjs';
import { DEFAULT_THEME, isEventTheme } from '../../shared/m04-themes.mjs';

export class M04Store {
  constructor(config, db, drive) { this.config = config; this.db = db; this.drive = drive; this.tests = new TestRuns(this); }
  async transaction(work) { return span("transaction", () => this.db.runTransaction(tx => { count("storeTransactionAttempts"); return work(tx); })); }
  ref(collection, id) { return this.db.collection(collection).doc(identifier(id)); }
  async profile(uid) { return (await this.ref('users', uid).get()).data() || null; }
  async register(identity, data) {
    if (!institutional(identity.email)) throw new AppError(403, 'Institutional account required.');
    const fields = { name: text(data.name, 'Name'), program: text(data.program, 'Program'), studentId: text(data.studentId, 'Student ID') };
    return this.transaction(async tx => {
      const userRef = this.ref('users', identity.uid), existing = (await tx.get(userRef)).data();
      if (existing) { if (existing.status !== 'active' || existing.email !== identity.email) throw new AppError(403, 'Account is disabled or email changed.'); return existing; }
      const controlRef = this.ref('counters', 'access'), control = (await tx.get(controlRef)).data() || { admins: 0, bootstrapped: false };
      const bootstrap = !control.bootstrapped && this.config.bootstrapUids.includes(identity.uid);
      const profile = { ...identity, ...fields, role: bootstrap ? 'admin' : 'student', status: 'active', createdAt: new Date().toISOString() };
      tx.create(userRef, profile);
      if (bootstrap) tx.set(controlRef, { admins: control.admins + 1, bootstrapped: true });
      return profile;
    });
  }
  async current(tx, profile, roles) {
    const actual = (await tx.get(this.ref('users', profile.uid))).data();
    if (!actual || actual.email !== profile.email) throw new AppError(403, 'Account not available.');
    requireRole(actual, roles); return actual;
  }
  async domains() { return (await this.db.collection('domains').where('active', '==', true).orderBy('name').limit(100).get()).docs.map(doc => doc.data().name); }
  async appearance() {
    const saved = (await this.ref('settings', 'appearance').get()).data();
    return { theme: isEventTheme(saved?.theme) ? saved.theme : DEFAULT_THEME, version: Number.isSafeInteger(saved?.version) && saved.version >= 0 ? saved.version : 0, updatedAt: typeof saved?.updatedAt === 'string' ? saved.updatedAt : null };
  }
  async changeAppearance(profile, data) {
    requireRole(profile, ['admin']);
    if (!isEventTheme(data.theme)) throw new AppError(400, 'Choose one of the available event themes.');
    if (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0) throw new AppError(400, 'Reload the saved theme before applying a change.');
    const opRef = this.receiptRef(profile.uid, data.operationId), hash = digest({ kind: 'appearance', theme: data.theme, expectedVersion: data.expectedVersion });
    return this.transaction(async tx => {
      await this.current(tx, profile, ['admin']);
      const prior = (await tx.get(opRef)).data();
      if (prior) { if (prior.digest !== hash) throw new AppError(409, 'Operation content changed.'); return prior; }
      const ref = this.ref('settings', 'appearance'), saved = (await tx.get(ref)).data(), currentVersion = saved?.version || 0;
      if (currentVersion !== data.expectedVersion) throw new AppError(409, 'The event theme changed. Reload the saved theme before applying.');
      const now = new Date().toISOString(), nextVersion = currentVersion + 1;
      tx.set(ref, { theme: data.theme, version: nextVersion, updatedAt: now });
      const receipt = { status: 'committed', kind: 'appearance', version: nextVersion, digest: hash, committedAt: now };
      tx.create(opRef, receipt); return receipt;
    });
  }
  async find(profile, id) { const item = (await this.ref('submissions', id).get()).data(); if (!canRead(profile, item)) throw new AppError(404, 'Submission not found.'); return item; }
  receiptRef(uid, op) { return this.ref('operations', digest([uid, identifier(op, 'operation ID')])); }
  async receipt(profile, op) { const value = (await this.receiptRef(profile.uid, op).get()).data(); return value || { status: 'not-observed' }; }
  async replay(profile, op, hash) { const receipt = (await this.receiptRef(profile.uid, op).get()).data(); if (receipt && receipt.digest !== hash) throw new AppError(409, 'Operation ID already used for different content.'); return receipt || null; }
  async prepare(profile, data) {
    requireRole(profile, ['student']);
    const operationId = identifier(data.operationId), testRunId = await this.transaction(tx => testGate(this, tx, profile)), incoming = files(files(data.files || []).map(file => testRunId ? { ...file, name: `${testPrefix(testRunId)} ${file.name}` } : file)), retainedIds = data.retainedIds || [];
    if (!Array.isArray(retainedIds) || retainedIds.some(id => typeof id !== 'string')) throw new AppError(400, 'Invalid retained files.');
    let item = null;
    if (data.submissionId) { item = await this.find(profile, data.submissionId); if (item.locked || item.version !== version(data.expectedVersion)) throw new AppError(409, 'Submission is locked or changed.'); }
    if (item) await this.transaction(tx => testGate(this, tx, profile, item));
    if (!item && retainedIds.length) throw new AppError(400, 'New submissions cannot retain attachments.');
    const retained = item ? item.media.filter(file => retainedIds.includes(file.id)) : [];
    if (new Set(retainedIds).size !== retainedIds.length || retained.length !== retainedIds.length) throw new AppError(400, 'Invalid retained attachments.');
    files([...retained, ...incoming]);
    const ref = this.ref('uploads', digest([profile.uid, operationId])), hash = digest({ incoming, retainedIds, submissionId: item?.id || null, expectedVersion: item?.version || null });
    let upload = (await ref.get()).data();
    if (upload && upload.digest !== hash) throw new AppError(409, 'Upload operation changed. Start a new operation.');
    if (!upload) {
      const ids = await span('drive-reserve', () => this.drive.reserve(incoming)), proposed = { ...(testRunId ? { testRunId } : {}), id: ref.id, ownerUid: profile.uid, operationId, submissionId: item?.id || randomUUID(), expectedVersion: item?.version || null, fileCount: incoming.length, totalBytes: incoming.reduce((sum,file)=>sum+file.size,0), files: incoming.map((f, i) => ({ ...f, id: ids[i] })), retainedIds, digest: hash, status: 'pending', expiresAt: Date.now() + 3600000, createdAt: new Date().toISOString() };
      upload = await this.db.runTransaction(async tx => { const found = (await tx.get(ref)).data(); if (found) { if (found.digest !== hash) throw new AppError(409, 'Upload operation changed.'); return found; } await this.current(tx, profile, ['student']); const liveRun = await testGate(this, tx, profile, item); if (liveRun !== testRunId) throw new AppError(409, 'Test run changed.'); tx.create(ref, proposed); return proposed; });
    }
    if (upload.status !== 'pending' || upload.expiresAt < Date.now()) throw new AppError(409, 'Upload expired or already consumed.');
    const sessions = [];
    for (const file of upload.files) {
      try { await span('drive-verify', () => this.drive.verify(file, profile.uid, upload.submissionId, upload.id)); sessions.push({ ...file, completed: true }); }
      catch (error) { if (error.status !== 404) throw error; sessions.push(await span('drive-session', () => this.drive.start(upload, file))); }
    }
    return { uploadId: upload.id, submissionId: upload.submissionId, uploads: sessions };
  }
  async save(profile, data, id = null) {
    requireRole(profile, ['student']);
    const operationUpload = (await this.ref('uploads', identifier(data.uploadId)).get()).data();
    await this.transaction(tx => testGate(this, tx, profile, operationUpload));
    const op = identifier(data.operationId), hash = digest({ action: 'save', id, data }), prior = await this.replay(profile, op, hash);
    if (prior) return prior;
    const uploadRef = this.ref('uploads', data.uploadId), upload = (await uploadRef.get()).data();
    if (!upload || upload.ownerUid !== profile.uid || upload.operationId !== op || (id && upload.submissionId !== id) || (!id && upload.expectedVersion !== null) || upload.status !== 'pending' || upload.expiresAt < Date.now()) throw new AppError(409, 'Upload operation is unavailable.');
    const current = id ? await this.find(profile, id) : null;
    if (current && (current.locked || current.version !== version(data.expectedVersion) || upload.expectedVersion !== current.version)) throw new AppError(409, 'Submission is locked or changed. Keep your draft.');
    if(upload.testRunId)text(data.title,'Title',300);
    const validated = submission(upload.testRunId ? { ...data, title: data.title.startsWith(testPrefix(upload.testRunId)) ? data.title : `${testPrefix(upload.testRunId)} ${data.title}` } : data, profile), domainId = digest(normalize(validated.domain)), domainRef = this.ref('domains', domainId);
    const retained = current ? current.media.filter(file => upload.retainedIds.includes(file.id)) : [];
    if (retained.length !== upload.retainedIds.length) throw new AppError(409, 'Saved attachments changed.');
    files([...retained, ...upload.files]);
    const media = [];
    for (const file of retained) media.push(await span('drive-publish', () => this.drive.publish(file, profile.uid, upload.submissionId)));
    for (const file of upload.files) media.push(await span('drive-publish', () => this.drive.publish(file, profile.uid, upload.submissionId, upload.id)));
    const itemRef = this.ref('submissions', upload.submissionId), opRef = this.receiptRef(profile.uid, op), counterRef = this.ref('counters', 'submissions');
    return this.transaction(async tx => {
      await this.current(tx, profile, ['student']);
      const checkedRun = await testGate(this, tx, profile, upload); if (checkedRun !== (upload.testRunId || null)) throw new AppError(409, 'Test run changed.');
      const existingReceipt = (await tx.get(opRef)).data();
      if (existingReceipt) { if (existingReceipt.digest !== hash) throw new AppError(409, 'Operation content changed.'); return existingReceipt; }
      const saved = (await tx.get(itemRef)).data(), freshUpload = (await tx.get(uploadRef)).data(), domain = (await tx.get(domainRef)).data();
      const counter = !id ? (await tx.get(counterRef)).data() : null;
      if (!domain?.active) throw new AppError(400, 'Choose an active domain.');
      if (!freshUpload || freshUpload.status !== 'pending' || freshUpload.expiresAt < Date.now()) throw new AppError(409, 'Upload operation expired or consumed.');
      if (id ? !saved || saved.ownerUid !== profile.uid || saved.locked || saved.version !== data.expectedVersion : !!saved) throw new AppError(409, 'Submission changed or is locked. Keep your draft.');
      const now = new Date().toISOString(), sequence = saved?.sequence || (counter?.value || 0) + 1;
      const item = { ...validated, ...(upload.testRunId ? { testRunId: upload.testRunId, isTestData: true } : {}), mediaIds: media.map(file => file.id), id: itemRef.id, ownerUid: profile.uid, sequence, displayId: displayId(sequence), media, createdAt: saved?.createdAt || now, lastEditedAt: now, version: (saved?.version || 0) + 1, locked: saved?.locked || false, lockedAt: saved?.lockedAt || null, hasRemarks: saved?.hasRemarks || false };
      item.facets = facets(item);
      const receipt = { status: 'committed', kind: 'save', submissionId: item.id, displayId: item.displayId, version: item.version, digest: hash, committedAt: now };
      tx.set(itemRef, item); tx.create(opRef, receipt); tx.update(uploadRef, { status: 'consumed' });
      if (!id) tx.set(counterRef, { value: sequence });
      for (const file of saved?.media || []) if (!media.some(f => f.id === file.id)) tx.set(this.ref('cleanup', file.id), { fileId: file.id, submissionId: item.id, ownerUid: profile.uid, status: 'pending', createdAt: now });
      return receipt;
    });
  }
  async mutate(profile, id, action, data) {
    const op = identifier(data.operationId), hash = digest({ id, action, data }), itemRef = this.ref('submissions', id), opRef = this.receiptRef(profile.uid, op);
    const remarkRef = this.db.collection('remarks').doc();
    const expected = action === 'remarks' ? null : version(data.expectedVersion), remark = action === 'remarks' ? text(data.remark, 'Remark', 5000) : null;
    return this.transaction(async tx => {
      const actual = await this.current(tx, profile, action === 'remarks' || action === 'unlock' ? ['faculty', 'admin'] : ['student', 'faculty', 'admin']);
      const receipt = (await tx.get(opRef)).data(); if (receipt) { if (receipt.digest !== hash) throw new AppError(409, 'Operation content changed.'); return receipt; }
      const item = (await tx.get(itemRef)).data(); await testGate(this, tx, profile, item); if (!canRead(actual, item)) throw new AppError(404, 'Submission not found.');
      const now = new Date().toISOString();
      if (action === 'remarks') {
        tx.create(remarkRef, { ...(item.testRunId ? { testRunId: item.testRunId } : {}), id: remarkRef.id, submissionId: id, displayId: item.displayId, authorUid: actual.uid, authorName: actual.name, remark, createdAt: now });
        tx.update(itemRef, { hasRemarks: true, facets: facets({ ...item, hasRemarks: true }) });
      } else {
        if (item.version !== expected) throw new AppError(409, 'Submission changed. Reload before changing its lock.');
        tx.update(itemRef, { locked: action === 'lock', lockedAt: action === 'lock' ? now : null, version: item.version + 1, facets: facets({ ...item, locked: action === 'lock' }) });
      }
      const result = { status: 'committed', kind: action, submissionId: id, displayId: item.displayId, version: item.version + (action === 'remarks' ? 0 : 1), committedAt: now, digest: hash };
      tx.create(opRef, result); return result;
    });
  }
  async remarks(profile, id, params = new URLSearchParams()) {
    await this.find(profile, id);
    let query = this.db.collection('remarks').where('submissionId', '==', id).orderBy('createdAt', 'asc').orderBy('__name__', 'asc');
    if (params.get('cursor')) { const c = verify(this.config.secret, params.get('cursor'), 'm04-remarks'); if (c.id !== id || c.uid !== profile.uid) throw new AppError(400, 'Invalid remarks cursor.'); query = query.startAfter(c.time, c.doc); }
    const docs = (await query.limit(51).get()).docs, page = docs.slice(0, 50), last = page.at(-1);
    return { items: page.map(d => d.data()), nextCursor: docs.length > 50 ? sign(this.config.secret, { kind: 'm04-remarks', id, uid: profile.uid, time: last.data().createdAt, doc: last.id, exp: Date.now() + 3600000 }) : null };
  }
  async list(profile, params) {
    const spec = listSpec(params, profile); let query = this.db.collection('submissions');
    for (const filter of spec.filters) query = query.where(...filter);
    for (const [field, direction] of spec.order) query = query.orderBy(field, direction);
    if (params.get('cursor')) { const cursor = verify(this.config.secret, params.get('cursor'), 'm04-page'); if (cursor.fingerprint !== spec.fingerprint || !Array.isArray(cursor.values) || cursor.values.length !== spec.order.length) throw new AppError(400, 'Cursor does not match this query.'); query = query.startAfter(...cursor.values); }
    const docs = (await query.limit(spec.limit + 1).get()).docs, page = docs.slice(0, spec.limit), last = page.at(-1);
    const items = page.map(doc => { const { description, solution, media, ...summary } = doc.data(); return { ...summary, attachmentCount: media.length }; });
    return { items, orderLabel: spec.orderLabel, nextCursor: docs.length > spec.limit ? sign(this.config.secret, { kind: 'm04-page', fingerprint: spec.fingerprint, values: spec.order.map(([field]) => field === '__name__' ? last.id : last.data()[field]), exp: Date.now() + 3600000 }) : null };
  }
  async changeUser(profile, target, data) {
    requireRole(profile, ['admin']); identifier(target);
    if (!['student', 'faculty', 'admin'].includes(data.role) || !['active', 'disabled'].includes(data.status)) throw new AppError(400, 'Invalid role or account status.');
    const opRef = this.receiptRef(profile.uid, data.operationId), hash = digest({ target, role: data.role, status: data.status });
    return this.transaction(async tx => {
      await this.current(tx, profile, ['admin']);
      const prior = (await tx.get(opRef)).data(); if (prior) { if (prior.digest !== hash) throw new AppError(409, 'Operation content changed.'); return prior; }
      const ref = this.ref('users', target), user = (await tx.get(ref)).data(), counterRef = this.ref('counters', 'access'), control = (await tx.get(counterRef)).data();
      if (!user || !institutional(user.email)) throw new AppError(404, 'Verified institutional profile not found.');
      const wasAdmin = user.role === 'admin' && user.status === 'active', isAdmin = data.role === 'admin' && data.status === 'active';
      const admins = (control?.admins || 0) + Number(isAdmin) - Number(wasAdmin);
      if (admins < 1) throw new AppError(409, 'Keep at least one active administrator.');
      tx.update(ref, { role: data.role, status: data.status }); tx.set(counterRef, { ...control, admins });
      const receipt = { status: 'committed', kind: 'user-access', targetUid: target, digest: hash, committedAt: new Date().toISOString() }; tx.create(opRef, receipt); return receipt;
    });
  }
  async cleanup(apply = false) {
    const jobs = (await this.db.collection('cleanup').where('status', '==', 'pending').limit(20).get()).docs, results = [];
    for (const doc of jobs) {
      const job = doc.data(), item = (await this.ref('submissions', job.submissionId).get()).data();
      if (item?.media.some(file => file.id === job.fileId)) { results.push({ fileId: job.fileId, status: 'still-referenced' }); continue; }
      try {
        const actual = await this.drive.metadata(job.fileId);
        if (!actual.parents?.includes(this.config.folderId) || actual.appProperties?.prototype !== 'ppcp-m04' || actual.appProperties?.ownerUid !== job.ownerUid || actual.appProperties?.submissionId !== job.submissionId) throw new AppError(409, 'Cleanup ownership mismatch.');
        if (apply) { if (!actual.trashed) await this.drive.trash(job.fileId); await doc.ref.update({ status: 'done' }); }
        results.push({ fileId: job.fileId, status: apply ? 'trashed' : 'eligible' });
      } catch (error) { results.push({ fileId: job.fileId, status: 'retry-required', code: error.status || 502 }); }
    }
    return results;
  }
  async abandoned(apply = false) {
    const docs = (await this.db.collection('uploads').where('status', '==', 'pending').where('expiresAt', '<', Date.now()).orderBy('expiresAt').limit(20).get()).docs;
    for (const doc of docs) if (apply) await this.db.runTransaction(async tx => {
      const upload = (await tx.get(doc.ref)).data();
      if (upload.status !== 'pending' || upload.expiresAt >= Date.now()) return;
      tx.update(doc.ref, { status: 'abandoned' });
      for (const file of upload.files) tx.set(this.ref('cleanup', file.id), { fileId: file.id, submissionId: upload.submissionId, ownerUid: upload.ownerUid, status: 'pending', createdAt: new Date().toISOString() });
    });
    return docs.map(doc => ({ uploadId: doc.id, files: doc.data().files.map(file => file.id), status: apply ? 'cleanup-queued' : 'expired' }));
  }
}
