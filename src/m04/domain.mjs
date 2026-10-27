import { createHash } from 'node:crypto';
import { AppError, text, validateSubmission } from '../domain.mjs';
export { AppError, text };
export const LIMITS = { maxFiles: 10, maxFileBytes: 5_000_000, maxTotalBytes: 10_000_000 };
export const normalize = value => String(value).normalize('NFKC').trim().toLowerCase();
export function institutional(email) { return /^[^\s@]+@(welingkar\.org|welingkarmail\.org)$/.test(normalize(email)); }
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export function files(value) {
  if (!Array.isArray(value) || value.length > LIMITS.maxFiles) throw new AppError(400, 'Choose at most 10 files.');
  let total = 0;
  const result = value.map(file => {
    const name = text(file?.name, 'Filename', 180), mimeType = TYPES[name.split('.').pop().toLowerCase()];
    if (/[\\/\x00-\x1f]/.test(name) || !mimeType) throw new AppError(400, 'Unsupported filename or file type.');
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > LIMITS.maxFileBytes) throw new AppError(400, 'Each file must be 1 byte to 5 MB.');
    total += file.size; return { name, size: file.size, mimeType };
  });
  if (total > LIMITS.maxTotalBytes) throw new AppError(400, 'Attachments must total at most 10 MB.');
  return result;
}
export function submission(data, profile) {
  const value = validateSubmission({ ...data, email: profile.email, name: profile.name, studentId: profile.studentId, program: profile.program });
  return { ...value, titleNormalized: normalize(value.title), nameNormalized: normalize(value.name), emailNormalized: normalize(value.email), domainNormalized: normalize(value.domain) };
}
export function identifier(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) throw new AppError(400, `Invalid ${label}.`);
  return value;
}
export function version(value) { if (!Number.isSafeInteger(value) || value < 1) throw new AppError(400, 'Expected a saved version.'); return value; }
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value; }
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const displayId = sequence => `PP${String(sequence).padStart(3, '0')}`;
export function facets(item) {
  const values = [];
  for (const domain of [null, item.domainNormalized]) for (const locked of [null, item.locked]) for (const hasRemarks of [null, item.hasRemarks]) values.push(digest({ ...(domain === null ? {} : { domain }), ...(locked === null ? {} : { locked }), ...(hasRemarks === null ? {} : { hasRemarks }) }));
  return values;
}
export function canRead(profile, item) { return item && (item.ownerUid === profile.uid || ['faculty', 'admin'].includes(profile.role)); }
export function requireRole(profile, roles) { if (profile.status !== 'active' || !roles.includes(profile.role)) throw new AppError(403, 'This action is not allowed for your role.'); }
