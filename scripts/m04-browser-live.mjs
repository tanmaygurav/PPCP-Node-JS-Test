import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { environment, writeReport } from './m04-test-support.mjs';
if (!process.argv.includes('--write')) throw new Error('Real browser writes require --write.');
const context = await environment(), pool = JSON.parse(readFileSync('.local/m04-accounts.json', 'utf8'));
if (pool.projectId !== context.config.projectId) throw new Error('M04 fixture project mismatch.');
const browser = await chromium.launch({ headless: true }), browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await browserContext.newPage(), errors = [], checks = [];
page.on('pageerror', () => errors.push('Uncaught browser error'));
await mkdir('output/m04', { recursive: true });
try {
  await page.goto(context.origin);
  await page.getByLabel('Institutional email').fill(pool.students[0].email);
  await page.getByLabel('Password', { exact: true }).fill(pool.students[0].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('link', { name: 'My submissions', exact: true }).waitFor();
  await page.getByRole('link', { name: 'New submission', exact: true }).click();
  const title = `M04 live browser ${randomUUID().slice(0, 8)}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Domain', { exact: true }).selectOption('Education');
  await page.getByLabel('Description', { exact: true }).fill('Real browser direct-to-Drive upload and lost-response verification.');
  await page.locator('input[name="attachments"]').setInputFiles({ name: 'm04-browser-check.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64') });
  let dropped = false;
  await page.route('**/api/submissions', async route => {
    if (!dropped && route.request().method() === 'POST') {
      const response = await route.fetch();
      if (response.ok()) { dropped = true; await route.abort('failed'); }
      else await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save submission', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same save', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Retry same save', exact: true }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const records = await context.db.collection('submissions').where('title', '==', title).limit(2).get();
  assert.equal(records.size, 1); const record = records.docs[0].data(); assert.equal(record.ownerUid, pool.students[0].uid); assert.equal(record.media.length, 1);
  checks.push('real browser Drive upload succeeds with deployed CORS/CSP');
  checks.push('lost real save response reconciles to exactly one Firestore submission');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: /m04-browser-check\.png/ }).click();
  const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
  assert(['drive.google.com', 'docs.google.com'].includes(new URL(popup.url()).hostname));
  await popup.screenshot({ path: 'output/m04/drive-live-browser.png', fullPage: true }); await popup.close(); checks.push('attachment opens directly in a separate anonymous Drive tab');
  await page.getByRole('link', { name: 'Edit submission', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(`${title} edited`);
  await page.getByRole('button', { name: 'Save submission', exact: true }).click();
  await page.getByRole('heading', { name: `${title} edited`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lock submission', exact: true }).click();
  await page.getByRole('link', { name: 'Edit submission', exact: true }).waitFor({ state: 'detached' });
  const saved = (await records.docs[0].ref.get()).data(); assert(saved.locked); assert.equal(saved.media[0].id, record.media[0].id); assert.equal(saved.version, 3);
  checks.push('browser edit retains uploaded attachment and lock blocks further edits');
  assert.deepEqual(errors, []); await page.screenshot({ path: 'output/m04/student-live-browser.png', fullPage: true });
  writeReport('browser-live', { passed: true, origin: context.origin, displayId: record.displayId, checks, browserErrors: errors.length });
} catch {
  await page.screenshot({ path: 'output/m04/browser-live-failure.png', fullPage: true }).catch(() => {});
  writeReport('browser-live', { passed: false, origin: context.origin, checks, browserErrors: errors.length, failure: 'Live browser verification failed; inspect the ignored local screenshot. Credentials and upload URLs suppressed.' }); process.exitCode = 1;
} finally { await browser.close(); await context.db.terminate(); }
