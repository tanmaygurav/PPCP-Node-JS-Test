import test from 'node:test';
import assert from 'node:assert/strict';
import { M03Store } from '../src/m03/store.mjs';
import { responseRow, validateFiles } from '../src/domain.mjs';
import { m03Config } from '../src/m03/config.mjs';

test('edit updates the same row and preserves identity, date, tag and remark tab', async () => {
  const data = { email: 'owner@welingkar.org', name: 'Owner', studentId: '01', program: 'Test', domain: 'Education', title: 'Original', description: 'Original observation', solution: '' };
  const original = [...responseRow('id', data, [], '2026-01-01T00:00:00.000Z'), 'owner', '', '']; original[0] = 'Reviewed';
  const store = new M03Store({ spreadsheetId: 'fixture' });
  const writes = [];
  store.values = async range => range.includes('S1:U1') ? [['Owner UID', 'Last edited', 'Last save operation']] : [original];
  store.request = async (url, options) => { writes.push({ url, ...options }); return {}; };
  const result = await store.updateExisting({ id: 'id', ownerUid: 'owner', rowNumber: 8, lastEdited: '' }, { title: 'Edited', description: 'Edited observation', solution: 'Improvement', domain: 'Education' }, [], '2026-10-25T00:00:00.000Z', 'op');
  assert.equal(writes.length, 1); assert.equal(writes[0].method, 'PUT'); assert.match(decodeURIComponent(writes[0].url), /Responses'!A8:U8/);
  const [row] = JSON.parse(writes[0].body).values;
  assert.deepEqual(row.slice(0, 7), original.slice(0, 7)); assert.equal(row[18], 'owner'); assert.equal(row[20], 'op');
  assert.equal(result.lastEdited, '2026-10-25T00:00:00.000Z'); assert.equal(result.title, 'Edited'); assert.ok(!writes[0].url.includes('Remarks'));
});
test('attachment boundaries use decimal bytes and the resulting combined set', () => {
  const file = (size, i = 0) => ({ name: `fixture${i}.pdf`, size });
  assert.equal(validateFiles([file(5000000)]).length, 1);
  assert.throws(() => validateFiles([file(5000001)]));
  assert.equal(validateFiles(Array.from({ length: 4 }, (_, i) => file(5000000, i))).length, 4);
  assert.throws(() => validateFiles([...Array.from({ length: 4 }, (_, i) => file(5000000, i)), file(1, 4)]));
  assert.equal(validateFiles(Array.from({ length: 10 }, (_, i) => file(1, i))).length, 10);
  assert.throws(() => validateFiles(Array.from({ length: 11 }, (_, i) => file(1, i))));
});
test('cleanup refuses foreign folder or submission and does not trash current files blindly', async () => {
  const store = new M03Store({ folderId: 'm03-folder' }); let patched = false;
  store.request = async (url, options) => { if (options?.method === 'PATCH') patched = true; return { parents: ['other-folder'], appProperties: { submissionId: 'id' } }; };
  await assert.rejects(store.trashAttachment('id', 'file'), /ownership mismatch/); assert.equal(patched, false);
});
test('M03 config rejects preserved milestone resources', () => {
  const previous = { ...process.env };
  try {
    process.env.M03_SIGNING_SECRET = 'fixture-only-secret'.repeat(3); process.env.FIREBASE_PROJECT_ID = 'fixture';
    process.env.M03_GOOGLE_SPREADSHEET_ID = '1IKhPcT5cYwcGOUAuvZ9HfW_i0RGiRC4c8UDgr1zuCAo';
    assert.throws(m03Config, /cannot use M01 or M02/);
  } finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
