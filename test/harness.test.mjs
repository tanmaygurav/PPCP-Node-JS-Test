import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveConfig, normalizeTarget, parseArgs, createReport } from '../test-tools/runtime.mjs';

test('TOOL-U01 target selection is explicit and remote HTTP/credential URLs are rejected', () => {
  for (const url of [undefined, 'http://example.com', 'https://user:secret@example.com', 'https://example.com/?token=x', 'https://example.com/path']) assert.throws(() => normalizeTarget(url));
  assert.equal(normalizeTarget('m01').origin, 'https://ppcp-node-js-test.vercel.app');
  assert.equal(normalizeTarget('local', 'M01', {}).origin, 'http://localhost:3000');
  assert.throws(() => normalizeTarget('local', 'M01', { APP_ORIGIN: 'https://example.com' }), /local alias/);
});
test('TOOL-U02 deployed tests cannot silently reuse a local key', () => {
  const options = parseArgs(['--target', 'm01']);
  assert.throws(() => liveConfig(options, { TEST_ACCESS_KEY: 'local-secret'.repeat(5) }), /TEST_TARGET_ACCESS_KEY/);
  assert.equal(liveConfig(options, { TEST_TARGET_ACCESS_KEY: 'remote-key'.repeat(5) }).local, false);
  const local = liveConfig(parseArgs(['--target', 'local']), { TEST_ACCESS_KEY: 'local-secret'.repeat(5), TEST_TARGET_ACCESS_KEY: 'remote-key'.repeat(5) });
  assert.equal(local.key, 'local-secret'.repeat(5));
  assert.throws(() => parseArgs(['--milestone', 'UNKNOWN']));
  assert.throws(() => parseArgs(['--target']));
});
test('TOOL-U03 writes are opt-in and report serialization excludes raw errors and credentials', async () => {
  assert.equal(parseArgs(['--target', 'm01']).write, false);
  assert.equal(parseArgs(['--target', 'm01', '--write']).write, true);
  const report = createReport('harness-selftest', { milestone: 'M01' }, { origin: 'https://example.com', key: 'never-log-this-key', bypass: 'never-log-this-bypass' });
  await assert.rejects(report.step('selftest', 'Intentional failure', async () => { throw new Error('never-log-this-raw-url?token=secret'); }));
  report.finish(false);
  const saved = readFileSync(report.path, 'utf8');
  assert.ok(!saved.includes('never-log-this')); assert.equal(JSON.parse(saved).status, 'failed');
});
