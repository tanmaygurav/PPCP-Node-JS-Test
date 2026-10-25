import { GoogleStore } from '../google.mjs';
import { AppError, parseResponse, responseRow } from '../domain.mjs';

export const PROFILE_HEADERS = ['Firebase UID', 'Email', 'Name', 'Program', 'Student ID', 'Role', 'Status', 'Created at'];
export class M02Store extends GoogleStore {
  async assignRole(uid, email, role, apply = false) {
    if (!['student', 'faculty', 'admin'].includes(role)) throw new AppError(400, 'Invalid role.');
    const rows = await this.values("'Profiles'!A2:H");
    const matches = rows.map((row, i) => ({ row, i })).filter(item => item.row[0] === uid);
    if (matches.length !== 1 || matches[0].row[1] !== email.toLowerCase()) throw new AppError(409, 'Expected exactly one matching profile. Resolve duplicates or mismatched email first.');
    const change = { uid, previous: matches[0].row[5], role, applied: apply };
    if (apply) await this.request(this.sheetUrl(`'Profiles'!F${matches[0].i + 2}`, '?valueInputOption=RAW'), {
      method: 'PUT', body: JSON.stringify({ values: [[role]] })
    });
    return change;
  }
  async profile(uid) {
    const rows = (await this.values("'Profiles'!A2:H")).filter(row => row[0] === uid);
    if (!rows.length) return null;
    // Concurrent registrations may append equivalent student rows; never resolve conflicting roles permissively.
    if (rows.some(row => row.slice(1, 7).join('|') !== rows[0].slice(1, 7).join('|'))) throw new AppError(409, 'Conflicting profile records require administrator review.');
    const [id, email, name, program, studentId, role, status, createdAt] = rows[0];
    if (!['student', 'faculty', 'admin'].includes(role) || status !== 'active') throw new AppError(403, 'Account access is disabled or needs administrator review.');
    return { uid: id, email, name, program, studentId, role, status, createdAt };
  }
  async register(identity, data) {
    const existing = await this.profile(identity.uid);
    if (existing) return existing;
    const headers = await this.values("'Profiles'!A1:H1");
    if (headers[0]?.join('|') !== PROFILE_HEADERS.join('|')) throw new AppError(409, 'Profiles schema does not match M02.');
    const profile = { ...identity, ...data, role: 'student', status: 'active', createdAt: new Date().toISOString() };
    await this.request(this.sheetUrl("'Profiles'!A:H", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), {
      method: 'POST', body: JSON.stringify({ values: [[profile.uid, profile.email, profile.name, profile.program, profile.studentId, 'student', 'active', profile.createdAt]] })
    });
    return profile;
  }
  async list() {
    return (await this.values("'Responses'!A2:S")).filter(row => row[1]).map(row => ({ ...parseResponse(row), ownerUid: row[18] || '' })).reverse();
  }
  async appendSubmission(id, data, files) {
    await this.checkResponseHeaders();
    const headers = await this.values("'Responses'!S1:S1");
    if (headers[0]?.[0] !== 'Owner UID') throw new AppError(409, 'M02 Responses requires Owner UID in column S.');
    const row = [...responseRow(id, data, files.map(file => ({ filename: file.name, fileId: file.id }))), data.ownerUid];
    await this.request(this.sheetUrl("'Responses'!A:S", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), { method: 'POST', body: JSON.stringify({ values: [row] }) });
    return { ...parseResponse(row), ownerUid: data.ownerUid };
  }
  async download(fileId) {
    return this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {}, 'response');
  }
}
