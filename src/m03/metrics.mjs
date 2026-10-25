import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
export function measuredFetch(provider) {
  return async (...args) => {
    const metrics = context.getStore(), start = performance.now();
    if (metrics) metrics[`${provider}Requests`]++;
    try {
      const response = await fetch(...args);
      if (metrics && response.status === 429) metrics.quotaResponses++;
      return response;
    } finally { if (metrics) metrics.upstreamMs += performance.now() - start; }
  };
}
export function measure(handler) {
  return (req, res) => {
    const metrics = { googleRequests: 0, redisRequests: 0, quotaResponses: 0, upstreamMs: 0 }, start = performance.now();
    const original = res.writeHead;
    res.writeHead = function (...args) {
      res.setHeader('X-M03-Google-Requests', metrics.googleRequests);
      res.setHeader('X-M03-Redis-Requests', metrics.redisRequests);
      res.setHeader('X-M03-Quota-Responses', metrics.quotaResponses);
      res.setHeader('X-M03-RSS-Bytes', process.memoryUsage().rss);
      res.setHeader('Server-Timing', `app;dur=${(performance.now() - start).toFixed(1)}, upstream;dur=${metrics.upstreamMs.toFixed(1)}`);
      return original.apply(this, args);
    };
    return context.run(metrics, () => handler(req, res));
  };
}
