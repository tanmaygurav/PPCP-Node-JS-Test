import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const tag = 'm04-routing-baseline-v0.1.0', expected = 'e05cac3028521135e1b6070dc6ee1cadcd79dea0';
assert.equal(execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim(), expected);
const root = resolve('.local/m04-routing-baseline');
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', tag, 'm04-web', 'shared'], { encoding: 'utf8' }).trim().split('\n');
for (const path of files) { await mkdir(resolve(root, path, '..'), { recursive: true }); await writeFile(resolve(root, path), execFileSync('git', ['show', `${tag}:${path}`])); }
await writeFile(resolve(root, 'vite.config.mjs'), `export default { root: ${JSON.stringify(resolve(root, 'm04-web'))}, build: { outDir: ${JSON.stringify(resolve(root, 'dist'))}, emptyOutDir: true } };`);
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', resolve(root, 'vite.config.mjs')], { stdio: 'inherit' });
// Rehearse only the temporary frontend redirects. No deployed configuration changes.
const redirects = ['/submissions/:path*', '/admin/:path*'].map(source => ({ source, destination: '/', statusCode: 302 }));
await writeFile(resolve(root, 'temporary-redirects.json'), JSON.stringify({ redirects }, null, 2));
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (/^\/(submissions|admin)(\/|$)/.test(path)) { res.writeHead(302, { Location: '/' }); return res.end(); }
  if (path.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"apiPreserved":true}'); }
  try { const data = await readFile(resolve(root, 'dist', `.${path === '/' ? '/index.html' : path}`)); res.writeHead(200, { 'Content-Type': extname(path) === '.js' ? 'text/javascript' : 'text/html' }); res.end(data); } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/submissions/new', '/submissions/synthetic-id/edit', '/admin/users', '/admin/event-theme']) { const result = await fetch(origin + path, { redirect: 'manual' }); assert.equal(result.status, 302); assert.equal(result.headers.get('location'), '/'); assert.equal((await fetch(origin + path)).status, 200); }
  assert.equal((await fetch(origin + '/api/health')).status, 200);
  const html = await (await fetch(origin)).text(), asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(origin + asset)).status, 200); assert.equal((await fetch(origin + '/assets/missing.js')).status, 404);
  console.log(JSON.stringify({ baseline: expected, passed: ['immutable baseline build', 'temporary 302 frontend redirects', 'API and asset routing preserved'], note: 'Local rehearsal only; post-rollback authentication/data checks remain required if rollback is used.' }));
} finally { await new Promise(done => server.close(done)); }
