import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export const registry = JSON.parse(readFileSync(new URL('../milestones.json', import.meta.url)));
export const fixture = JSON.parse(readFileSync(new URL('../fixtures/m01/submission.json', import.meta.url)));
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64');
export class TestFailure extends Error { constructor(message) { super(message); this.safeMessage = message; } }
export function check(condition, safeMessage) { if (!condition) throw new TestFailure(safeMessage); }
export function parseArgs(args = process.argv.slice(2)) {
  const options = { milestone: 'M01', write: false, headed: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--target', '--milestone'].includes(arg)) {
      check(args[i + 1] && !args[i + 1].startsWith('--'), `${arg} requires a value.`);
      options[arg.slice(2)] = args[++i];
    } else if (arg === '--write') options.write = true;
    else if (arg === '--headed') options.headed = true;
    else throw new TestFailure('Unknown option. Use --target local|m01|https://host, --milestone M01, --write, or --headed.');
  }
  check(Boolean(registry[options.milestone]), 'Unknown milestone; register its schema and tests first.');
  return options;
}
export function normalizeTarget(input, milestone = 'M01', env = process.env) {
  check(Boolean(input), 'Select --target local, --target m01, or --target https://host explicitly.');
  const raw = input === 'local' ? env.APP_ORIGIN || 'http://localhost:3000' : input === 'm01' ? registry[milestone].url : input;
  let url; try { url = new URL(raw); } catch { throw new TestFailure('Target must be a valid origin.'); }
  check(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Target must be an origin without credentials, path, query, or fragment.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  check(input !== 'local' || local, 'The local alias cannot point to a remote APP_ORIGIN. Use an explicit deployed target instead.');
  check(url.protocol === 'https:' || (local && url.protocol === 'http:'), 'Remote targets must use HTTPS.');
  return { origin: url.origin, local };
}
export function liveConfig(options, env = process.env) {
  const target = normalizeTarget(options.target, options.milestone, env);
  const key = target.local ? env.TEST_LOCAL_ACCESS_KEY || env.TEST_ACCESS_KEY : env.TEST_TARGET_ACCESS_KEY;
  check(typeof key === 'string' && key.length >= 32, target.local ? 'Set the local test access key.' : 'Set TEST_TARGET_ACCESS_KEY explicitly for the deployed target.');
  return { ...target, key, milestone: options.milestone, baseline: registry[options.milestone], bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET || '' };
}
export function loadTestEnv() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (existsSync('.env.test.local')) process.loadEnvFile('.env.test.local');
}
function git(args) { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } }
export function createReport(kind, options, config) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const report = { version: 1, runId, kind, milestone: options.milestone || 'M01',
    runnerCommit: git(['rev-parse', 'HEAD']), runnerDirty: Boolean(git(['status', '--porcelain'])),
    expectedAppCommit: registry[options.milestone || 'M01'].appCommit, actualDeploymentCommit: null,
    target: config?.origin || 'offline', environment: config ? config.local ? 'local' : 'deployed' : 'offline',
    node: process.version, writeEnabled: Boolean(options.write), fixtureVersion: 1,
    startedAt: new Date().toISOString(), status: 'running', steps: [],
    artifacts: { submissionId: null, files: [], remark: null },
    cleanup: 'Retained. Use only this manifest for manual cleanup. An ambiguous timeout does not prove no write occurred.' };
  const directory = resolve('output/test-runs'); mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${kind}-${runId}.json`);
  const persist = () => writeFileSync(path, JSON.stringify(report, null, 2) + '\n'); persist();
  return { report, path, persist,
    async step(id, purpose, operation) {
      const entry = { id, purpose, status: 'running', startedAt: new Date().toISOString() };
      report.steps.push(entry); persist(); const start = performance.now();
      try { const value = await operation(entry); entry.status = 'passed'; return value; }
      catch (error) { entry.status = 'failed'; entry.failure = error.safeMessage || 'Unexpected failure; details suppressed to avoid leaking credentials or upload URLs.'; throw error; }
      finally { entry.durationMs = Math.round(performance.now() - start); persist(); console.log(`${id}: ${entry.status} (${entry.durationMs} ms)`); }
    },
    finish(success) { report.status = success ? 'passed' : 'failed'; report.finishedAt = new Date().toISOString(); persist(); console.log(`${report.status.toUpperCase()}: ${kind}; report ${path}`); }
  };
}
export function apiClient(config) {
  let cookie = '';
  const extraHeaders = config.bypass ? { 'x-vercel-protection-bypass': config.bypass } : {};
  return { async call(path, body, expectedStatus) {
    const response = await fetch(`${config.origin}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    check(response.headers.get('content-type')?.includes('application/json'), 'Expected JSON; check routing and deployment protection.');
    check(expectedStatus ? response.status === expectedStatus : response.ok, `API returned HTTP ${response.status}; inspect target configuration and permissions.`);
    return response.json();
  } };
}
