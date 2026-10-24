import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleStore } from '../src/google.mjs';

const config = { origin: 'http://localhost:3000', clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh', spreadsheetId: 'test-sheet', folderId: 'test-folder' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('token refresh is coalesced and bearer credentials stay server-side', async () => {
  let refreshes = 0, reads = 0;
  const store = new GoogleStore(config, async (url, options) => {
    if (url.includes('/token')) { refreshes++; return json({ access_token: 'private-token', expires_in: 3600 }); }
    assert.equal(options.headers.Authorization, 'Bearer private-token'); reads++; return json({ values: [] });
  });
  await Promise.all([store.list(), store.list()]);
  assert.equal(refreshes, 1); assert.equal(reads, 2);
});
test('append uses RAW and exact A:R mapping; rejects row-number formula sheets', async () => {
  let formula = false; const calls = [];
  const store = new GoogleStore(config, async (url, options) => {
    if (url.includes('/token')) return json({ access_token: 'token', expires_in: 3600 });
    calls.push({ url, options });
    if (url.includes('valueRenderOption=FORMULA')) {
      const headers = Array(18).fill(''); headers[1] = formula ? '=ArrayFormula(...)' : 'ID'; headers[17] = 'Description';
      return json({ values: [headers] });
    }
    return json({ updates: {} });
  });
  const data = { email: 'test@example.com', name: 'Test', studentId: '01', program: 'Program', domain: 'Domain', title: '=literal', solution: '', description: 'Description' };
  await store.appendSubmission('fixed-id', data, []);
  const write = calls.find(call => call.options.method === 'POST');
  assert.match(write.url, /valueInputOption=RAW/);
  assert.equal(JSON.parse(write.options.body).values[0][8], '=literal');
  assert.equal(JSON.parse(write.options.body).values[0][17], 'Description');
  formula = true; await assert.rejects(store.appendSubmission('id-2', data, []), /Remove formulas/);
});
test('resumable creation uses generated file ID, folder, size, and app properties without exposing token', async () => {
  const store = new GoogleStore(config, async (url, options) => {
    if (url.includes('/token')) return json({ access_token: 'secret-access-token', expires_in: 3600 });
    if (url.includes('/generateIds')) return json({ ids: ['new-file-id'] });
    const body = JSON.parse(options.body);
    assert.equal(body.id, 'new-file-id'); assert.deepEqual(body.parents, ['test-folder']);
    assert.equal(body.appProperties.submissionId, 'submission');
    assert.equal(options.headers['X-Upload-Content-Length'], '100');
    return new Response('', { headers: { location: 'https://www.googleapis.com/upload/session' } });
  });
  const uploads = await store.createUploads('submission', [{ name: 'x.pdf', size: 100, mimeType: 'application/pdf' }]);
  assert.equal(uploads[0].id, 'new-file-id'); assert.ok(!JSON.stringify(uploads).includes('secret-access-token'));
});
test('Drive verification rejects wrong folder, size, ownership marker, trashed and incomplete files', async () => {
  const actual = { id: 'file', name: 'x.pdf', size: '100', mimeType: 'application/pdf', parents: ['test-folder'],
    trashed: false, appProperties: { prototype: 'ppcp-v3-test', submissionId: 'submission' } };
  let result = actual;
  const store = new GoogleStore(config, async url => url.includes('/token') ? json({ access_token: 'token', expires_in: 3600 }) : json(result));
  const expected = [{ id: 'file', name: 'x.pdf', size: 100, mimeType: 'application/pdf' }];
  assert.equal((await store.verifyUploads('submission', expected)).length, 1);
  for (const change of [{ parents: ['other'] }, { size: '101' }, { size: undefined }, { appProperties: {} }, { trashed: true }]) {
    result = { ...actual, ...change }; await assert.rejects(store.verifyUploads('submission', expected), /attachment/);
  }
});
test('ambiguous write failures are never automatically retried', async () => {
  let writes = 0;
  const store = new GoogleStore(config, async url => {
    if (url.includes('/token')) return json({ access_token: 'token', expires_in: 3600 });
    writes++; return json({}, 503);
  });
  await assert.rejects(store.appendRemark('id', 'Operator', 'Feedback'), /Google 503/);
  assert.equal(writes, 1);
});
