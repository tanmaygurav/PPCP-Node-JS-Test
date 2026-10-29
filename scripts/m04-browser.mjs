import { testRunsBrowser } from './m04-test-runs-browser.mjs';
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
  const pathname = req.url.split('?')[0], appPath = pathname === '/' || /^\/(submissions|admin)(\/|$)/.test(pathname);
  const file = resolve(root, `.${appPath ? '/index.html' : pathname}`);
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
    await page.getByRole('link', { name: role === 'student' ? 'My submissions' : 'Faculty dashboard', exact: true }).waitFor(); return { context, page };
  }
  const student = await login('student', { width: 1280, height: 900 }), page = student.page;
  await page.getByRole('link', { name: 'New submission', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Campus water access'); await page.locator('select[name="domain"]').selectOption('Education'); await page.getByLabel('Description', { exact: true }).fill('Water access needs improvement.');
  let dropped = false; await page.route('**/api/submissions', async route => { if (!dropped && route.request().method() === 'POST') { dropped = true; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
  await page.getByRole('button', { name: 'Save submission', exact: true }).click(); await page.getByRole('button', { name: 'Retry same save', exact: true }).waitFor();
  await page.getByRole('link', { name: 'My submissions', exact:true }).click(); await page.getByRole('heading',{name:'Finish this operation before leaving',exact:true}).waitFor(); assert.match(page.url(), /\/submissions\/new$/); await page.getByRole('button',{name:'Stay on this page',exact:true}).click();
  await page.getByRole('button', { name: 'Retry same save', exact: true }).click(); await page.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor(); results.push('lost HTTP save response reconciles through operation receipt');
  const id = await page.locator('.code').first().innerText(); assert.match(id, /^PP\d+$/);
  const detailUrl = page.url(); assert.match(detailUrl, /\/submissions\/[\w-]+$/);
  const savedId = new URL(detailUrl).pathname.split('/').at(-1);
  await page.reload(); await page.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor();
  const newTab = await student.context.newPage(); await newTab.goto(detailUrl); await newTab.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor(); await newTab.close();
  const signedOut = await browser.newContext(), direct = await signedOut.newPage(); await direct.goto(detailUrl);
  await direct.getByLabel('Institutional email').fill(identities.student.email); await direct.getByLabel('Password', { exact: true }).fill(password); await direct.getByRole('button', { name: 'Sign in', exact: true }).click();
  await direct.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor(); assert.equal(direct.url(), detailUrl); await signedOut.close();
  await page.goto(config.origin + '/admin/users'); await page.getByRole('heading', { name: 'Access unavailable' }).waitFor();
  await page.goto(detailUrl + '/edit'); await page.getByLabel('Title', { exact: true }).fill('Unsaved route draft');
  await page.getByLabel('Add attachments').setInputFiles({ name: 'draft.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 draft') });
  await page.getByRole('link', { name: 'My submissions', exact: true }).click(); await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), 'Unsaved route draft'); assert.equal(await page.getByLabel('Add attachments').evaluate(el => el.files[0].name), 'draft.pdf');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard changes and leave', exact: true }).click(); await page.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor();
  for (let i=0;i<24;i++) { const operationId=randomUUID(), upload=await store.prepare((await store.ref('users', identities.student.uid).get()).data(), { operationId, files: [] }); await store.save((await store.ref('users', identities.student.uid).get()).data(), { operationId, uploadId:upload.uploadId, title:'Routing fixture '+i, domain:'Education', description:'Synthetic navigation fixture', solution:'' }); }
  await page.goto(config.origin + '/?domain=Education&sort=id&limit=10'); await page.getByText('Page 1', { exact:true }).waitFor(); await page.getByRole('button',{name:'Next',exact:true}).click(); await page.getByText('Page 2',{exact:true}).waitFor();
  const listUrl = page.url(); await page.evaluate(()=>window.scrollTo(0,600)); await page.locator('.submission-card').first().click(); const pageTwoDetail=page.url();
  await page.goBack(); await page.getByText('Page 2',{exact:true}).waitFor(); assert.equal(page.url(),listUrl); await page.waitForFunction(()=>scrollY>200);
  await page.goForward(); await page.waitForURL(pageTwoDetail); await page.getByRole('link',{name:'Back to submissions',exact:false}).first().click(); await page.getByText('Page 2',{exact:true}).waitFor();
  const copied = await student.context.newPage(); await copied.goto(listUrl); await copied.getByText('Page 1',{exact:true}).waitFor(); await copied.close();
  await page.evaluate(()=>{ const state=history.state; state.usr.list.cursors[state.usr.list.index]='expired'; history.replaceState(state,''); }); await page.reload(); await page.getByText('Page 1',{exact:true}).waitFor(); assert.equal(page.url(),listUrl);
  await page.goto(detailUrl); await page.getByRole('heading', { name: 'Campus water access', exact: true }).waitFor();
  results.push('direct URLs, refresh, new tabs, intended URL through sign-in, forbidden admin, dirty draft/files cancellation, filter/page/scroll Back/Forward and expired cursor recovery');
  await page.getByRole('link', { name: 'Edit submission', exact: true }).click(); await page.getByLabel('Title', { exact: true }).fill('Updated campus water access'); await page.getByRole('button', { name: 'Save submission', exact: true }).click(); await page.getByRole('heading', { name: 'Updated campus water access', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lock submission', exact: true }).click(); await page.getByRole('link', { name: 'Edit submission', exact: true }).waitFor({ state: 'detached' });
  await page.screenshot({ path: 'output/m04/student-desktop.png', fullPage: true }); results.push('student create/edit/lock via real Auth + Node + Firestore emulators');
  const incompleteUser=await auth.createUser({email:'m04-profile-'+run+'@welingkar.org',password,emailVerified:true}); const incomplete=await browser.newContext(), profilePage=await incomplete.newPage(); await profilePage.goto(config.origin+'/admin/users'); await profilePage.getByLabel('Institutional email').fill(incompleteUser.email); await profilePage.getByLabel('Password',{exact:true}).fill(password); await profilePage.getByRole('button',{name:'Sign in',exact:true}).click(); await profilePage.getByLabel('Full name',{exact:true}).fill('Profile Tester'); await profilePage.getByLabel('Program / department').fill('PGDM'); await profilePage.getByLabel('Student / staff ID').fill('navigation'); await profilePage.getByRole('button',{name:'Continue',exact:true}).click(); await profilePage.getByRole('heading',{name:'Access unavailable',exact:true}).waitFor(); assert.equal(new URL(profilePage.url()).pathname,'/admin/users'); await incomplete.close(); results.push('intended protected URL survives sign-in and first profile completion');
  const faculty = await login('faculty', { width: 390, height: 844 }); await faculty.page.goto(detailUrl + '/edit'); await faculty.page.waitForURL(detailUrl); await faculty.page.getByRole('heading', { name: 'Updated campus water access', exact: true }).waitFor();
  await page.goto(detailUrl + '/edit'); await page.waitForURL(detailUrl); await page.getByText('This submission is locked.', { exact: true }).waitFor();
  const foreignContext=await browser.newContext(), foreignPage=await foreignContext.newPage(); await foreignPage.goto(config.origin); await foreignPage.getByLabel('Institutional email').fill(identities.student.email); await foreignPage.getByLabel('Password',{exact:true}).fill(password); await foreignPage.getByRole('button',{name:'Sign in',exact:true}).click(); await foreignPage.getByRole('link',{name:'My submissions',exact:true}).waitFor();
  await store.ref('submissions',savedId).update({ ownerUid:'foreign-owner' }); await foreignPage.goto(detailUrl); await foreignPage.getByRole('heading',{name:'Submission unavailable',exact:true}).waitFor(); await store.ref('submissions',savedId).update({ ownerUid:identities.student.uid }); await foreignContext.close();
  results.push('staff/locked edit redirects and generic foreign submission rejection');
  await faculty.page.getByLabel('Add a remark', { exact: true }).fill('Please add details after unlocking.'); await faculty.page.getByRole('button', { name: 'Add remark', exact: true }).click(); await faculty.page.getByText('Please add details after unlocking.', { exact: true }).waitFor();
  await faculty.page.getByRole('button', { name: 'Unlock submission', exact: true }).click(); await faculty.page.getByRole('button', { name: 'Lock submission', exact: true }).waitFor();
  assert(await faculty.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await faculty.page.screenshot({ path: 'output/m04/faculty-mobile.png', fullPage: true }); results.push('second-domain faculty review/remark/unlock and mobile layout');
  await page.getByRole('button', { name: 'Refresh saved version', exact: true }).click(); await page.getByRole('link', { name: 'Edit submission', exact: true }).waitFor(); await page.getByText('Please add details after unlocking.', { exact: true }).waitFor();
  const admin = await login('admin', { width: 1280, height: 900 }); await admin.page.getByRole('link', { name: 'Manage users', exact: true }).click(); await admin.page.getByLabel('Exact email').fill(identities.faculty.email); await admin.page.getByRole('button', { name: 'Find user', exact: true }).click(); await admin.page.getByLabel('Access', { exact: true }).selectOption('disabled'); await admin.page.getByRole('button', { name: 'Save access', exact: true }).click(); await admin.page.getByText('Account access updated.', { exact: true }).waitFor();
  await faculty.page.getByRole('button', { name: 'Refresh saved version', exact: true }).click(); await faculty.page.getByText('Account access is disabled or email changed.', { exact: true }).waitFor(); results.push('admin disables faculty; existing session denied on next API request');
  await admin.page.screenshot({ path: 'output/m04/admin-desktop.png', fullPage: true }); assert.deepEqual(errors, []);
  assert.equal(await page.getByRole('link', { name: 'Event theme', exact: true }).count(), 0);
  assert.equal(await faculty.page.getByRole('link', { name: 'Event theme', exact: true }).count(), 0);
  await testRunsBrowser({page:admin.page,store,auth,origin:config.origin}); results.push('admin test-run creation, explicit cleanup preview/confirmation and resumable deletion preserve synthetic accounts');
  await admin.page.getByRole('link', { name: 'Event theme', exact: true }).click();
  for (const theme of ['innovation', 'festival', 'conference', 'classic']) {
    await admin.page.getByLabel('Event theme', { exact: true }).selectOption(theme);
    const apply = admin.page.getByRole('button', { name: 'Apply to website', exact: true });
    if (await apply.isEnabled()) await apply.click();
    await admin.page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
    const colours = await admin.page.evaluate(() => { const css = getComputedStyle(document.documentElement); return Object.fromEntries(['primary', 'page', 'ink', 'muted', 'hero-end', 'accent'].map(name => [name, css.getPropertyValue(`--${name}`).trim()])); });
    const luminance = hex => { const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
    const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };
    assert(contrast(colours.primary, '#ffffff') >= 4.5, `${theme} primary button contrast`);
    assert(contrast(colours.ink, colours.page) >= 4.5, `${theme} body contrast`);
    assert(contrast(colours.muted, colours.page) >= 4.5, `${theme} secondary text contrast`);
    assert(contrast(colours.accent, colours['hero-end']) >= 4.5, `${theme} hero accent contrast`);
    await admin.page.setViewportSize({ width: 1280, height: 1000 });
    await admin.page.screenshot({ path: `output/m04/theme-${theme}-desktop.png`, fullPage: true });
    await admin.page.setViewportSize({ width: 390, height: 844 });
    assert(await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} mobile overflow`);
    await admin.page.screenshot({ path: `output/m04/theme-${theme}-mobile.png`, fullPage: true });
    const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } }), loginPage = await anonymous.newPage();
    await loginPage.goto(config.origin); await loginPage.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
    assert.equal(await loginPage.getByRole('link', { name: 'Event theme', exact: true }).count(), 0);
    await loginPage.screenshot({ path: `output/m04/theme-${theme}-login.png`, fullPage: true });
    await anonymous.close();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
  }
  await admin.page.reload(); await admin.page.waitForFunction(() => document.documentElement.dataset.theme === 'classic');
  await admin.page.getByRole('link', { name: 'Event theme', exact: true }).click();
  await admin.page.getByLabel('Event theme', { exact: true }).selectOption('innovation'); await admin.page.getByRole('button', { name: 'Apply to website', exact: true }).click();
  await admin.page.waitForFunction(() => document.documentElement.dataset.theme === 'innovation');
  const denied = await student.context.request.post(`${config.origin}/api/admin/appearance`, { headers: { Origin: config.origin }, data: { theme: 'festival', expectedVersion: (await store.appearance()).version, operationId: randomUUID() } });
  assert.equal(denied.status(), 403); assert.equal((await store.appearance()).theme, 'innovation');
  results.push('all four event themes persist site-wide across anonymous, student and admin views; admin-only mutation; mobile overflow and text contrast checks pass');
  console.log(JSON.stringify({ passed: results, browserErrors: errors.length }));
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `output/m04/failure-${i}.png`, fullPage: true });
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await db.terminate(); }
await writeFile('output/m04/browser.json', JSON.stringify({ environment: 'emulators', results, browserErrors: errors }, null, 2));

