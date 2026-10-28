import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import api from './api/m04.js';
import { loadM04Env, m04Config } from './src/m04/config.mjs';
import { isPortalPath } from './m04-web/navigation.mjs';
loadM04Env(); const config = m04Config(), root = resolve('dist-m04');
createServer(async (req, res) => {
  const url = new URL(req.url, config.origin);
  if (url.pathname.startsWith('/api/')) return api(req, res);
  const file = resolve(root, `.${isPortalPath(url.pathname) ? '/index.html' : url.pathname}`);
  if (!file.startsWith(root + sep) || req.method !== 'GET') { res.writeHead(404); return res.end(); }
  try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(bytes); }
  catch { res.writeHead(404); res.end('Build the M04 interface first.'); }
}).listen(Number(process.env.PORT || new URL(config.origin).port || 3005), '127.0.0.1', () => console.log(`M04: ${config.origin}`));
