import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { M04Drive } from '../src/m04/drive.mjs';
export async function environment() {
  loadM04Env(); const config = m04Config(), { auth, db } = services(config);
  const origin = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) || config.origin, url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Use an exact HTTPS target or local origin.');
  const health = await fetch(`${origin}/api/health`); if (!health.ok || (await health.json()).milestone !== 'M04') throw new Error('Target is not an M04 deployment.');
  return { config, auth, db, origin, store: new M04Store(config, db, new M04Drive(config)) };
}
export async function accountPool(context, count, staff = false) {
  if (!process.argv.includes('--write')) throw new Error('Creating synthetic M04 accounts requires --write.');
  const { auth, db, config } = context, path = '.local/m04-accounts.json'; mkdirSync('.local', { recursive: true });
  const pool = existsSync(path) ? JSON.parse(readFileSync(path)) : { projectId: config.projectId, prefix: `m04-poc-${randomUUID().slice(0, 8)}`, students: [] };
  if (pool.projectId !== config.projectId) throw new Error('Synthetic account pool belongs to another project.');
  const persist = () => writeFileSync(path, JSON.stringify(pool, null, 2), { mode: 0o600 });
  async function create(label, role, domain) {
    const account = { uid: `${pool.prefix}-${label}`, email: `${pool.prefix}-${label}@${domain}`, password: `M04!${randomUUID()}`, role };
    // Persist before the external create, so interrupted runs can reconcile.
    pool.pending = account; persist();
    await provision(account); delete pool.pending; return account;
  }
  async function provision(account) {
    let user; try { user = await auth.getUser(account.uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; user = await auth.createUser({ uid: account.uid, email: account.email, password: account.password, emailVerified: true }); }
    if (user.email !== account.email) throw new Error('Synthetic account ownership mismatch.');
    const ref = db.collection('users').doc(account.uid);
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return;
      const controlRef = db.collection('counters').doc('access'), control = (await tx.get(controlRef)).data() || { admins: 0, bootstrapped: false };
      tx.create(ref, { uid: account.uid, email: account.email, name: `Synthetic ${account.role} ${account.uid}`, studentId: account.uid, program: 'M04 synthetic', role: account.role, status: 'active', createdAt: new Date().toISOString() });
      if (account.role === 'admin') tx.set(controlRef, { ...control, admins: control.admins + 1 });
    });
  }
  if (pool.pending) { const account = pool.pending; await provision(account); if (account.role === 'student') pool.students.push(account); else pool[account.role] = account; delete pool.pending; persist(); }
  while (pool.students.length < count) { pool.students.push(await create(`s${pool.students.length + 1}`, 'student', pool.students.length % 2 ? 'welingkarmail.org' : 'welingkar.org')); persist(); }
  if (staff) for (const role of ['faculty', 'admin']) if (!pool[role]) { pool[role] = await create(role, role, 'welingkarmail.org'); persist(); }
  return pool;
}
export async function client(context, account, samples = []) {
  const { config, origin } = context;
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.web.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }), signal: AbortSignal.timeout(30000) });
  if (!signIn.ok) throw new Error(`Synthetic Firebase sign-in failed (${signIn.status}).`);
  const { idToken } = await signIn.json(); let cookie = '';
  const api = async (path, data, expected) => {
    const started = performance.now(); let response;
    try { response = await fetch(`${origin}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: cookie, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(65000), redirect: 'error' }); }
    catch { samples.push({ path: path.split('?')[0], ms: performance.now() - started, status: 'network-error' }); throw new Error('API response interrupted; rerun with the same operation ID.'); }
    samples.push({ path: path.split('?')[0], method: data === undefined ? 'GET' : 'POST', ms: performance.now() - started, status: response.status });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    let value; try { value = await response.json(); } catch { throw new Error('API returned a non-JSON response.'); }
    if (expected ? response.status !== expected : !response.ok) throw new Error(`API ${path.split('?')[0]} returned ${response.status}; expected ${expected || 'success'}.`);
    return value;
  };
  await api('auth/session', { idToken }); return { api, uid: account.uid };
}
export async function uploadSave(actor, values, attachments, current = null, samples = []) {
  const operationId = randomUUID(), prepared = await actor.api('upload-sessions', { operationId, files: attachments.map(file => ({ name: file.name, size: file.size })), ...(current ? { submissionId: current.id, expectedVersion: current.version, retainedIds: [] } : {}) });
  for (const file of prepared.uploads) {
    const start = performance.now(), bytes = Buffer.alloc(file.size, 32); bytes.write('%PDF-1.4\n');
    const response = await fetch(file.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.mimeType }, body: bytes, signal: AbortSignal.timeout(120000) });
    samples.push({ path: 'drive-transfer', ms: performance.now() - start, status: response.status, bytes: file.size }); if (!response.ok) throw new Error(`Drive transfer failed (${response.status}).`);
  }
  const data = { ...values, operationId, uploadId: prepared.uploadId, ...(current ? { expectedVersion: current.version } : {}) }, path = current ? `submissions/${current.id}/edits` : 'submissions';
  return { receipt: await actor.api(path, data), path, data };
}
export function writeReport(kind, report) {
  mkdirSync('output/m04', { recursive: true }); const path = `output/m04/${kind}-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), node: process.version, ...report }, null, 2)); console.log(`Sanitized report: ${path}`);
}
