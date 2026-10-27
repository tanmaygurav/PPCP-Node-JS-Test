import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
for (const path of [...readdirSync('src/m04').filter(f => f.endsWith('.mjs')).map(f => `src/m04/${f}`), 'api/m04.js', 'server-m04.mjs']) execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
