import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHandler } from '../src/app.mjs';
import { AppError } from '../src/domain.mjs';

async function fixture(t) {
  const config = { origin: 'http://localhost', secret: 'secret-test-'.repeat(5) };
  const records = [], remarks = [];
  const store = {
    checks: async () => ({ folder: 'Media' }), activeDomains: async () => ['Education'],
    list: async () => records, find: async id => records.find(record => record.id === id),
    createUploads: async (id, files) => files.map((file, i) => ({ ...file, id: `file-${i}`, uploadUrl: 'https://www.googleapis.com/upload/test' })),
    verifyUploads: async (id, files) => files,
    appendSubmission: async (id, data, media) => { const item = { id, ...data, media }; records.push(item); return item; },
    remarks: async () => remarks,
    appendRemark: async (id, givenBy, remark) => { const item = { submissionId: id, givenBy, remark }; remarks.push(item); return item; }
  };
  const server = createServer(createHandler(config, store)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  config.origin = `http://127.0.0.1:${server.address().port}`;
  let savedCookie = '';
  const call = async (path, body, extra = {}) => {
    const response = await fetch(config.origin + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { origin: config.origin, cookie: savedCookie,
        'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.headers.get('set-cookie')) savedCookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  };
  const login = () => call('/api/session', { accessKey: config.secret });
  return { call, login, store, records, remarks, config };
}
const data = { email: 'test@example.com', name: 'Test', studentId: '01', program: 'Test program',
  domain: 'Education', title: 'A test problem', description: '=literal text', solution: '' };

test('API requires an access key and blocks cross-origin mutations', async t => {
  const { call, login } = await fixture(t);
  assert.equal((await call('/api/health')).status, 200);
  assert.equal((await call('/api/submissions')).status, 401);
  assert.equal((await call('/api/session', { accessKey: 'wrong' })).status, 401);
  assert.equal((await login()).status, 200);
  assert.equal((await call('/api/upload-sessions', { files: [] }, { origin: 'https://elsewhere.example' })).status, 403);
});
test('upload plan -> submission -> detail -> remark -> repeat save reuses same ID', async t => {
  const { call, login, records, remarks } = await fixture(t); await login();
  const plan = await call('/api/upload-sessions', { files: [{ name: 'test.pdf', size: 20 }] });
  assert.equal(plan.status, 201);
  const body = { ...data, ticket: plan.body.ticket };
  const saved = await call('/api/submissions', body); assert.equal(saved.status, 201);
  assert.equal((await call('/api/submissions', body)).body.alreadySaved, true); assert.equal(records.length, 1);
  const id = saved.body.item.id;
  assert.equal((await call(`/api/submissions/${id}`)).body.item.description, '=literal text');
  const list = await call('/api/submissions'); assert.equal(list.body.items[0].description, undefined);
  assert.equal((await call(`/api/submissions/${id}/remarks`, { remark: 'Feedback', givenBy: 'Forged author' })).status, 201);
  assert.equal(remarks[0].givenBy, 'Prototype operator');
  assert.equal((await call(`/api/submissions/${id}/remarks`)).body.items.length, 1);
});
test('attachment verification failure does not write a Sheet row', async t => {
  const { call, login, store, records } = await fixture(t); await login();
  store.verifyUploads = async () => { throw new AppError(409, 'Wrong folder or size'); };
  const { body } = await call('/api/upload-sessions', { files: [{ name: 'x.pdf', size: 10 }] });
  assert.equal((await call('/api/submissions', { ...data, ticket: body.ticket })).status, 409);
  assert.equal(records.length, 0);
});
test('domain, JSON shape, file limits, and ticket validation run on server', async t => {
  const { call, login } = await fixture(t); await login();
  assert.equal((await call('/api/upload-sessions', { files: [{ name: 'a.exe', size: 1 }] })).status, 400);
  assert.equal((await call('/api/upload-sessions', null)).status, 400);
  const { body } = await call('/api/upload-sessions', { files: [] });
  assert.equal((await call('/api/submissions', { ...data, domain: 'Unknown', ticket: body.ticket })).status, 400);
  assert.equal((await call('/api/submissions', { ...data, ticket: body.ticket + 'tampered' })).status, 401);
});
test('Vercel rewrite query and logout use the same handler', async t => {
  const { call, login } = await fixture(t); await login();
  assert.equal((await call('/api/index?route=submissions&limit=1')).status, 200);
  assert.equal((await call('/api/logout', {})).status, 200);
  assert.equal((await call('/api/checks')).status, 401);
});
