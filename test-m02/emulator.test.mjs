import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { m02Fixture } from '../test-tools/m02-fixture.mjs';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!host || !['127.0.0.1:9099', 'localhost:9099'].includes(host)) throw new Error('Only the local demo Auth Emulator is allowed.');
const projectId = 'demo-ppcp-m02';
const auth = firebaseAuth({ projectId, emulator: host });
async function rest(action, data) {
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=emulator-only`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await response.json(); if (!response.ok) throw new Error(`Emulator request ${action} failed.`); return result;
}
async function account(domain = 'welingkar.org', verified = true) {
  const email = `m02-${randomUUID()}@${domain}`, password = 'Synthetic-pass-123';
  const created = await rest('signUp', { email, password, returnSecureToken: true });
  if (verified) await auth.updateUser(created.localId, { emailVerified: true });
  const signed = await rest('signInWithPassword', { email, password, returnSecureToken: true });
  return { ...signed, password, uid: created.localId };
}
async function fixture(t) { const f = await m02Fixture(auth); t.after(f.close); return f; }
test('M02-E01 real emulator registration rejects unverified users and allows emailed verification', async t => {
  const f = await fixture(t), user = await account('welingkar.org', false);
  assert.equal((await f.call('auth/session', { idToken: user.idToken })).status, 403);
  await rest('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: user.idToken });
  const codes = await (await fetch(`http://${host}/emulator/v1/projects/${projectId}/oobCodes`)).json();
  const code = codes.oobCodes.find(item => item.email === user.email && item.requestType === 'VERIFY_EMAIL');
  assert.ok(code); await rest('update', { oobCode: code.oobCode });
  const fresh = await rest('signInWithPassword', { email: user.email, password: user.password, returnSecureToken: true });
  const login = await f.call('auth/session', { idToken: fresh.idToken }); assert.equal(login.status, 200);
  assert.equal((await f.call('profile', { name: 'Synthetic', program: 'Test', studentId: '01', role: 'admin' }, login.cookie)).body.profile.role, 'student');
});
test('M02-E02 real emulator tokens reject foreign domains, tampering and expiration', async t => {
  const f = await fixture(t), outsider = await account('example.com');
  assert.equal((await f.call('auth/session', { idToken: outsider.idToken })).status, 403);
  const user = await account();
  assert.equal((await f.call('auth/session', { idToken: `${user.idToken}tampered` })).status, 401);
  const parts = user.idToken.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url')); claims.exp = Math.floor(Date.now() / 1000) - 3600;
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  assert.equal((await f.call('auth/session', { idToken: parts.join('.') })).status, 401);
});
test('M02-E03 real emulator identities enforce ownership and staff permissions', async t => {
  const f = await fixture(t), alice = await account(), bob = await account();
  const a = (await f.call('auth/session', { idToken: alice.idToken })).cookie;
  const b = (await f.call('auth/session', { idToken: bob.idToken })).cookie;
  for (const cookie of [a,b]) await f.call('profile', { name: 'Synthetic', program: 'Test', studentId: '01' }, cookie);
  const plan = await f.call('upload-sessions', { files: [] }, a);
  const data = { ticket: plan.body.ticket, title: 'Synthetic', domain: 'Education', description: 'Synthetic' };
  assert.equal((await f.call('submissions', data, b)).status, 403);
  const saved = await f.call('submissions', data, a); assert.equal(saved.status, 201);
  assert.equal((await f.call(`submissions/${saved.body.item.id}`, undefined, b)).status, 404);
  f.profiles.get(bob.uid).role = 'faculty';
  assert.equal((await f.call(`submissions/${saved.body.item.id}/remarks`, { remark: 'Synthetic review' }, b)).status, 201);
});
test('M02-E04 real emulator logout invalidates a copied server session', async t => {
  const f = await fixture(t), user = await account();
  const login = await f.call('auth/session', { idToken: user.idToken }); assert.equal(login.status, 200);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await f.call('auth/logout', {}, login.cookie)).status, 200);
  assert.equal((await f.call('me', undefined, login.cookie)).status, 401);
});
test('M02-E05 real emulator password reset replaces the old password', async () => {
  const user = await account();
  await rest('sendOobCode', { requestType: 'PASSWORD_RESET', email: user.email });
  const codes = await (await fetch(`http://${host}/emulator/v1/projects/${projectId}/oobCodes`)).json();
  const code = codes.oobCodes.find(item => item.email === user.email && item.requestType === 'PASSWORD_RESET');
  assert.ok(code); await rest('resetPassword', { oobCode: code.oobCode, newPassword: 'Changed-synthetic-456' });
  await assert.rejects(() => rest('signInWithPassword', { email: user.email, password: user.password, returnSecureToken: true }));
  assert.ok((await rest('signInWithPassword', { email: user.email, password: 'Changed-synthetic-456', returnSecureToken: true })).idToken);
});
test('M02-E06 Chromium registration, verification, profile, submission, remark and logout', async t => {
  const f = await fixture(t), browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(), email = `browser-${randomUUID()}@welingkar.org`;
  const errors = []; page.on('pageerror', error => errors.push(error.name));
  page.on('console', message => { if (message.type() === 'error') console.log(`Browser: ${message.text()}`); });
  await page.goto(f.config.origin);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Organization email').fill(email); await page.getByLabel('Password', { exact: true }).fill('Synthetic-browser-123');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByRole('heading', { name: 'Verify your email' }).waitFor();
  const codes = await (await fetch(`http://${host}/emulator/v1/projects/${projectId}/oobCodes`)).json();
  const code = codes.oobCodes.find(item => item.email === email && item.requestType === 'VERIFY_EMAIL');
  assert.ok(code); await rest('update', { oobCode: code.oobCode });
  await page.getByRole('button', { name: 'Continue after verification' }).click();
  await page.getByRole('heading', { name: 'Complete your profile' }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Student'); await page.getByLabel('Program', { exact: true }).fill('Test');
  await page.getByLabel('Student ID', { exact: true }).fill('M02-TEST'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Your pain points' }).waitFor();
  await page.getByLabel('Title', { exact: true }).fill('Synthetic browser pain point'); await page.getByRole('combobox').selectOption('Education');
  await page.getByLabel('What is the problem?').fill('Synthetic emulator observation.');
  await page.getByRole('button', { name: 'Submit pain point', exact: true }).click();
  await page.getByRole('button', { name: 'Synthetic browser pain point', exact: true }).click();
  await page.getByRole('heading', { name: 'Synthetic browser pain point', exact: true }).waitFor();
  const user = await auth.getUserByEmail(email); f.profiles.get(user.uid).role = 'faculty';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByLabel('Faculty remark').fill('Synthetic faculty review.'); await page.getByRole('button', { name: 'Add remark' }).click();
  await page.getByText('Synthetic faculty review.', { exact: false }).waitFor();
  mkdirSync('output/test-runs', { recursive: true }); await page.screenshot({ path: 'output/test-runs/m02-browser.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  assert.equal(f.records.length, 1); assert.equal(f.remarks.length, 1); assert.deepEqual(errors, []);
});
