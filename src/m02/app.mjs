import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError, text, validateFiles, validateSubmission } from '../domain.mjs';
import { sign, verify } from '../security.mjs';
import { allowedIdentity, authenticate, sessionCookie, SESSION_SECONDS } from './auth.mjs';

async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new AppError(415, 'Send application/json.');
  let raw;
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    let length = 0; const chunks = [];
    for await (const chunk of req) { length += chunk.length; if (length > 96000) throw new AppError(413, 'Request too large.'); chunks.push(chunk); }
    raw = Buffer.concat(chunks).toString();
  }
  if (Buffer.byteLength(raw) > 96000) throw new AppError(413, 'Request too large.');
  try { const data = JSON.parse(raw); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
  catch { throw new AppError(400, 'Expected a JSON object.'); }
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function publicItem(item) {
  return { ...item, media: item.media.map(file => ({ filename: file.filename,
    downloadUrl: `/api/submissions/${encodeURIComponent(item.id)}/files/${encodeURIComponent(file.fileId)}` })) };
}
export function createM02Handler(config, store, auth) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const requestId = randomUUID(); res.setHeader('X-Request-ID', requestId);
    try {
      const url = new URL(req.url, config.origin);
      const path = url.searchParams.has('route') ? `/api/${url.searchParams.get('route')}` : url.pathname;
      const method = req.method;
      if (!['GET', 'POST'].includes(method)) throw new AppError(405, 'Method not allowed.');
      if (method === 'POST' && req.headers.origin !== config.origin) throw new AppError(403, 'Request origin is not allowed.');
      if (path === '/api/health' && method === 'GET') return send(res, 200, { ok: true, milestone: 'M02' });
      if (path === '/api/auth/config' && method === 'GET') return send(res, 200, { ...config.web, emulator: config.emulator ? `http://${config.emulator}` : null });
      if (path === '/api/auth/session' && method === 'POST') {
        const data = await body(req);
        let decoded;
        try { decoded = await auth.verifyIdToken(text(data.idToken, 'ID token', 20000), true); }
        catch { throw new AppError(401, 'Sign in again to start a session.'); }
        allowedIdentity(decoded);
        if (!Number.isFinite(decoded.auth_time) || Date.now() / 1000 - decoded.auth_time > 300) throw new AppError(401, 'A recent sign-in is required.');
        const token = await auth.createSessionCookie(data.idToken, { expiresIn: SESSION_SECONDS * 1000 });
        res.setHeader('Set-Cookie', sessionCookie(config, token)); return send(res, 200, { ok: true });
      }
      const identity = await authenticate(req, auth);
      if (path === '/api/auth/logout' && method === 'POST') {
        await auth.revokeRefreshTokens(identity.uid);
        res.setHeader('Set-Cookie', sessionCookie(config, '', 0)); return send(res, 200, { ok: true });
      }
      if (path === '/api/profile' && method === 'POST') {
        const data = await body(req);
        return send(res, 200, { profile: await store.register(identity, { name: text(data.name, 'Name'), program: text(data.program, 'Program'), studentId: text(data.studentId, 'Student ID') }) });
      }
      const profile = await store.profile(identity.uid);
      if (path === '/api/me' && method === 'GET') return send(res, 200, { identity, profile });
      if (!profile || profile.email !== identity.email) throw new AppError(403, 'Complete your profile or contact the administrator.');
      const staff = ['faculty', 'admin'].includes(profile.role);
      if (path === '/api/domains' && method === 'GET') return send(res, 200, { domains: await store.activeDomains() });
      if (path === '/api/checks' && method === 'GET') {
        if (profile.role !== 'admin') throw new AppError(403, 'Administrator access required.');
        return send(res, 200, await store.checks());
      }
      if (path === '/api/submissions' && method === 'GET') {
        const all = (await store.list()).filter(item => staff || item.ownerUid === identity.uid);
        const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 20));
        return send(res, 200, { items: all.slice(offset, offset + limit).map(publicItem), total: all.length });
      }
      if (path === '/api/upload-sessions' && method === 'POST') {
        const data = await body(req), files = validateFiles(data.files), submissionId = randomUUID();
        const uploads = await store.createUploads(submissionId, files);
        const ticket = sign(config.secret, { kind: 'm02-upload', uid: identity.uid, submissionId, exp: Date.now() + 3600000, files: uploads.map(({ uploadUrl, ...file }) => file) });
        return send(res, 201, { submissionId, ticket, uploads });
      }
      if (path === '/api/submissions' && method === 'POST') {
        const data = await body(req), ticket = verify(config.secret, data.ticket, 'm02-upload');
        if (ticket.uid !== identity.uid) throw new AppError(403, 'This upload belongs to another account.');
        const existing = await store.find(ticket.submissionId);
        if (existing) {
          if (existing.ownerUid !== identity.uid) throw new AppError(404, 'Submission not found.');
          return send(res, 200, { item: publicItem(existing), alreadySaved: true });
        }
        const validated = validateSubmission({ ...data, email: identity.email, name: profile.name, studentId: profile.studentId, program: profile.program });
        if (!(await store.activeDomains()).includes(validated.domain)) throw new AppError(400, 'Choose an active domain.');
        const files = await store.verifyUploads(ticket.submissionId, ticket.files);
        const item = await store.appendSubmission(ticket.submissionId, { ...validated, ownerUid: identity.uid }, files);
        return send(res, 201, { item: publicItem(item) });
      }
      const match = path.match(/^\/api\/submissions\/([\w-]{1,100})(?:\/(remarks)|\/files\/([\w-]{1,200}))?$/);
      if (match) {
        const item = await store.find(match[1]);
        if (!item || (!staff && item.ownerUid !== identity.uid)) throw new AppError(404, 'Submission not found.');
        if (match[3] && method === 'GET') {
          const file = item.media.find(file => file.fileId === match[3]);
          if (!file) throw new AppError(404, 'Attachment not found.');
          const response = await store.download(file.fileId);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
          await pipeline(Readable.fromWeb(response.body), res); return;
        }
        if (match[2] && method === 'GET') return send(res, 200, { items: await store.remarks(item.id) });
        if (match[2] && method === 'POST') {
          if (!staff) throw new AppError(403, 'Faculty access required.');
          const data = await body(req);
          return send(res, 201, { item: await store.appendRemark(item.id, identity.email, text(data.remark, 'Remark', 5000)) });
        }
        if (!match[2] && !match[3] && method === 'GET') return send(res, 200, { item: publicItem(item) });
      }
      throw new AppError(404, 'Endpoint not found.');
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof AppError ? error.status : 502;
      console.error(JSON.stringify({ requestId, status, type: error.name }));
      send(res, status, { error: error instanceof AppError ? error.message : 'Operation failed. Check saved data before retrying.', requestId });
    }
  };
}
