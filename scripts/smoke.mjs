import { randomUUID } from 'node:crypto';
import { loadLocalEnv, readConfig } from '../src/config.mjs';

loadLocalEnv();
const config = readConfig();
let cookie = '';
async function api(path, body) {
  const started = performance.now();
  const response = await fetch(`${config.origin}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const result = await response.json();
  console.log(`${body === undefined ? 'GET' : 'POST'} ${path}: ${response.status}, ${Math.round(performance.now() - started)} ms`);
  if (!response.ok) throw new Error(result.error || 'API request failed');
  return result;
}
try {
  await api('/health');
  await api('/session', { accessKey: config.secret });
  const checks = await api('/checks');
  console.log(`Sheet: ${checks.spreadsheet}; folder: ${checks.folder}`);
  const { domains } = await api('/domains');
  console.log(`Active domains: ${domains.length}`);
  if (process.argv.includes('--write')) {
    if (!domains.length) throw new Error('Add a test domain in Calculations!C2 before the write test.');
    // Valid 1x1 PNG; intentionally synthetic, with no real student information.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64');
    const suffix = randomUUID().slice(0, 8);
    const files = ['a', 'b'].map(letter => ({ name: `ppcp-smoke-${suffix}-${letter}.png`, size: png.length }));
    const plan = await api('/upload-sessions', { files });
    for (const upload of plan.uploads) {
      const response = await fetch(upload.uploadUrl, {
        method: 'PUT', signal: AbortSignal.timeout(60_000), headers: {
          Origin: config.origin, 'Content-Type': upload.mimeType, 'Content-Range': `bytes 0-${png.length - 1}/${png.length}`
        }, body: png
      });
      console.log(`Drive upload ${upload.name}: ${response.status}; CORS origin: ${response.headers.get('access-control-allow-origin') || '(not exposed)'}`);
      if (!response.ok) throw new Error('Upload failed; no Sheet row was written. Inspect the test Media folder.');
    }
    const body = { ticket: plan.ticket, email: 'prototype@example.com', name: 'Synthetic test operator',
      studentId: 'TEST-ONLY', program: 'Integration test', domain: domains[0], title: `Node integration smoke ${suffix}`,
      description: 'Synthetic local Node to Google Sheets and Drive integration test. Safe to remove after review.', solution: 'Validate migration feasibility.' };
    const saved = await api('/submissions', body);
    console.log(`Saved submission: ${saved.item.id}`);
    const repeated = await api('/submissions', body);
    if (!repeated.alreadySaved || repeated.item.id !== saved.item.id) throw new Error('Sequential retry did not return the same record.');
    const detail = await api(`/submissions/${saved.item.id}`);
    if (detail.item.media.length !== 2 || detail.item.description !== body.description) throw new Error('Readback did not match the submitted data.');
    await api(`/submissions/${saved.item.id}/remarks`, { remark: 'Synthetic integration feedback.' });
    const remarks = await api(`/submissions/${saved.item.id}/remarks`);
    if (!remarks.items.some(item => item.remark === 'Synthetic integration feedback.')) throw new Error('Remark readback failed.');
    console.log('PASS: two uploaded files, submission readback, sequential save retry, and remark readback. Test artifacts were retained for inspection.');
  } else {
    await api('/submissions?limit=1');
    console.log('Read-only smoke passed. Add --write to create one synthetic submission, two small PNGs and one remark.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
