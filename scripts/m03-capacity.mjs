import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { M03Store } from '../src/m03/store.mjs';

loadM03Env(); const config = m03Config();
const arg = (key, fallback) => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const users = Number(arg('users', '5')), scenario = arg('scenario', 'burst'), dataset = Number(arg('dataset', '1200'));
const target = arg('target', `https://ppcp-m03-${config.checkpoint.slice(-1).toLowerCase()}-test.vercel.app`);
const approved = [`https://ppcp-m03-${config.checkpoint.slice(-1).toLowerCase()}-test.vercel.app`, config.checkpoint === 'M03-A' ? 'http://localhost:3003' : 'http://localhost:3004'];
if (!approved.includes(target) || ![5, 10, 20, 60].includes(users) || !['burst', 'classroom'].includes(scenario) || ![1200, 3000].includes(dataset)) throw new Error('Unapproved test parameters.');
if (!process.argv.includes('--write')) throw new Error('Use --write to create labelled synthetic test records and 1 MB files.');
const pool = JSON.parse(readFileSync('.local/m03-accounts.json', 'utf8')).accounts.slice(0, users);
if (pool.length !== users || pool.some(account => !account.uid.startsWith('m03-') || account.role !== 'student')) throw new Error('Synthetic student pool required.');
const store = new M03Store(config), before = await store.list();
if (before.filter(item => item.id.startsWith('m03-seed-')).length < dataset) throw new Error('Seed the selected dataset first.');
const runId = `m03-${Date.now()}`, samples = [], saves = [];
let stopped = false, stopReason = null, consecutive = 0, quotaTimes = [], completedUsers = 0;
const stop = reason => { if (!stopped) console.log(`Circuit breaker: ${reason}. No new requests will be scheduled.`); stopped = true; stopReason ||= reason; };
function record(operation, start, response, bytes = 0) {
  const quota = Number(response?.headers.get('x-m03-quota-responses') || 0);
  for (let i = 0; i < quota; i++) quotaTimes.push(Date.now());
  quotaTimes = quotaTimes.filter(time => Date.now() - time <= 30000);
  const ok = response?.ok || false;
  consecutive = ok ? 0 : consecutive + 1;
  samples.push({ operation, ms: +(performance.now() - start).toFixed(1), status: response?.status || 0, bytes,
    googleRequests: Number(response?.headers.get('x-m03-google-requests') || 0), redisRequests: Number(response?.headers.get('x-m03-redis-requests') || 0), quotaResponses: quota, rssBytes: Number(response?.headers.get('x-m03-rss-bytes') || 0) });
  if (consecutive >= 10) stop('ten consecutive unexpected failures');
  if (quotaTimes.length >= 10) stop('ten upstream quota responses within 30 seconds');
}
async function call(account, operation, path, data) {
  if (stopped) throw new Error('Scheduling stopped');
  const start = performance.now(); let response;
  try {
    response = await fetch(`${target}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { cookie: account.cookie || '', origin: target, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(65000) });
    if (operation === 'download') { const bytes = new Uint8Array(await response.arrayBuffer()); record(operation, start, response, bytes.length); if (!response.ok || bytes.length !== 1000000) throw new Error('Download failed or size mismatch'); return bytes; }
    const result = await response.json(); record(operation, start, response);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (operation === 'session') account.cookie = response.headers.get('set-cookie')?.split(';')[0];
    return result;
  } catch (error) { if (!response) record(operation, start, null); throw error; }
}
// Establish authentication before the arrival window. Passwords/tokens/cookies
// remain in memory or ignored fixtures and never enter evidence JSON.
for (const account of pool) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.web.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }), signal: AbortSignal.timeout(20000) });
  const result = await response.json(); if (!response.ok) throw new Error(`Synthetic sign-in failed: HTTP ${response.status}`);
  await call(account, 'session', 'auth/session', { idToken: result.idToken });
}
samples.length = 0; consecutive = 0;
const startedAt = new Date().toISOString(), start = performance.now(), duration = scenario === 'classroom' ? 600000 : 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const attachment = new Uint8Array(1000000); attachment.set(new TextEncoder().encode('%PDF-1.4\n% Synthetic M03 capacity fixture\n'));
async function student(account, index) {
  await sleep(users === 1 ? 0 : index * (5000 / users));
  let cycle = 0;
  do {
    if (stopped) return;
    try {
      await call(account, 'browse', 'submissions');
      if (scenario === 'classroom') await sleep(15000 + Math.random() * 15000);
      if (stopped || (duration && performance.now() - start > duration)) return;
      const upload = await call(account, 'upload-session', 'upload-sessions', { files: [{ name: `${runId}-${index}-${cycle}.pdf`, size: attachment.length }] });
      const uploadStart = performance.now(); let response;
      try {
        if (stopped) return;
        response = await fetch(upload.uploads[0].uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: attachment, signal: AbortSignal.timeout(60000) });
        await response.arrayBuffer(); record('upload-transfer', uploadStart, response, attachment.length);
        if (!response.ok) throw new Error('Upload failed');
      } catch (error) { if (!response) record('upload-transfer', uploadStart, null); throw error; }
      const payload = { title: `${runId} synthetic ${index}/${cycle}`, domain: 'Education', description: 'Synthetic capacity observation.', solution: 'Synthetic improvement.', ticket: upload.ticket, operationId: randomUUID() };
      const saved = { id: upload.submissionId, uid: account.uid, operationId: payload.operationId, expectedTitle: payload.title, state: 'pending' }; saves.push(saved);
      const result = await call(account, 'create', 'submissions', payload); saved.state = 'confirmed';
      if (scenario === 'classroom') await sleep(15000 + Math.random() * 15000);
      if (stopped || (duration && performance.now() - start > duration)) return;
      await call(account, 'download', `submissions/${saved.id}/files/${upload.uploads[0].id}`);
      if (config.checkpoint === 'M03-B') {
        if (scenario === 'classroom') await sleep(15000 + Math.random() * 15000);
        if (stopped || (duration && performance.now() - start > duration)) return;
        const edit = { title: `${payload.title} edited`, domain: payload.domain, description: payload.description, solution: payload.solution, retainedFileIds: [upload.uploads[0].id], expectedLastEdited: result.item.lastEdited || '', operationId: randomUUID() };
        saved.editOperationId = edit.operationId; saved.editState = 'pending';
        const edited = await call(account, 'edit', `submissions/${saved.id}/edits`, edit);
        saved.editState = 'confirmed'; saved.expectedTitle = edit.title; saved.lastEdited = edited.item.lastEdited;
      }
      completedUsers++; cycle++;
      if (scenario === 'classroom') await sleep(15000 + Math.random() * 15000);
    } catch { if (scenario !== 'classroom') return; await sleep(15000 + Math.random() * 15000); }
  } while (!stopped && duration && performance.now() - start < duration);
}
const progress = setInterval(() => console.log(JSON.stringify({ runId, seconds: Math.round((performance.now() - start) / 1000), requests: samples.length, errors: samples.filter(sample => sample.status >= 400 || !sample.status).length, completedCycles: completedUsers, stopped })), 15000);
await Promise.all(pool.map(student)); clearInterval(progress);
const elapsedMs = performance.now() - start;
// Let the shared per-minute Sheets quota refill before read-only reconciliation.
if (samples.some(sample => sample.quotaResponses)) { console.log('Waiting 65 seconds for quota refill before reconciliation.'); await sleep(65000); }
let integrity;
try {
  const after = await store.list();
  const duplicates = after.length - new Set(after.map(item => item.id)).size;
  integrity = { duplicates, created: saves.length, missing: [], mismatches: [], pending: [] };
  for (const save of saves) {
    const item = after.find(item => item.id === save.id);
    if (!item) { if (save.state === 'confirmed') integrity.missing.push(save.id); else integrity.pending.push(save.id); continue; }
    if (item.ownerUid !== save.uid || (save.state === 'confirmed' && save.editState !== 'pending' && item.title !== save.expectedTitle) || item.media.length !== 1) integrity.mismatches.push(save.id);
    if (save.editState === 'pending') integrity.pending.push(save.id);
    save.reconciled = true;
  }
} catch { integrity = { reconciliationFailed: true }; }
const percentile = (list, p) => list[Math.min(list.length - 1, Math.ceil(list.length * p) - 1)] || 0;
const operations = Object.fromEntries([...new Set(samples.map(sample => sample.operation))].map(operation => {
  const rows = samples.filter(sample => sample.operation === operation), times = rows.map(row => row.ms).sort((a, b) => a - b);
  return [operation, { count: rows.length, errors: rows.filter(row => !row.status || row.status >= 400).length, medianMs: percentile(times, .5), p95Ms: percentile(times, .95), maxMs: times.at(-1) }];
}));
const report = { runId, checkpoint: config.checkpoint, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), target, dataset, users, scenario, startedAt, elapsedMs, stopped, stopReason, completedCycles: completedUsers, requestsPerSecond: samples.length / (elapsedMs / 1000), googleRequests: samples.reduce((n, s) => n + s.googleRequests, 0), redisRequests: samples.reduce((n, s) => n + s.redisRequests, 0), quotaResponses: samples.reduce((n, s) => n + s.quotaResponses, 0), maxRssBytes: Math.max(0, ...samples.map(s => s.rssBytes)), operations, integrity, samples, saves,
  limitations: ['API-driven authenticated workload; browser rendering excluded.', 'Firebase Admin SDK network calls and provider billing usage are not included in upstream header counts.', 'GET retries are included in Google request counts; individual retry counts are not yet separated.', 'Interrupted or unscheduled work is not a completed user cycle. No latency acceptance target has been applied.'] };
mkdirSync('output/m03', { recursive: true }); writeFileSync(`output/m03/${runId}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: `output/m03/${runId}.json`, operations, stopped, stopReason, integrity }));
if (stopped || integrity.reconciliationFailed || integrity.duplicates || integrity.missing?.length || integrity.mismatches?.length || integrity.pending?.length) process.exitCode = 1;
