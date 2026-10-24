import { randomUUID } from 'node:crypto';
import { AppError, text, validateFiles, validateSubmission } from './domain.mjs';
import { cookie, equal, session, sign, verify } from './security.mjs';

const JSON_LIMIT = 96_000;
async function readBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new AppError(415, 'Send application/json.');
  if (Number(req.headers['content-length']) > JSON_LIMIT) throw new AppError(413, 'Metadata request is too large. Upload file bytes directly to Drive.');
  // Vercel may parse JSON before invoking the handler.
  if (req.body !== undefined) {
    const value = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(value) > JSON_LIMIT) throw new AppError(413, 'Metadata request is too large.');
    try { return objectBody(JSON.parse(value)); } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'Malformed JSON.');
    }
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw new AppError(413, 'Metadata request is too large.');
    chunks.push(chunk);
  }
  try { return objectBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, 'Malformed JSON.'); }
}
function objectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Expected a JSON object.');
  return body;
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function createHandler(config, store) {
  return async function handler(req, res) {
    const requestId = randomUUID();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-ID', requestId);
    try {
      const url = new URL(req.url, config.origin);
      const rewrittenRoute = url.searchParams.get('route');
      const path = (rewrittenRoute ? `/api/${rewrittenRoute}` : url.pathname).replace(/\/$/, '');
      const method = req.method;
      if (!['GET', 'POST'].includes(method)) throw new AppError(405, 'Method not allowed.');
      if (method === 'POST' && req.headers.origin !== config.origin) throw new AppError(403, 'Request origin is not allowed.');
      if (path === '/api/health' && method === 'GET') return json(res, 200, { ok: true, prototype: true });
      if (path === '/api/session' && method === 'POST') {
        const body = await readBody(req);
        if (!equal(body.accessKey || '', config.secret)) throw new AppError(401, 'Invalid test access key.');
        const token = sign(config.secret, { kind: 'session', exp: Date.now() + 8 * 60 * 60 * 1000 });
        res.setHeader('Set-Cookie', cookie(config, token));
        return json(res, 200, { ok: true });
      }
      session(req, config);
      if (path === '/api/logout' && method === 'POST') {
        res.setHeader('Set-Cookie', cookie(config, '', 0)); return json(res, 200, { ok: true });
      }
      if (path === '/api/checks' && method === 'GET') return json(res, 200, await store.checks());
      if (path === '/api/domains' && method === 'GET') return json(res, 200, { domains: await store.activeDomains() });
      if (path === '/api/submissions' && method === 'GET') {
        const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit'), 10) || 20));
        const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset'), 10) || 0);
        const all = await store.list();
        return json(res, 200, { items: all.slice(offset, offset + limit).map(({ description, solution, ...item }) => item), total: all.length });
      }
      if (path === '/api/upload-sessions' && method === 'POST') {
        const body = await readBody(req);
        const files = validateFiles(body.files);
        const submissionId = randomUUID();
        const uploads = await store.createUploads(submissionId, files);
        const ticket = sign(config.secret, { kind: 'upload', exp: Date.now() + 2 * 60 * 60 * 1000,
          submissionId, files: uploads.map(({ uploadUrl, ...file }) => file) });
        return json(res, 201, { submissionId, ticket, uploads });
      }
      if (path === '/api/submissions' && method === 'POST') {
        const body = await readBody(req);
        const plan = verify(config.secret, body.ticket, 'upload');
        const data = validateSubmission(body);
        const existing = await store.find(plan.submissionId);
        if (existing) return json(res, 200, { item: existing, alreadySaved: true });
        const domains = await store.activeDomains();
        if (!domains.includes(data.domain)) throw new AppError(400, 'Choose a domain from Calculations column C.');
        const verified = await store.verifyUploads(plan.submissionId, plan.files);
        const item = await store.appendSubmission(plan.submissionId, data, verified);
        return json(res, 201, { item });
      }
      const detail = path.match(/^\/api\/submissions\/([a-zA-Z0-9_-]{1,100})(\/remarks)?$/);
      if (detail) {
        const id = detail[1];
        const item = await store.find(id);
        if (!item) throw new AppError(404, 'Submission not found.');
        if (!detail[2] && method === 'GET') return json(res, 200, { item });
        if (detail[2] && method === 'GET') return json(res, 200, { items: await store.remarks(id) });
        if (detail[2] && method === 'POST') {
          const body = await readBody(req);
          // Single operator test identity; never accept an arbitrary feedback author.
          const item = await store.appendRemark(id, 'Prototype operator', text(body.remark, 'Remark', 5000));
          return json(res, 201, { item });
        }
      }
      throw new AppError(404, 'Endpoint not found.');
    } catch (error) {
      const status = error instanceof AppError ? error.status : 502;
      const message = error instanceof AppError ? error.message : 'Operation could not complete. Check connectivity and saved records before retrying.';
      // Do not log request bodies, OAuth errors, file session URLs, or credential material.
      console.error(JSON.stringify({ requestId, status, type: error.name }));
      json(res, status, { error: message, requestId });
    }
  };
}
