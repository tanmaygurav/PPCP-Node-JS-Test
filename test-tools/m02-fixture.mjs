import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createM02Handler } from '../src/m02/app.mjs';
import { AppError } from '../src/domain.mjs';

export async function m02Fixture(auth) {
  const config = { origin: '', secret: 'fixture-only-'.repeat(5), web: { apiKey: 'fake-key', projectId: 'demo-ppcp-m02', authDomain: 'demo-ppcp-m02.firebaseapp.com' }, emulator: '127.0.0.1:9099' };
  const profiles = new Map(), records = [], remarks = [];
  const store = {
    profile: async uid => { const item = profiles.get(uid); if (item && item.status !== 'active') throw new AppError(403, 'Account disabled.'); return item || null; },
    register: async (identity, data) => {
      if (!profiles.has(identity.uid)) profiles.set(identity.uid, { ...data, ...identity, role: 'student', status: 'active' });
      return profiles.get(identity.uid);
    },
    activeDomains: async () => ['Education'], checks: async () => ({ ok: true }),
    list: async () => records, find: async id => records.find(record => record.id === id),
    createUploads: async (id, files) => files.map(file => ({ ...file, id: randomUUID(), uploadUrl: 'https://www.googleapis.com/test-upload' })),
    verifyUploads: async (id, files) => files,
    appendSubmission: async (id, data, files) => { const record = { ...data, id, media: files.map(file => ({ fileId: file.id, filename: file.name })) }; records.push(record); return record; },
    remarks: async id => remarks.filter(item => item.submissionId === id),
    appendRemark: async (submissionId, givenBy, remark) => { const item = { submissionId, givenBy, remark }; remarks.push(item); return item; },
    download: async () => new Response('synthetic attachment')
  };
  const handler = createM02Handler(config, store, auth), root = resolve('dist-m02');
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) return handler(req, res);
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
    try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream' }); res.end(bytes); }
    catch { res.writeHead(404); res.end(); }
  }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  config.origin = `http://127.0.0.1:${server.address().port}`;
  async function call(path, data, cookie = '', headers = {}) {
    const response = await fetch(`${config.origin}/api/${path}`, { method: data === undefined ? 'GET' : 'POST',
      headers: { origin: config.origin, 'content-type': 'application/json', cookie, ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text() };
  }
  return { config, store, profiles, records, remarks, call, server, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
