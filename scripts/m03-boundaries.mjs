import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
loadM03Env(); const config = m03Config();
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) || 'https://ppcp-m03-b-test.vercel.app';
if (config.checkpoint !== 'M03-B' || !['http://localhost:3004', 'https://ppcp-m03-b-test.vercel.app'].includes(target) || !process.argv.includes('--write')) throw new Error('Explicit M03-B target and --write required.');
const account = JSON.parse(readFileSync('.local/m03-accounts.json', 'utf8')).accounts[2]; let cookie = '';
async function call(path, data) {
  const response = await fetch(`${target}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { cookie, origin: target, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(65000) });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer());
  return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.web.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) });
assert.equal(signIn.status, 200); const identity = await signIn.json(); const session = await call('auth/session', { idToken: identity.idToken }); assert.equal(session.status, 200); cookie = session.cookie;
const runId = `m03-boundaries-${Date.now()}`, results = [];
async function check(name, action) { try { await action(); results.push({ name, status: 'passed' }); console.log(`${name}: passed`); } catch (error) { results.push({ name, status: 'failed', error: error.code || error.name }); console.log(`${name}: failed (${error.code || error.name})`); throw error; } }
async function plan(sizes, path = 'upload-sessions') { const result = await call(path, { files: sizes.map((size, i) => ({ name: `${runId}-${i}.pdf`, size })) }); assert.equal(result.status, 201); return result.body; }
async function transfer(file, bytes = file.size) { const body = new Uint8Array(bytes); body.set(new TextEncoder().encode('%PDF-1.4\n').slice(0, bytes)); const response = await fetch(file.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.mimeType }, body, signal: AbortSignal.timeout(120000) }); assert.equal(response.status, 200); }
let id, files, item;
try {
  await check('F01 metadata rejects 5 MB plus one byte and 11 files', async () => {
    assert.equal((await call('upload-sessions', { files: [{ name: 'too-big.pdf', size: 5000001 }] })).status, 400);
    assert.equal((await call('upload-sessions', { files: Array.from({ length: 11 }, (_, i) => ({ name: `file${i}.pdf`, size: 1 })) })).status, 400);
  });
  await check('F02 actual 20 MB attachment set is accepted', async () => {
    const upload = await plan([5000000, 5000000, 5000000, 5000000]); id = upload.submissionId; files = upload.uploads;
    for (const file of files) await transfer(file);
    const result = await call('submissions', { title: runId, description: 'Synthetic actual size boundary', solution: '', domain: 'Education', ticket: upload.ticket, operationId: randomUUID() });
    assert.equal(result.status, 201); item = result.body.item; assert.equal(item.media.reduce((n, file) => n + file.size, 0), 20000000);
  });
  await check('F03 actual 5 MB private file streams through Vercel', async () => {
    const download = await call(`submissions/${id}/files/${files[0].id}`); assert.equal(download.status, 200); assert.equal(download.body.length, 5000000);
  });
  console.log('Quota cooldown before replacement boundaries (65 seconds).'); await new Promise(resolve => setTimeout(resolve, 65000));
  await check('F04 retained plus new file above total limit is rejected without changing saved content', async () => {
    const upload = await plan([1], `submissions/${id}/edit-uploads`); await transfer(upload.uploads[0]);
    const payload = { title: `${runId} must not save`, description: item.description, solution: '', domain: 'Education', retainedFileIds: files.map(file => file.id), ticket: upload.ticket, expectedLastEdited: '', operationId: randomUUID() };
    assert.equal((await call(`submissions/${id}/edits`, payload)).status, 400);
    const current = (await call(`submissions/${id}`)).body.item; assert.equal(current.title, runId); assert.equal(current.lastEdited, ''); assert.equal(current.media.length, 4);
  });
  await check('F05 incomplete replacement upload cannot change existing content', async () => {
    const upload = await plan([1000000], `submissions/${id}/edit-uploads`);
    // A resumable partial transfer creates no complete Drive attachment.
    const bytes = new Uint8Array(262144);
    const response = await fetch(upload.uploads[0].uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'Content-Range': 'bytes 0-262143/1000000' }, body: bytes });
    assert.equal(response.status, 308);
    const result = await call(`submissions/${id}/edits`, { title: 'Interrupted upload must not save', description: item.description, solution: '', domain: 'Education', retainedFileIds: [], ticket: upload.ticket, expectedLastEdited: '', operationId: randomUUID() });
    assert.ok([404, 409].includes(result.status)); assert.equal((await call(`submissions/${id}`)).body.item.title, runId);
  });
  await check('F06 actual 10-file resulting set is accepted after removal', async () => {
    const upload = await plan(Array(10).fill(1), `submissions/${id}/edit-uploads`);
    for (const file of upload.uploads) await transfer(file);
    const result = await call(`submissions/${id}/edits`, { title: `${runId} ten files`, description: item.description, solution: '', domain: 'Education', retainedFileIds: [], ticket: upload.ticket, expectedLastEdited: '', operationId: randomUUID() });
    assert.equal(result.status, 200); assert.equal(result.body.item.media.length, 10); assert.ok(result.body.item.lastEdited);
  });
} catch { process.exitCode = 1; }
finally { mkdirSync('output/m03', { recursive: true }); const path = `output/m03/${runId}.json`; writeFileSync(path, JSON.stringify({ runId, target, results, submissionId: id, complete: results.length === 6 && results.every(result => result.status === 'passed') }, null, 2)); console.log(`Sanitized report: ${path}`); }
