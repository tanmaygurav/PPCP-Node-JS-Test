import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { M03Store } from '../src/m03/store.mjs';
loadM03Env(); const config = m03Config(), target = 'https://ppcp-m03-b-test.vercel.app';
if (config.checkpoint !== 'M03-B' || !process.argv.includes('--write')) throw new Error('M03-B and --write required.');
const account = JSON.parse(readFileSync('.local/m03-accounts.json', 'utf8')).accounts[3]; let cookie;
async function call(path, payload) {
  const response = await fetch(`${target}/api/${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { cookie: cookie || '', origin: target, 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(65000) });
  const result = await response.json(); assert.ok(response.ok, `API HTTP ${response.status}`); return { result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function loseResponse(path, payload) {
  let upstreamStatus;
  const proxy = createServer(async (req, res) => {
    try {
      const response = await fetch(`${target}/api/${path}`, { method: 'POST', headers: { cookie, origin: target, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(65000) });
      await response.arrayBuffer(); upstreamStatus = response.status;
    } finally { res.destroy(); }
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  try {
    await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}`, { method: 'POST', body: 'synthetic trigger', signal: AbortSignal.timeout(70000) }));
    assert.ok([200, 201].includes(upstreamStatus), 'The upstream save must succeed before its response is dropped.');
  } finally { await new Promise(resolve => { proxy.closeAllConnections(); proxy.close(resolve); }); }
}
const results = [], runId = `m03-faults-${Date.now()}`; let id;
try {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.web.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }) });
  assert.equal(response.status, 200); cookie = (await call('auth/session', { idToken: (await response.json()).idToken })).cookie;
  const plan = (await call('upload-sessions', { files: [] })).result; id = plan.submissionId;
  const create = { title: runId, domain: 'Education', description: 'Synthetic lost HTTP response', solution: '', ticket: plan.ticket, operationId: randomUUID() };
  await loseResponse('submissions', create);
  const repeated = (await call('submissions', create)).result; assert.equal(repeated.alreadySaved, true);
  results.push({ name: 'H01 actual lost create response returns one saved record on retry', status: 'passed' });
  const edit = { title: `${runId} edited`, domain: 'Education', description: create.description, solution: '', retainedFileIds: [], expectedLastEdited: '', operationId: randomUUID() };
  await loseResponse(`submissions/${id}/edits`, edit);
  const before = (await call(`submissions/${id}`)).result.item;
  const retry = (await call(`submissions/${id}/edits`, edit)).result; assert.equal(retry.alreadySaved, true); assert.equal(retry.item.lastEdited, before.lastEdited);
  const records = (await new M03Store(config).list()).filter(item => item.id === id);
  assert.equal(records.length, 1); assert.equal(records[0].lastSaveOperation, edit.operationId);
  results.push({ name: 'H02 actual lost edit response preserves the same timestamp and operation marker', status: 'passed' });
} catch (error) { results.push({ name: 'HTTP fault verification', status: 'failed', error: error.name }); process.exitCode = 1; }
finally { mkdirSync('output/m03', { recursive: true }); const path = `output/m03/${runId}.json`; writeFileSync(path, JSON.stringify({ runId, target, submissionId: id, results }, null, 2)); console.log(JSON.stringify({ path, results })); }
