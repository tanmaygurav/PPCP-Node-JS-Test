import { run } from 'node:test';
import { readdirSync } from 'node:fs';
import { createReport } from '../test-tools/runtime.mjs';

const log = createReport('offline', { milestone: 'M01' });
const files = readdirSync('test').filter(file => file.endsWith('.test.mjs')).map(file => `test/${file}`);
let failures = 0, count = 0;
try {
  for await (const event of run({ files, concurrency: 1 })) {
    if (!['test:pass', 'test:fail'].includes(event.type)) continue;
    const data = event.data;
    if (data.nesting !== 0) continue;
    const passed = event.type === 'test:pass'; count++; if (!passed) failures++;
    const id = data.name.match(/^(M01|TOOL)-[A-Z]\d+/)?.[0] || 'RUNNER';
    log.report.steps.push({ id, purpose: data.name, status: passed ? 'passed' : 'failed', durationMs: data.details?.duration_ms || 0,
      ...(!passed ? { failure: 'Offline assertion failed; rerun the test ID with node --test --test-name-pattern for detailed fixture-only output.' } : {}) });
    log.persist(); console.log(`${id}: ${passed ? 'passed' : 'failed'}`);
  }
  log.report.total = count; log.finish(count > 0 && failures === 0);
  if (!count || failures) process.exitCode = 1;
} catch { log.finish(false); process.exitCode = 1; }
