import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { createHandler } from '../src/app.mjs';
import { AppError } from '../src/domain.mjs';

// In-memory browser fixture. No Google access and no persisted uploads.
export async function startMockServer() {
  const config = { origin: '', secret: randomBytes(32).toString('hex') };
  const records = [], remarks = [], files = new Map();
  const store = {
    checks: async () => ({ spreadsheet: 'PPCP Test DB', folder: 'Media', tabs: ['Users', 'Responses', 'Remarks', 'Calculations'] }),
    activeDomains: async () => ['Education'], list: async () => [...records].reverse(),
    find: async id => records.find(item => item.id === id),
    createUploads: async (submissionId, items) => items.map(item => {
      const id = randomUUID(); files.set(id, { ...item, id, submissionId, received: 0 });
      return { ...item, id, uploadUrl: `${config.origin}/mock-drive/${id}` };
    }),
    verifyUploads: async (submissionId, items) => {
      for (const item of items) if (files.get(item.id)?.received !== item.size || files.get(item.id)?.submissionId !== submissionId) throw new AppError(409, 'Mock upload incomplete.');
      return items;
    },
    appendSubmission: async (id, data, items) => {
      const record = { ...data, id, media: items.map(item => ({ filename: item.name, fileId: item.id })) };
      records.push(record); return record;
    },
    remarks: async id => remarks.filter(item => item.submissionId === id),
    appendRemark: async (submissionId, givenBy, remark) => { const item = { submissionId, givenBy, remark }; remarks.push(item); return item; }
  };
  const api = createHandler(config, store);
  const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, config.origin).pathname;
    if (path.startsWith('/api/')) return api(req, res);
    if (path.startsWith('/mock-drive/')) {
      const file = files.get(path.split('/').pop());
      if (!file) { res.writeHead(404); return res.end(); }
      const range = req.headers['content-range'];
      if (range?.startsWith('bytes */')) {
        res.writeHead(file.received === file.size ? 200 : 308, file.received ? { Range: `bytes=0-${file.received - 1}` } : {}); return res.end();
      }
      let bytes = 0; for await (const chunk of req) bytes += chunk.length;
      file.received = bytes;
      res.writeHead(bytes === file.size ? 200 : 400, { 'Content-Type': 'application/json' }); return res.end('{}');
    }
    if (!assets[path]) { res.writeHead(404); return res.end(); }
    const [name, type] = assets[path];
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://www.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    res.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  config.origin = `http://127.0.0.1:${server.address().port}`;
  return { config, records, files, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
