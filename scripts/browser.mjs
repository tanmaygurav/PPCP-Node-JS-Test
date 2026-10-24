import { chromium } from 'playwright';
import { check, createReport, fixture, liveConfig, loadTestEnv, parseArgs, png, registry } from '../test-tools/runtime.mjs';
import { startMockServer } from '../test-tools/mock-server.mjs';

let mock, browser, log;
try {
  const raw = process.argv.slice(2), useMock = raw.includes('--mock');
  const options = parseArgs(raw.filter(arg => arg !== '--mock'));
  let config;
  if (useMock) {
    check(!options.target || options.target === 'local', 'Mock tests cannot target a deployed URL.');
    mock = await startMockServer();
    config = { origin: mock.config.origin, key: mock.config.secret, local: true, baseline: registry.M01 };
  } else { loadTestEnv(); config = liveConfig(options); }
  log = createReport(useMock ? 'browser-mock' : 'browser-live', options, config);
  browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext();
  // No tracing, HAR, storage-state, screenshots or raw Playwright errors: they can contain credentials.
  if (config.bypass) await context.route(`${config.origin}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': config.bypass } }));
  const page = await context.newPage(); page.setDefaultTimeout(60_000);
  let interrupted = false;
  if (useMock && options.write) await page.route('**/mock-drive/**', async route => {
    if (!interrupted && route.request().headers()['content-range']?.startsWith('bytes 0-')) { interrupted = true; return route.abort('failed'); }
    return route.continue();
  });
  const captures = [];
  page.on('response', response => {
    if (response.url() === `${config.origin}/api/upload-sessions` && response.ok()) captures.push((async () => {
      const plan = await response.json();
      log.report.artifacts.submissionId = plan.submissionId;
      log.report.artifacts.files = plan.uploads.map(item => ({ id: item.id, name: item.name, completed: false })); log.persist();
    })().catch(() => {}));
  });
  await log.step('M01-B01', 'Browser unlock and Google connection UI', async () => {
    await page.goto(config.origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#access-key').fill(config.key); await page.getByRole('button', { name: 'Unlock test API' }).click();
    await page.waitForFunction(() => document.getElementById('connection').textContent.includes('API unlocked'));
    await page.getByRole('button', { name: 'Check Google connection' }).click();
    await page.waitForFunction(() => document.getElementById('connection').textContent.includes('Connected:'));
    check((await page.locator('#connection').innerText()).includes(config.baseline.expectedSpreadsheetName), 'Browser connected to an unexpected test Sheet.');
    check(await page.locator('#domain option').count() > 0, 'No active domain loaded.');
  });
  if (options.write) {
    await log.step('M01-B02', 'Browser direct upload, submission and readback', async () => {
      const runId = log.report.runId;
      for (const field of ['name', 'email', 'studentId', 'program', 'description', 'solution']) await page.locator(`[name="${field}"]`).fill(fixture[field]);
      const title = `${fixture.title} ${runId}`;
      await page.locator('[name="title"]').fill(title);
      await page.locator('#files').setInputFiles(['a', 'b'].map(letter => ({ name: `ppcp-${runId}-${letter}.png`, mimeType: 'image/png', buffer: png })));
      await page.getByRole('button', { name: 'Upload and save', exact: true }).click();
      await page.waitForFunction(() => /^Saved:/.test(document.getElementById('progress').textContent), { }, { timeout: 120_000 });
      await page.locator('#detail h3').filter({ hasText: title }).waitFor(); await Promise.all(captures);
      check(await page.locator('#detail a').count() === 2, 'Expected two readback attachment links.');
      for (const file of log.report.artifacts.files) file.completed = true; log.persist();
      const remark = `Browser feedback ${runId}`;
      log.report.artifacts.remark = { submissionId: log.report.artifacts.submissionId, text: remark }; log.persist();
      await page.locator('#detail textarea').fill(remark); await page.getByRole('button', { name: 'Save remark', exact: true }).click();
      await page.locator('#detail p').filter({ hasText: remark }).waitFor();
    });
    if (useMock) await log.step('M01-B05', 'Interrupted upload resumes after status probe (mock only)', async () => check(interrupted, 'Expected a simulated interrupted upload.'));
  }
  await log.step('M01-B03', 'Oversized file is rejected before upload-session request', async () => {
    let uploads = 0;
    const count = request => { if (request.url() === `${config.origin}/api/upload-sessions`) uploads++; };
    page.on('request', count);
    // Supply valid metadata even in the default read-only run.
    for (const field of ['name', 'email', 'studentId', 'program', 'description']) await page.locator(`[name="${field}"]`).fill(fixture[field]);
    await page.locator('[name="title"]').fill('Synthetic oversize rejection');
    await page.locator('#files').setInputFiles({ name: 'oversize.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5_000_001) });
    await page.getByRole('button', { name: 'Upload and save', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('progress').textContent.includes('5 MB per file'));
    page.off('request', count); check(uploads === 0, 'Oversized file unexpectedly initiated an upload.');
  });
  await log.step('M01-B04', 'Browser logout removes API access', async () => {
    await page.getByRole('button', { name: 'Lock API' }).click();
    await page.waitForFunction(() => document.getElementById('connection').textContent.includes('API locked'));
    const response = await context.request.get(`${config.origin}/api/submissions`, { headers: config.bypass ? { 'x-vercel-protection-bypass': config.bypass } : {} });
    check(response.status() === 401 && response.headers()['content-type']?.includes('application/json'), 'Protected API did not reject the logged-out browser session.');
  });
  log.finish(true);
} catch (error) {
  if (log) log.finish(false);
  console.error(error.safeMessage || 'Browser test failed. Check the last failed step in output/test-runs; raw browser errors are suppressed.'); process.exitCode = 1;
} finally { await browser?.close(); await mock?.close(); }
