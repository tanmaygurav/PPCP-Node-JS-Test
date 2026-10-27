import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { services } from '../src/m04/auth.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { createM04Handler } from '../src/m04/app.mjs';
import { digest } from '../src/m04/domain.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('M04 browser verification requires emulators.');
const projectId = 'demo-ppcp-m04', config = { projectId, secret: 'browser-emulator-secret'.repeat(2), bootstrapUids: [], origin: 'http://127.0.0.1:3005', emulator: process.env.FIREBASE_AUTH_EMULATOR_HOST, web: { projectId, apiKey: 'emulator-only', authDomain: `${projectId}.firebaseapp.com` } }, { auth, db } = services(config);
const store = new M04Store(config, db, { reserve: async () => [] }), handler = createM04Handler(config, store, auth), root = resolve('dist-m04'), run = randomUUID().slice(0, 8), password = `M04!${randomUUID()}`;
await store.ref('domains', digest('education')).set({ name: 'Education', active: true });
const identities = {};
for (const [role, domain] of [['student', 'welingkar.org'], ['faculty', 'welingkarmail.org'], ['admin', 'welingkar.org']]) {
  const user = await auth.createUser({ email: `m04-${role}-${run}@${domain}`, password, emailVerified: true });
  identities[role] = user;
  await store.ref('users', user.uid).set({ uid: user.uid, email: user.email, name: `${role} Tester`, program: 'PGDM', studentId: role, role, status: 'active', createdAt: new Date().toISOString() });
}
await store.ref('counters', 'access').set({ admins: 1, bootstrapped: true });
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return handler(req, res);
  const file = resolve(root, `.${req.url === '/' ? '/index.html' : req.url.split('?')[0]}`);
  if (!file.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
  try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream' }); res.end(bytes); } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
config.origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true }), results = [], errors = [];
await mkdir('output/m04', { recursive: true });
try {
  async function login(role, viewport) {
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(config.origin); await page.getByLabel('Institutional email').fill(identities[role].email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: role === 'student' ? 'My submissions' : 'Faculty dashboard', exact: true }).waitFor(); return { context, page };
  }
  const student = await login('student', { width: 1280, height: 900 }), page = student.page;
  await page.getByRole('button', { name: 'New submission', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Campus water access'); await page.locator('select[name="domain"]').selectOption('Education'); await page.getByLabel('Description', { exact: true }).fill('Water access needs improvement.');
  let dropped = false; await page.route('**/api/submissions', async route => { if (!dropped && route.request().method() === 'POST') { dropped = true; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
  await page.getByRole('button', { name: 'Save submission', exact: true }).click(); await page.getByRole('button', { name: 'Retry same save', exact: true }).waitFor(); await page.getByRole('button', { name: 'Retry same save', exact: true }).click(); await page.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor(); results.push('lost HTTP save response reconciles through operation receipt');
  const id = await page.locator('.code').first().innerText(); assert.match(id, /^PP\d+$/);
  await page.getByRole('button', { name: 'Edit submission', exact: true }).click(); await page.getByLabel('Title', { exact: true }).fill('Updated campus water access'); await page.getByRole('button', { name: 'Save submission', exact: true }).click(); await page.getByRole('heading', { name: 'Updated campus water access', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lock submission', exact: true }).click(); await page.getByRole('button', { name: 'Edit submission', exact: true }).waitFor({ state: 'detached' });
  await page.screenshot({ path: 'output/m04/student-desktop.png', fullPage: true }); results.push('student create/edit/lock via real Auth + Node + Firestore emulators');
  const faculty = await login('faculty', { width: 390, height: 844 }); await faculty.page.getByRole('button').filter({ hasText: id }).click();
  await faculty.page.getByLabel('Add a remark', { exact: true }).fill('Please add details after unlocking.'); await faculty.page.getByRole('button', { name: 'Add remark', exact: true }).click(); await faculty.page.getByText('Please add details after unlocking.', { exact: true }).waitFor();
  await faculty.page.getByRole('button', { name: 'Unlock submission', exact: true }).click(); await faculty.page.getByRole('button', { name: 'Lock submission', exact: true }).waitFor();
  assert(await faculty.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await faculty.page.screenshot({ path: 'output/m04/faculty-mobile.png', fullPage: true }); results.push('second-domain faculty review/remark/unlock and mobile layout');
  await page.getByRole('button', { name: 'Refresh saved version', exact: true }).click(); await page.getByRole('button', { name: 'Edit submission', exact: true }).waitFor(); await page.getByText('Please add details after unlocking.', { exact: true }).waitFor();
  const admin = await login('admin', { width: 1280, height: 900 }); await admin.page.getByRole('button', { name: 'Manage users', exact: true }).click(); await admin.page.getByLabel('Exact email').fill(identities.faculty.email); await admin.page.getByRole('button', { name: 'Find user', exact: true }).click(); await admin.page.getByLabel('Access', { exact: true }).selectOption('disabled'); await admin.page.getByRole('button', { name: 'Save access', exact: true }).click(); await admin.page.getByText('Account access updated.', { exact: true }).waitFor();
  await faculty.page.getByRole('button', { name: 'Refresh saved version', exact: true }).click(); await faculty.page.getByText('Account access is disabled or email changed.', { exact: true }).waitFor(); results.push('admin disables faculty; existing session denied on next API request');
  await admin.page.screenshot({ path: 'output/m04/admin-desktop.png', fullPage: true }); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results, browserErrors: errors.length }));
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `output/m04/failure-${i}.png`, fullPage: true });
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await db.terminate(); }
await writeFile('output/m04/browser.json', JSON.stringify({ environment: 'emulators', results, browserErrors: errors }, null, 2));
