import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { environment, client, writeReport } from './m04-test-support.mjs';
if (!process.argv.includes('--write')) throw new Error('Changing an event theme for verification requires --write.');
const context = await environment(), checks = [], pool = JSON.parse(readFileSync('.local/m04-accounts.json', 'utf8'));
let admin, before, applied, browser;
async function publicAppearance() { const response = await fetch(`${context.origin}/api/appearance`, { signal: AbortSignal.timeout(30000) }); if (!response.ok) throw new Error('Public appearance read failed.'); return (await response.json()).appearance; }
try {
  if (pool.projectId !== context.config.projectId) throw new Error('M04 fixture project mismatch.');
  admin = await client(context, pool.admin); const student = await client(context, pool.students[0]);
  before = await publicAppearance(); assert.deepEqual(Object.keys(before).sort(), ['theme', 'updatedAt', 'version']);
  const data = { theme: before.theme === 'festival' ? 'conference' : 'festival', expectedVersion: before.version, operationId: randomUUID() };
  await student.api('admin/appearance', data, 403); checks.push('student cannot change the site-wide event theme');
  applied = await admin.api('admin/appearance', data); assert.equal(applied.appearance.theme, data.theme);
  const retried = await admin.api('admin/appearance', data); assert.equal(retried.version, applied.version); assert.deepEqual(retried.appearance, applied.appearance);
  const observed = await publicAppearance(); assert.equal(observed.theme, data.theme); assert.equal(observed.version, applied.version); checks.push('admin selection persists and exact retry does not rewrite the setting');
  await mkdir('output/m04', { recursive: true }); browser = await chromium.launch({ headless: true });
  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await anonymous.newPage(), errors = [];
  page.on('pageerror', () => errors.push('Uncaught browser error'));
  await page.goto(context.origin); await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, data.theme);
  assert.equal(await page.getByRole('link', { name: 'Event theme', exact: true }).count(), 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
  await page.screenshot({ path: 'output/m04/theme-live-login.png', fullPage: true }); checks.push('anonymous mobile login applies the saved theme under deployed CSP without overflow');
  await browser.close(); browser = null;
} catch { writeReport('theme-live', { passed: false, origin: context.origin, checks, failure: 'Live theme verification failed; sensitive response details suppressed.' }); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (admin && before && applied) {
    try {
      const current = await publicAppearance();
      // Never overwrite a theme selected by another administrator during a test.
      if (current.version === applied.version && current.theme === applied.appearance.theme) {
        await admin.api('admin/appearance', { theme: before.theme, expectedVersion: current.version, operationId: randomUUID() }); checks.push('original event palette restored after verification');
      } else checks.push('a newer administrator selection was preserved');
    } catch { process.exitCode = 1; checks.push('theme restoration requires review'); }
  }
  if (!process.exitCode) writeReport('theme-live', { passed: true, origin: context.origin, checks });
  await context.db.terminate();
}
