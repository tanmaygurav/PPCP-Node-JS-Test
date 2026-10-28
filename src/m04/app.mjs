import { randomUUID } from 'node:crypto';
import { AppError, identifier, institutional, normalize, requireRole, text } from './domain.mjs';
import { allowedIdentity, authenticate, sessionCookie, SESSION_SECONDS } from './auth.mjs';
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new AppError(415, 'Send application/json.');
  let raw;
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else { let length = 0; const chunks = []; for await (const chunk of req) { length += chunk.length; if (length > 96000) throw new AppError(413, 'Request too large.'); chunks.push(chunk); } raw = Buffer.concat(chunks).toString(); }
  if (Buffer.byteLength(raw) > 96000) throw new AppError(413, 'Request too large.');
  try { const value = JSON.parse(raw); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; } catch { throw new AppError(400, 'Expected a JSON object.'); }
}
function send(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
export function createM04Handler(config, store, auth) {
  return async (req, res) => {
    const requestId = randomUUID(); res.setHeader('X-Request-ID', requestId); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const timings = [];
    const measured = async (name, operation) => {
      const started = performance.now();
      try { return await operation(); }
      finally { timings.push(`${name};dur=${(performance.now() - started).toFixed(1)}`); if (!res.headersSent) res.setHeader('Server-Timing', timings.join(', ')); }
    };
    try {
      const url = new URL(req.url, config.origin), path = url.searchParams.has('route') ? `/api/${url.searchParams.get('route')}` : url.pathname, method = req.method;
      if (!['GET', 'POST'].includes(method)) throw new AppError(405, 'Method not allowed.');
      if (method === 'POST' && req.headers.origin !== config.origin) throw new AppError(403, 'Request origin is not allowed.');
      if (path === '/api/health' && method === 'GET') return send(res, 200, { ok: true, milestone: 'M04' });
      if (path === '/api/auth/config' && method === 'GET') return send(res, 200, { ...config.web, emulator: config.emulator ? `http://${config.emulator}` : null });
      const databaseReady = path === '/api/auth/logout' ? Promise.resolve() : measured('database-init', () => store.initialize?.());
      // Authentication may reject before initialization finishes. Valid requests
      // still await and report initialization failures through the normal path.
      void databaseReady.catch(() => {});
      if (path === '/api/auth/session' && method === 'POST') {
        const data = await body(req); let decoded;
        try { decoded = await auth.verifyIdToken(text(data.idToken, 'ID token', 20000), true); } catch { throw new AppError(401, 'Sign in again.'); }
        const identity = allowedIdentity(decoded);
        if (!Number.isFinite(decoded.auth_time) || Date.now() / 1000 - decoded.auth_time > 300) throw new AppError(401, 'A recent sign-in is required.');
        await databaseReady;
        const profile = await store.profile(identity.uid);
        if (profile && (profile.status !== 'active' || profile.email !== identity.email)) throw new AppError(403, 'Account access is disabled or email changed.');
        const token = await auth.createSessionCookie(data.idToken, { expiresIn: SESSION_SECONDS * 1000 });
        res.setHeader('Set-Cookie', sessionCookie(config, token)); return send(res, 200, { ok: true });
      }
      if (method === 'POST' && ['/api/auth/logout', '/api/profile'].includes(path)) {
        const identity = await measured('auth', () => authenticate(req, auth));
        if (path === '/api/auth/logout') { await auth.revokeRefreshTokens(identity.uid); res.setHeader('Set-Cookie', sessionCookie(config, '', 0)); return send(res, 200, { ok: true }); }
        await databaseReady;
        return send(res, 200, { profile: await store.register(identity, await body(req)) });
      }
      const { identity, profile } = await measured('access', () => authenticate(req, auth, async uid => { await databaseReady; return measured('profile', () => store.profile(uid)); }));
      if (profile && (profile.email !== identity.email || profile.status !== 'active')) throw new AppError(403, 'Account access is disabled or email changed.');
      if (path === '/api/me' && method === 'GET') return send(res, 200, { identity, profile });
      if (!profile) throw new AppError(403, 'Complete your profile first.');
      requireRole(profile, ['student', 'faculty', 'admin']);
      if (path === '/api/domains' && method === 'GET') return send(res, 200, { domains: await store.domains() });
      if (path === '/api/submissions' && method === 'GET') return send(res, 200, await measured('query', () => store.list(profile, url.searchParams)));
      if (path === '/api/submissions' && method === 'POST') return send(res, 200, await store.save(profile, await body(req)));
      if (path === '/api/upload-sessions' && method === 'POST') return send(res, 201, await store.prepare(profile, await body(req)));
      const operation = path.match(/^\/api\/operations\/([\w-]{1,100})$/);
      if (operation && method === 'GET') return send(res, 200, await store.receipt(profile, operation[1]));
      const match = path.match(/^\/api\/submissions\/([\w-]{1,100})(?:\/(edits|lock|unlock|remarks))?$/);
      if (match) {
        if (!match[2] && method === 'GET') return send(res, 200, { item: await measured('query', () => store.find(profile, match[1])) });
        if (match[2] === 'remarks' && method === 'GET') return send(res, 200, await store.remarks(profile, match[1], url.searchParams));
        if (method === 'POST' && match[2]) { const data = await body(req); return send(res, 200, match[2] === 'edits' ? await store.save(profile, data, match[1]) : await store.mutate(profile, match[1], match[2], data)); }
      }
      if (path === '/api/admin/users' && method === 'GET') {
        requireRole(profile, ['admin']); const email = normalize(url.searchParams.get('email') || '');
        if (!institutional(email)) throw new AppError(400, 'Enter an exact institutional email address.');
        let user; try { user = await auth.getUserByEmail(email); } catch (error) { if (error.code === 'auth/user-not-found') return send(res, 200, { user: null }); throw error; }
        const saved = await store.profile(user.uid);
        return send(res, 200, { user: saved ? { ...saved, emailVerified: user.emailVerified, firebaseDisabled: user.disabled } : null });
      }
      const user = path.match(/^\/api\/admin\/users\/([\w-]{1,100})$/);
      if (user && method === 'POST') {
        requireRole(profile, ['admin']); identifier(user[1]); const data = await body(req), target = await auth.getUser(user[1]);
        if (!target.emailVerified || !institutional(target.email) || target.disabled) throw new AppError(403, 'Target needs an enabled, verified institutional Firebase account.');
        const saved = await store.profile(target.uid); if (!saved || saved.email !== normalize(target.email)) throw new AppError(409, 'Target profile email does not match Firebase.');
        return send(res, 200, await store.changeUser(profile, user[1], data));
      }
      throw new AppError(404, 'Endpoint not found.');
    } catch (error) {
      const status = error instanceof AppError ? error.status : error.code === 9 ? 503 : 502;
      console.error(JSON.stringify({ requestId, status, type: error.name }));
      send(res, status, { error: error instanceof AppError ? error.message : error.code === 9 ? 'A required Firestore index is not ready. Contact the organizer.' : 'Request could not complete. Retry the same operation to check its outcome.', requestId });
    }
  };
}
