import test from 'node:test';
import assert from 'node:assert/strict';
import { M02Store, PROFILE_HEADERS } from '../src/m02/store.mjs';
import { m02Config } from '../src/m02/config.mjs';
test('M02-S01 profile reads reject disabled, invalid-role and conflicting rows', async () => {
  const store = new M02Store({});
  let rows = [['uid','a@welingkar.org','Alice','Test','01','student','active','now']];
  store.values = async () => rows;
  assert.equal((await store.profile('uid')).role, 'student');
  rows.push([...rows[0]]); assert.equal((await store.profile('uid')).role, 'student');
  rows[1][5] = 'admin'; await assert.rejects(() => store.profile('uid'), error => error.status === 409);
  rows = [rows[0]]; rows[0][6] = 'disabled'; await assert.rejects(() => store.profile('uid'), error => error.status === 403);
  rows[0][6] = 'active'; rows[0][5] = 'unexpected'; await assert.rejects(() => store.profile('uid'), error => error.status === 403);
});
test('M02-S02 profile writes use RAW values and contain no password column', async () => {
  const store = new M02Store({ spreadsheetId: 'test' }); let written;
  store.values = async range => range.includes('A1:') ? [PROFILE_HEADERS] : [];
  store.request = async (url, options) => { written = { url, body: JSON.parse(options.body) }; };
  await store.register({ uid: 'uid', email: 'a@welingkar.org' }, { name: '=literal name', program: 'Test', studentId: '01' });
  assert.match(written.url, /valueInputOption=RAW/); assert.equal(written.body.values[0][5], 'student');
  assert.equal(written.body.values[0][2], '=literal name'); assert.equal(PROFILE_HEADERS.some(x => /password/i.test(x)), false);
});
test('M02-S03 config rejects M01 resource reuse and emulator in deployed environments', () => {
  const saved = { ...process.env };
  try {
    process.env.FIREBASE_PROJECT_ID = 'demo-ppcp-m02'; process.env.M02_SIGNING_SECRET = 'test-'.repeat(10);
    process.env.APP_ORIGIN = 'http://localhost:3002'; process.env.M02_GOOGLE_SPREADSHEET_ID = '15UGqhLqvg9dbuQ9AAAmtRbxiZvcI0z8ZQY46Kl-WcpA';
    assert.throws(() => m02Config(), /separate/); delete process.env.M02_GOOGLE_SPREADSHEET_ID;
    process.env.VERCEL = '1'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    assert.throws(() => m02Config(), /only on local/);
  } finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});
test('M02-S04 role assignment dry run does not write; applying targets one RAW role cell', async () => {
  const store = new M02Store({ spreadsheetId: 'test' }); let written = null;
  store.values = async () => [['uid','a@welingkar.org','Alice','Test','01','student','active','now']];
  store.request = async (url, options) => { written = { url: new URL(url), options }; };
  await store.assignRole('uid', 'a@welingkar.org', 'faculty'); assert.equal(written, null);
  await store.assignRole('uid', 'a@welingkar.org', 'faculty', true);
  assert.equal(written.url.searchParams.get('valueInputOption'), 'RAW');
  assert.equal(decodeURIComponent(written.url.pathname).split('/values/')[1], "'Profiles'!F2");
  assert.equal(written.options.method, 'PUT'); assert.deepEqual(JSON.parse(written.options.body).values, [['faculty']]);
  await assert.rejects(() => store.assignRole('uid', 'different@welingkar.org', 'admin', true), error => error.status === 409);
});
