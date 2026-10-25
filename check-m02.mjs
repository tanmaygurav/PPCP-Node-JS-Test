import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Deployment validation must reference only files shipped by .vercelignore.
const files = ['server-m02.mjs', 'api/m02.js', 'api/index.js', 'src/google.mjs', 'src/domain.mjs', 'src/security.mjs',
  ...readdirSync('src/m02').filter(file => file.endsWith('.mjs')).map(file => `src/m02/${file}`)];
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status || 1);
}
