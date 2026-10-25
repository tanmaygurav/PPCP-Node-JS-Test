import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { loadM02Env, m02Config } from './src/m02/config.mjs';
import { firebaseAuth } from './src/m02/auth.mjs';
import { M02Store } from './src/m02/store.mjs';
import { createM02Handler } from './src/m02/app.mjs';
loadM02Env();
const config = m02Config(), handler = createM02Handler(config, new M02Store(config), firebaseAuth(config));
const root = resolve('dist-m02');
createServer(async (req, res) => {
  const url = new URL(req.url, config.origin);
  if (url.pathname.startsWith('/api/')) return handler(req, res);
  const file = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!file.startsWith(root + sep) || req.method !== 'GET') { res.writeHead(404); return res.end(); }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Build the M02 interface with npm run build:m02.'); }
}).listen(Number(process.env.PORT || 3002), '127.0.0.1', () => console.log(`M02: ${config.origin}`));
