import { randomUUID } from 'node:crypto';
import { createM02Handler } from '../m02/app.mjs';
import { authenticate } from '../m02/auth.mjs';
import { AppError, validateFiles, validateSubmission } from '../domain.mjs';
import { sign, verify } from '../security.mjs';
import { SafeEditor, digest } from './coordination.mjs';
import { createOnce } from './create.mjs';

const visible = item => {
  const { rowNumber, lastSaveOperation, ...safe } = item;
  return { ...safe, media: item.media.map(file => ({ ...file, downloadUrl: `/api/submissions/${item.id}/files/${file.fileId}` })) };
};
async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'Send application/json.');
  let raw = '';
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 96000) throw new AppError(413, 'Request too large.'); }
  if (Buffer.byteLength(raw) > 96000) throw new AppError(413, 'Request too large.');
  try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new AppError(400, 'Expected a JSON object.'); }
}
export function createM03Handler(config, store, auth, coordination) {
  const baseline = createM02Handler(config, store, auth);
  const editor = coordination ? new SafeEditor(store, coordination) : null;
  return async (req, res) => {
    const url = new URL(req.url, config.origin), path = url.searchParams.has('route') ? `/api/${url.searchParams.get('route')}` : url.pathname;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    if (path === '/api/health') return send(200, { ok: true, milestone: config.checkpoint });
    const match = path.match(/^\/api\/submissions\/([\w-]{1,100})(?:\/(edit-uploads|edits))?$/);
    const creation = path === '/api/submissions' && req.method === 'POST';
    if (config.checkpoint === 'M03-A' || (!match && !creation) || (req.method !== 'POST' && !(req.method === 'GET' && !match[2]))) return baseline(req, res);
    try {
      if (req.method === 'POST' && req.headers.origin !== config.origin) throw new AppError(403, 'Request origin is not allowed.');
      const identity = await authenticate(req, auth), profile = await store.profile(identity.uid);
      if (!profile || profile.email !== identity.email) throw new AppError(403, 'Account access unavailable.');
      if (creation) {
        const data = await readBody(req), ticket = verify(config.secret, data.ticket, 'm02-upload');
        if (ticket.uid !== identity.uid) throw new AppError(403, 'Upload belongs to another account.');
        const validated = validateSubmission({ ...data, email: identity.email, name: profile.name, studentId: profile.studentId, program: profile.program });
        const result = await createOnce(store, coordination, { id: ticket.submissionId, uid: identity.uid, operationId: data.operationId, requestHash: digest(data) }, async () => {
          if (!(await store.activeDomains()).includes(validated.domain)) throw new AppError(400, 'Choose an active domain.');
          const files = await store.verifyUploads(ticket.submissionId, ticket.files);
          return store.appendProtected(ticket.submissionId, { ...validated, ownerUid: identity.uid }, files, data.operationId);
        });
        return send(result.alreadySaved ? 200 : 201, { ...result, item: visible(result.item) });
      }
      const item = await store.find(match[1]);
      if (!item || (item.ownerUid !== identity.uid && !(req.method === 'GET' && ['faculty', 'admin'].includes(profile.role)))) throw new AppError(404, 'Submission not found.');
      if (req.method === 'GET') return send(200, { item: visible(item) });
      const data = await readBody(req);
      if (match[2] === 'edit-uploads') {
        const files = validateFiles(data.files), uploads = await store.createUploads(item.id, files);
        return send(201, { uploads, ticket: sign(config.secret, { kind: 'm03-edit-upload', uid: identity.uid, submissionId: item.id, exp: Date.now() + 3600000, files: uploads.map(({ uploadUrl, ...file }) => file) }) });
      }
      if (match[2] !== 'edits') throw new AppError(404, 'Endpoint not found.');
      if (!/^[a-f0-9-]{36}$/i.test(data.operationId || '')) throw new AppError(400, 'A save operation UUID is required.');
      const requestHash = digest(data);
      const resumed = await editor.resume(item.id, identity.uid, data.operationId, requestHash);
      if (resumed) return send(200, { ...resumed, item: visible(resumed.item) });
      if (!Array.isArray(data.retainedFileIds) || new Set(data.retainedFileIds).size !== data.retainedFileIds.length) throw new AppError(400, 'Invalid retained attachments.');
      const retained = data.retainedFileIds.map(id => {
        const file = item.media.find(file => file.fileId === id);
        if (!file) throw new AppError(400, 'An attachment does not belong to the current record.');
        return { id, name: file.filename, size: file.size, mimeType: file.mimeType };
      });
      // Older submission rows have no size metadata. Fetch it from Drive, never from the client.
      for (const file of retained) if (!file.size || !file.mimeType) {
        const actual = await store.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?fields=size,mimeType`);
        file.size = Number(actual.size); file.mimeType = actual.mimeType;
      }
      let added = [];
      if (data.ticket) {
        const ticket = verify(config.secret, data.ticket, 'm03-edit-upload');
        if (ticket.uid !== identity.uid || ticket.submissionId !== item.id) throw new AppError(403, 'Upload ticket belongs to another record or account.');
        added = ticket.files;
      }
      const validated = validateSubmission({ ...data, email: item.email, name: item.name, studentId: item.studentId, program: item.program });
      const changes = Object.fromEntries(['title', 'domain', 'description', 'solution'].map(key => [key, validated[key]]));
      if (typeof data.expectedLastEdited !== 'string') throw new AppError(400, 'Expected last edited timestamp is required.');
      const result = await editor.save({ id: item.id, uid: identity.uid, operationId: data.operationId, expectedLastEdited: data.expectedLastEdited, changes, files: [...retained, ...added], requestHash });
      // Cleanup is durable in Redis before releasing the record reservation. A cleanup failure does not undo a successful save.
      let cleanup;
      try { cleanup = await coordination.retryCleanup(store, 10); } catch { cleanup = { pending: true }; }
      return send(200, { ...result, item: visible(result.item), cleanup });
    } catch (error) {
      const requestId = randomUUID(), status = error instanceof AppError ? error.status : 502;
      console.error(JSON.stringify({ requestId, status, type: error.name }));
      return send(status, { error: error instanceof AppError ? error.message : 'Save outcome is uncertain. Keep your draft and retry the same operation.', requestId });
    }
  };
}
