import { execFileSync } from 'node:child_process';
for (const file of ['src/m03/config.mjs', 'src/m03/store.mjs', 'src/m03/coordination.mjs', 'src/m03/create.mjs', 'src/m03/metrics.mjs', 'src/m03/app.mjs', 'api/m03.js']) execFileSync(process.execPath, ['--check', file]);
