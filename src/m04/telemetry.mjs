import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
const storage = new AsyncLocalStorage(), instance = randomUUID(); let invocations = 0;
export async function span(name, work) {
  const context = storage.getStore(), start = performance.now();
  try { return await work(); } finally { if (context) { const value = context.spans[name] ||= { ms: 0, count: 0 }; value.ms += performance.now() - start; value.count++; } }
}
export function count(name, amount = 1) { const context = storage.getStore(); if (context) context.counts[name] = (context.counts[name] || 0) + amount; }
export function maximum(name, value) { const context = storage.getStore(); if (context) context.counts[name] = Math.max(context.counts[name] || 0, value); }
export function timingHeaders(res) {
  const context = storage.getStore(); if (!context || res.headersSent) return;
  res.setHeader('Server-Timing', [...Object.entries(context.spans).map(([name, value]) => `${name};dur=${value.ms.toFixed(1)}`), `handler;dur=${(performance.now() - context.start).toFixed(1)}`].join(', '));
  res.setHeader('X-M04-Observed-Ops',JSON.stringify(context.counts));
  if(process.env.VERCEL_GIT_COMMIT_SHA)res.setHeader('X-M04-Source',process.env.VERCEL_GIT_COMMIT_SHA);
  const cpu=process.cpuUsage(context.cpuStart);res.setHeader('X-M04-CPU-Us',String(cpu.user+cpu.system));
}
export function withTelemetry(req, res, work) {
  const run = /^[\w-]{1,100}$/.test(req.headers['x-m04-test-run'] || '') ? req.headers['x-m04-test-run'] : null;
  const context = { start: performance.now(), cpuStart:process.cpuUsage(), spans: {}, counts: {}, run };
  const firstObserved = invocations++ === 0;
  res.setHeader('X-M04-Instance', instance); res.setHeader('X-M04-First-Observed', String(firstObserved));
  return storage.run(context, async () => { try { return await work(); } finally {
    const route = new URL(req.url, 'http://localhost');
    const path = (route.searchParams.get('route') || route.pathname).replace(/[\w-]{20,}/g, ':id');
    console.log(JSON.stringify({ type: 'm04-timing', requestId: res.getHeader('X-Request-ID'), instance, firstObserved, run, method: req.method, path, status: res.statusCode, elapsedMs: +(performance.now() - context.start).toFixed(1), spans: context.spans, counts: context.counts }));
  } });
}
