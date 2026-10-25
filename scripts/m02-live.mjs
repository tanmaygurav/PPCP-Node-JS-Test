import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadM02Env, m02Config } from '../src/m02/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M02Store } from '../src/m02/store.mjs';
import { chromium } from 'playwright';

loadM02Env(); const config = m02Config();
const args = process.argv.slice(2), index = args.indexOf('--target'), raw = args[index + 1];
if (index < 0 || !raw || args.some((arg, i) => !['--target', '--write'].includes(arg) && i !== index + 1)) throw new Error('Usage: npm run test:m02:live -- --target local|https://ppcp-m02-auth-test.vercel.app [--write]');
const origin = raw === 'local' ? 'http://localhost:3002' : raw;
if (!['http://localhost:3002', 'https://ppcp-m02-auth-test.vercel.app'].includes(origin)) throw new Error('Only the explicit separate M02 local or stable pilot target is allowed.');
if (config.projectId !== 'ppcp-auth-test' || config.emulator) throw new Error('Live tests require the separate real M02 Firebase project.');
const write = args.includes('--write'), runId = randomUUID(), users = [], cookies = new Map(), accounts = new Map();
const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const report = { milestone: 'M02', schemaVersion: 2, suite: 'live-api', runId, timestamp: new Date().toISOString(), node: process.version,
  runnerCommit: git(['rev-parse', 'HEAD']), runnerDirty: Boolean(git(['status', '--porcelain'])),
  target: origin, writeEnabled: write, steps: [], created: { firebaseUids: [], submissionIds: [], fileIds: [] },
  limitation: 'Administrator-verified synthetic accounts; does not verify real email delivery. Google artifacts are retained; synthetic Firebase users are deleted at the end.' };
async function call(path, data, user) {
  const response = await fetch(`${origin}/api/${path}`, { method: data === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(60000), headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookies.get(user) || '' },
    body: data === undefined ? undefined : JSON.stringify(data) });
  const cookie = response.headers.get('set-cookie'); if (cookie && user) cookies.set(user, cookie.split(';')[0]);
  const json = (response.headers.get('content-type') || '').includes('application/json');
  return { status: response.status, body: json ? await response.json() : await response.arrayBuffer() };
}
async function step(id, purpose, action) {
  await action(); report.steps.push({ id, purpose, status: 'passed' }); console.log(`${id}: passed`);
}
let auth;
try {
  await step('M02-L01', 'Target and public configuration identify M02; anonymous access fails', async () => {
    const health = await call('health'); assert.equal(health.status, 200); assert.equal(health.body.milestone, 'M02');
    const web = await call('auth/config'); assert.equal(web.body.projectId, config.projectId); assert.equal(web.body.emulator, null);
    assert.equal((await call('submissions')).status, 401);
  });
  if (write) {
    auth = firebaseAuth(config); const store = new M02Store(config);
    await step('M02-L02', 'Separate Google resources and synthetic Firebase sessions work', async () => {
      const checks = await store.checks(); assert.equal(checks.spreadsheet, 'PPCP M02 Test DB'); assert.equal(checks.folder, 'PPCP M02 Test Media');
      for (const label of ['owner', 'other', 'faculty']) {
        const uid = `m02-test-${runId}-${label}`, password = randomBytes(24).toString('base64url'), email = `${uid}@welingkar.org`;
        await auth.createUser({ uid, email, password, emailVerified: true, displayName: 'Synthetic M02 regression' });
        accounts.set(label, { email, password });
        users.push(uid); report.created.firebaseUids.push(uid);
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.web.apiKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        assert.equal(response.status, 200); const signed = await response.json();
        assert.equal((await call('auth/session', { idToken: signed.idToken }, label)).status, 200);
        const registered = await call('profile', { name: 'Synthetic M02 regression', studentId: `TEST-${label}`, program: 'Test only', role: 'admin' }, label);
        assert.equal(registered.status, 200); assert.equal(registered.body.profile.role, 'student');
      }
      await store.assignRole(users[2], `${users[2]}@welingkar.org`, 'faculty', true);
    });
    let savedId, fileId;
    await step('M02-L03', 'Owner-bound upload writes real Drive file and Sheets record', async () => {
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64');
      const plan = await call('upload-sessions', { files: [{ name: `M02-SYNTHETIC-${runId}.png`, size: bytes.length }] }, 'owner');
      assert.equal(plan.status, 201); fileId = plan.body.uploads[0].id; report.created.fileIds.push(fileId);
      const upload = await fetch(plan.body.uploads[0].uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes }); assert.equal(upload.status, 200);
      const data = { ticket: plan.body.ticket, title: `M02 SYNTHETIC ${runId}`, domain: 'Education', description: 'Automated integration regression. Synthetic data only.', solution: '', email: 'forged@example.com' };
      assert.equal((await call('submissions', data, 'other')).status, 403);
      const saved = await call('submissions', data, 'owner'); assert.equal(saved.status, 201); savedId = saved.body.item.id;
      report.created.submissionIds.push(savedId); assert.equal(saved.body.item.ownerUid, users[0]);
      assert.equal((await call('submissions', data, 'owner')).body.alreadySaved, true);
      const permissions = await store.request(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(type)`);
      assert.ok(permissions.permissions.every(permission => permission.type !== 'anyone' && permission.type !== 'domain'));
    });
    await step('M02-L04', 'Owner/staff access works; second student and forged remark author are blocked', async () => {
      assert.equal((await call(`submissions/${savedId}`, undefined, 'owner')).status, 200);
      assert.equal((await call(`submissions/${savedId}/files/${fileId}`, undefined, 'owner')).status, 200);
      for (const suffix of ['', '/remarks', `/files/${fileId}`]) assert.equal((await call(`submissions/${savedId}${suffix}`, undefined, 'other')).status, 404);
      assert.equal((await call('submissions', undefined, 'other')).body.total, 0);
      assert.equal((await call('checks', undefined, 'owner')).status, 403);
      assert.equal((await call(`submissions/${savedId}/remarks`, { remark: 'Forged student feedback' }, 'owner')).status, 403);
      const remark = await call(`submissions/${savedId}/remarks`, { remark: `M02 SYNTHETIC faculty review ${runId}`, givenBy: 'forged' }, 'faculty');
      assert.equal(remark.status, 201); assert.equal(remark.body.item.givenBy, `${users[2]}@welingkar.org`);
      assert.equal((await call(`submissions/${savedId}`, undefined, 'faculty')).status, 200);
    });
    await step('M02-L05', 'Logout revokes a copied server session', async () => {
      const copied = cookies.get('owner'); await new Promise(resolve => setTimeout(resolve, 1100));
      assert.equal((await call('auth/logout', {}, 'owner')).status, 200); cookies.set('owner', copied);
      assert.equal((await call('me', undefined, 'owner')).status, 401);
    });
    await step('M02-L06', 'Chromium signs in on the real target, reads the saved record, downloads its attachment and signs out', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage(), errors = [], owner = accounts.get('owner');
        page.on('pageerror', error => errors.push(error.name));
        await page.goto(origin);
        await page.getByLabel('Organization email').fill(owner.email); await page.getByLabel('Password', { exact: true }).fill(owner.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByRole('heading', { name: 'Your pain points' }).waitFor();
        await page.getByRole('button', { name: `M02 SYNTHETIC ${runId}`, exact: true }).click();
        await page.getByRole('heading', { name: `M02 SYNTHETIC ${runId}`, exact: true }).waitFor();
        const downloaded = page.waitForEvent('download');
        await page.getByRole('link', { name: `M02-SYNTHETIC-${runId}.png`, exact: true }).click();
        assert.equal((await downloaded).suggestedFilename(), `M02-SYNTHETIC-${runId}.png`);
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    });
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { type: error.name, nextStep: 'Inspect the next uncompleted test ID and server request IDs; check saved records before retrying.' };
  console.error('M02 live regression failed. No tokens, passwords, cookies, keys or session URLs logged.'); process.exitCode = 1;
} finally {
  if (auth && users.length) {
    try { const result = await auth.deleteUsers(users); report.firebaseCleanup = result.failureCount ? 'partial' : 'completed'; }
    catch { report.firebaseCleanup = 'failed-review-created-uids'; process.exitCode = 1; }
  }
  mkdirSync('output/test-runs', { recursive: true }); const path = `output/test-runs/m02-live-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2)); console.log(`Sanitized report: ${path}`);
}
