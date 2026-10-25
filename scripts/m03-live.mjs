import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M03Store } from '../src/m03/store.mjs';
loadM03Env(); const config = m03Config();
if (config.checkpoint !== 'M03-B') throw new Error('Editing checks require M03-B.');
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) || 'http://localhost:3004';
if (!['http://localhost:3004', 'https://ppcp-m03-b-test.vercel.app'].includes(target) || !process.argv.includes('--write')) throw new Error('Explicit M03-B target and --write required.');
const accounts = JSON.parse(readFileSync('.local/m03-accounts.json', 'utf8')).accounts;
const owner = { ...accounts[0] }, other = { ...accounts[1] }, faculty = { ...accounts[60] };
const auth = firebaseAuth(config), store = new M03Store(config), results = [], runId = `m03-functional-${Date.now()}`;
async function call(account, path, data, headers = {}) {
  const response = await fetch(`${target}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { cookie: account?.cookie || '', origin: target, 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(65000) });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer());
  return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(account) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.web.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) });
  const identity = await response.json(); assert.equal(response.status, 200, 'Synthetic login');
  const session = await call(account, 'auth/session', { idToken: identity.idToken }); assert.equal(session.status, 200); account.cookie = session.cookie;
}
async function check(name, action) {
  const start = performance.now();
  try { await action(); results.push({ name, status: 'passed', ms: Math.round(performance.now() - start) }); console.log(`${name}: passed`); }
  catch (error) { results.push({ name, status: 'failed', ms: Math.round(performance.now() - start), error: error.code || error.name }); console.log(`${name}: failed (${error.code || error.name})`); throw error; }
}
async function upload(path, sizes) {
  const plan = await call(owner, path, { files: sizes.map((size, i) => ({ name: `${runId}-${i}.pdf`, size })) }); assert.equal(plan.status, 201);
  for (const file of plan.body.uploads) {
    const bytes = new Uint8Array(file.size); bytes.set(new TextEncoder().encode('%PDF-1.4\n').slice(0, file.size));
    const response = await fetch(file.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.mimeType }, body: bytes }); assert.equal(response.status, 200, 'Drive upload');
  }
  return plan.body;
}
let id, initial, originalFile, replacement, editPayload;
try {
  for (const account of [owner, other, faculty]) await login(account);
  await check('B01 authenticated create with 1 MB attachment', async () => {
    const plan = await upload('upload-sessions', [1000000]); id = plan.submissionId; originalFile = plan.uploads[0].id;
    const result = await call(owner, 'submissions', { title: runId, description: 'Synthetic original content', solution: 'Synthetic solution', domain: 'Education', ticket: plan.ticket, operationId: randomUUID() });
    assert.equal(result.status, 201); initial = result.body.item; assert.equal(initial.media.length, 1); assert.equal(initial.lastEdited, '');
  });
  await check('B02 staff remark and student ownership', async () => {
    assert.equal((await call(faculty, `submissions/${id}/remarks`, { remark: `${runId} faculty review` })).status, 201);
    assert.equal((await call(other, `submissions/${id}`)).status, 404);
    assert.equal((await call(other, `submissions/${id}/edit-uploads`, { files: [] })).status, 404);
    assert.equal((await call(owner, `submissions/${id}/remarks`, { remark: 'Unauthorized' })).status, 403);
  });
  await check('B03 edit after remark, replace file and preserve original identity/date', async () => {
    const plan = await upload(`submissions/${id}/edit-uploads`, [1234]); replacement = plan.uploads[0].id;
    editPayload = { title: `${runId} edited`, description: 'Updated synthetic content', solution: 'Updated solution', domain: 'Education', retainedFileIds: [], ticket: plan.ticket, expectedLastEdited: '', operationId: randomUUID() };
    const result = await call(owner, `submissions/${id}/edits`, editPayload); assert.equal(result.status, 200); const item = result.body.item;
    for (const field of ['id', 'ownerUid', 'email', 'name', 'studentId', 'program', 'timestamp']) assert.equal(item[field], initial[field]);
    assert.equal(item.media[0].fileId, replacement); assert.ok(Date.parse(item.lastEdited));
    const actual = await store.request(`https://www.googleapis.com/drive/v3/files/${originalFile}?fields=trashed`); assert.equal(actual.trashed, true);
  });
  await check('B04 duplicate retry and retained remarks', async () => {
    const repeat = await call(owner, `submissions/${id}/edits`, editPayload); assert.equal(repeat.status, 200); assert.equal(repeat.body.alreadySaved, true);
    const remarks = await call(owner, `submissions/${id}/remarks`); assert.equal(remarks.body.items.length, 1); assert.equal(remarks.body.items[0].remark, `${runId} faculty review`);
    assert.equal((await call(owner, `submissions/${id}/files/${originalFile}`)).status, 404);
    const download = await call(owner, `submissions/${id}/files/${replacement}`); assert.equal(download.status, 200); assert.equal(download.body.length, 1234);
  });
  console.log('Quota cooldown before conflict and session checks (65 seconds).'); await new Promise(resolve => setTimeout(resolve, 65000));
  await check('B05 competing edits reject the stale tab without overwriting', async () => {
    const current = (await call(owner, `submissions/${id}`)).body.item;
    const payload = { title: `${runId} winning tab`, description: current.description, solution: current.solution, domain: current.domain, retainedFileIds: [replacement], expectedLastEdited: current.lastEdited, operationId: randomUUID() };
    const winner = await call(owner, `submissions/${id}/edits`, payload); assert.equal(winner.status, 200);
    const stale = await call(owner, `submissions/${id}/edits`, { ...payload, title: 'Stale tab must not win', operationId: randomUUID() }); assert.equal(stale.status, 409);
    assert.equal((await call(owner, `submissions/${id}`)).body.item.title, payload.title);
  });
  await check('B06 replacement ticket cannot be reused by another student or record', async () => {
    assert.equal((await call(other, `submissions/${id}/edits`, editPayload)).status, 404);
    const second = await upload('upload-sessions', []);
    const saved = await call(owner, 'submissions', { title: `${runId} ticket isolation`, description: 'Synthetic', solution: '', domain: 'Education', ticket: second.ticket, operationId: randomUUID() }); assert.equal(saved.status, 201);
    assert.equal((await call(owner, `submissions/${second.submissionId}/edits`, { ...editPayload, operationId: randomUUID() })).status, 403);
  });
  await check('B07 real disabled Firebase account is denied', async () => {
    await auth.updateUser(other.uid, { disabled: true });
    try { assert.equal((await call(other, 'submissions')).status, 401); } finally { await auth.updateUser(other.uid, { disabled: false }); }
  });
  await check('B08 invalid and expired credentials denied', async () => {
    assert.equal((await call({ cookie: 'ppcp_m02=invalid.expired.session' }, 'submissions')).status, 401);
    assert.equal((await call(null, `submissions/${id}`)).status, 401);
  });
} catch { process.exitCode = 1; }
finally {
  mkdirSync('output/m03', { recursive: true });
  const report = { runId, target, checkpoint: config.checkpoint, results, submissionId: id, originalFile, replacement, complete: results.length === 8 && results.every(result => result.status === 'passed') };
  const path = `output/m03/${runId}.json`; writeFileSync(path, JSON.stringify(report, null, 2)); console.log(`Sanitized report: ${path}`);
}
