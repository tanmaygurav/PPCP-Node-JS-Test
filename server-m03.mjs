import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import api from './api/m03.js';
import { loadM03Env, m03Config } from './src/m03/config.mjs';
loadM03Env(); const config = m03Config(), root = resolve('dist-m03');
createServer(async (req, res) => {
  const url = new URL(req.url, config.origin);
  if (url.pathname.startsWith('/api/')) return api(req, res);
  const file = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!file.startsWith(root + sep) || req.method !== 'GET') { res.writeHead(404); return res.end(); }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Build the M03 interface first.'); }
}).listen(Number(process.env.PORT || new URL(config.origin).port), '127.0.0.1', () => console.log(`${config.checkpoint}: ${config.origin}`));
