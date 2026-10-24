import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadLocalEnv, readConfig } from './src/config.mjs';
import { createHandler } from './src/app.mjs';
import { GoogleStore } from './src/google.mjs';

loadLocalEnv();
const config = readConfig();
const handler = createHandler(config, new GoogleStore(config));
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, config.origin).pathname;
  if (path.startsWith('/api/')) return handler(req, res);
  if (!assets[path] || req.method !== 'GET') { res.writeHead(404); return res.end('Not found'); }
  const [file, type] = assets[path];
  try {
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://www.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
  } catch { res.end('Static file unavailable'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`PPCP integration prototype: ${config.origin}`));
