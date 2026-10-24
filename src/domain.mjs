export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const MAX_FILE = 5_000_000;
export const MAX_TOTAL = 20_000_000;
export const MAX_FILES = 10;
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

export function text(value, name, max = 200, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) {
    throw new AppError(400, `${name} must be ${optional ? 'at most' : '1 to'} ${max} characters.`);
  }
  return value.trim();
}

export function validateFiles(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new AppError(400, 'Choose at most 10 files.');
  let total = 0;
  const result = files.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new AppError(400, 'Each file must have a name and size.');
    const name = text(file.name, 'Filename', 180);
    if (/[\\/\x00-\x1f]/.test(name)) throw new AppError(400, 'Filename contains invalid characters.');
    const mimeType = TYPES[name.split('.').pop().toLowerCase()];
    if (!mimeType) throw new AppError(400, 'Unsupported file extension.');
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE) {
      throw new AppError(400, 'Each file must contain 1 byte to 5 MB.');
    }
    total += file.size;
    return { name, size: file.size, mimeType };
  });
  if (total > MAX_TOTAL) throw new AppError(400, 'Total attachments must not exceed 20 MB.');
  return result;
}

export function validateSubmission(body) {
  const email = text(body.email, 'Test email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Enter a valid test email.');
  return {
    email, name: text(body.name, 'Name'), studentId: text(body.studentId, 'Student ID'),
    program: text(body.program, 'Program'), domain: text(body.domain, 'Domain'),
    title: text(body.title, 'Title', 300), description: text(body.description, 'Description', 20_000),
    solution: text(body.solution ?? '', 'Solution', 10_000, true)
  };
}

export function responseRow(id, data, media, now = new Date().toISOString()) {
  return ['', id, now, data.email, data.name, data.studentId, data.program, data.domain,
    data.title, '', JSON.stringify(media), data.solution, '', '', '', '', '', data.description];
}

export function parseResponse(row) {
  let media = [];
  try { media = JSON.parse(row[10] || '[]'); } catch { /* Retain access to legacy malformed records. */ }
  return {
    status: String(row[0] || ''), id: String(row[1] || ''), timestamp: row[2] || '',
    email: row[3] || '', name: row[4] || '', studentId: row[5] || '', program: row[6] || '',
    domain: row[7] || '', title: row[8] || '', solution: row[11] || '',
    description: [9, 12, 13, 14, 15, 16, 17].map(i => row[i] || '').filter(Boolean).join('\n\n'),
    media: Array.isArray(media) ? media : []
  };
}
