import { run } from 'node:test';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const results = [], files = readdirSync('test-m03').filter(file => file.endsWith('.test.mjs')).map(file => `test-m03/${file}`);
for await (const event of run({ files, concurrency: 1, isolation: 'process' })) {
  if (!['test:pass', 'test:fail'].includes(event.type)) continue;
  const status = event.type === 'test:pass' ? 'passed' : 'failed';
  results.push({ name: event.data.name, status, ms: event.data.details.duration_ms });
  console.log(`${event.data.name}: ${status}`);
}
mkdirSync('output/m03', { recursive: true }); const path = `output/m03/unit-${Date.now()}.json`;
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version, results };
writeFileSync(path, JSON.stringify(report, null, 2)); console.log(`Sanitized report: ${path}`);
if (!results.length || results.some(result => result.status !== 'passed')) process.exitCode = 1;
