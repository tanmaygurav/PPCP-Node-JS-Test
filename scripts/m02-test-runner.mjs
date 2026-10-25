import { run } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const suite = process.argv[2];
if (!['unit', 'emulator'].includes(suite)) throw new Error('Choose unit or emulator.');
if (suite === 'emulator' && !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run emulator tests through npm run test:m02:emulator.');
const files = suite === 'unit' ? ['test-m02/security.test.mjs', 'test-m02/store.test.mjs'] : ['test-m02/emulator.test.mjs'];
const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const report = { milestone: 'M02', schemaVersion: 2, suite, timestamp: new Date().toISOString(), node: process.version,
  runnerCommit: git(['rev-parse', 'HEAD']), runnerDirty: Boolean(git(['status', '--porcelain'])), steps: [], status: 'running' };
mkdirSync('output/test-runs', { recursive: true });
const path = `output/test-runs/m02-${suite}-${Date.now()}.json`;
let failures = 0;
for await (const event of run({ files, concurrency: 1 })) {
  if (!['test:pass', 'test:fail'].includes(event.type) || event.data.nesting !== 0) continue;
  const passed = event.type === 'test:pass'; if (!passed) failures++;
  const step = { id: event.data.name.split(' ')[0], purpose: event.data.name, status: passed ? 'passed' : 'failed', durationMs: event.data.details?.duration_ms };
  report.steps.push(step); console.log(`${step.purpose}: ${step.status}`);
  if (!passed) console.log(String(event.data.details?.error?.message || 'Rerun with node --test test-m02/<suite>.test.mjs for fixture-only details.').slice(0, 1500));
}
report.status = report.steps.length && !failures ? 'passed' : 'failed';
writeFileSync(path, JSON.stringify(report, null, 2)); console.log(`Sanitized report: ${path}`);
if (report.status !== 'passed') process.exitCode = 1;
