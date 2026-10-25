import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('dist-m03'), server = createServer(async (req, res) => {
  const path = resolve(root, `.${req.url === '/' ? '/index.html' : req.url}`);
  if (!path.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
  try { const bytes = await readFile(path); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream' }); res.end(bytes); } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ headless: true }), page = await browser.newPage();
let item = { id: 'fixture', ownerUid: 'owner', name: 'Synthetic owner', title: 'Original', domain: 'Education', description: 'Original observation', solution: '', timestamp: '2026-01-01T00:00:00.000Z', lastEdited: '', media: [] };
const requests = [], results = []; let outcome = 'conflict';
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname, payload = route.request().postDataJSON(); let status = 200, body;
  if (path === '/api/auth/config') body = { apiKey: 'fixture-public-key', authDomain: 'demo-ppcp-m03.firebaseapp.com', projectId: 'demo-ppcp-m03', appId: 'fixture' };
  else if (path === '/api/me') body = { identity: { uid: 'owner' }, profile: { name: 'Synthetic owner', role: 'student' } };
  else if (path === '/api/domains') body = { domains: ['Education'] };
  else if (path === '/api/submissions') body = { items: [item], total: 1 };
  else if (path.endsWith('/remarks')) body = { items: [{ remark: 'Existing faculty remark', givenBy: 'faculty@welingkar.org' }] };
  else if (path.endsWith('/edit-uploads')) { status = 201; body = { uploads: [], ticket: 'fixture-ticket' }; }
  else if (path.endsWith('/edits')) {
    requests.push(payload);
    if (outcome === 'conflict') { status = 409; body = { error: 'This pain point changed in another tab. Keep your draft.' }; item = { ...item, title: 'Other tab saved', lastEdited: '2026-10-25T10:00:00.000Z' }; }
    else if (outcome === 'lost') { status = 502; body = { error: 'Save outcome is uncertain. Keep your draft and retry the same operation.' }; outcome = 'saved'; }
    else { item = { ...item, title: payload.title, description: payload.description, lastEdited: '2026-10-25T10:01:00.000Z' }; body = { item }; }
  } else body = { item };
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.getByLabel('Edit title', { exact: true }).fill('My preserved draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('This pain point changed in another tab. Keep your draft.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Edit title', { exact: true }).inputValue(), 'My preserved draft');
  await page.getByRole('button', { name: 'Reload saved version, keep my text' }).click();
  await page.getByText('Loaded the current saved version.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Edit title', { exact: true }).inputValue(), 'My preserved draft');
  results.push({ name: 'UI01 conflict and reload preserve the student text draft', status: 'passed' });
  outcome = 'lost'; await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Save outcome is uncertain.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Check or retry this save' }).click();
  await page.getByText('Last edited:', { exact: false }).waitFor();
  assert.equal(requests.length, 3); assert.deepEqual(requests[1], requests[2]); assert.notEqual(requests[0].operationId, requests[1].operationId);
  assert.equal(await page.getByText('Existing faculty remark', { exact: false }).count(), 1);
  results.push({ name: 'UI02 lost response retries the same operation and preserves remarks', status: 'passed' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  results.push({ name: 'UI03 mobile viewport does not overflow horizontally', status: 'passed' });
  await mkdir('output/m03', { recursive: true }); await page.screenshot({ path: 'output/m03/editing-browser.png', fullPage: true });
} catch (error) { results.push({ name: 'browser verification', status: 'failed', error: error.name }); process.exitCode = 1; }
finally {
  await mkdir('output/m03', { recursive: true }); const path = `output/m03/browser-${Date.now()}.json`; await writeFile(path, JSON.stringify({ results, network: 'mocked; no Google/Firebase writes' }, null, 2)); console.log(JSON.stringify({ path, results }));
  await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
}
