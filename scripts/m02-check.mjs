import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = ['server-m02.mjs', 'api/m02.js', 'api/index.js', ...readdirSync('scripts').filter(x => x.startsWith('m02-') && x.endsWith('.mjs')).map(x => `scripts/${x}`), ...readdirSync('src/m02').filter(x => x.endsWith('.mjs')).map(x => `src/m02/${x}`)];
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status || 1);
}
