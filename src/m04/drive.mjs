import { GoogleStore } from '../google.mjs';
import { AppError } from './domain.mjs';
const DRIVE = 'https://www.googleapis.com/drive/v3';
export class M04Drive extends GoogleStore {
  assertConfig() { for (const key of ['clientId', 'clientSecret', 'refreshToken', 'folderId']) if (!this.config[key]) throw new AppError(503, `M04 Drive configuration missing: ${key}.`); }
  async checkFolder() {
    const folder = await this.request(`${DRIVE}/files/${this.config.folderId}?fields=id,mimeType,trashed,capabilities(canAddChildren),permissions(type,role)`);
    if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren || folder.permissions?.some(p => ['anyone', 'domain'].includes(p.type))) throw new AppError(409, 'M04 needs a private writable folder.');
    return folder;
  }
  async reserve(files) { return files.length ? (await this.request(`${DRIVE}/files/generateIds?count=${files.length}&space=drive&type=files`)).ids : []; }
  async start(upload, file) {
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', { method: 'POST', headers: { Origin: this.config.origin, 'X-Upload-Content-Type': file.mimeType, 'X-Upload-Content-Length': String(file.size) }, body: JSON.stringify({ id: file.id, name: file.name, mimeType: file.mimeType, parents: [this.config.folderId], appProperties: { prototype: 'ppcp-m04', submissionId: upload.submissionId, ownerUid: upload.ownerUid, uploadId: upload.id } }) }, 'response');
    const uploadUrl = response.headers.get('location');
    if (!uploadUrl || new URL(uploadUrl).origin !== 'https://www.googleapis.com') throw new AppError(502, 'Drive returned an unexpected upload URL.');
    return { ...file, uploadUrl };
  }
  async metadata(id) { return this.request(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name,size,mimeType,parents,trashed,appProperties,webViewLink,permissions(id,type,role,allowFileDiscovery)`); }
  async verify(file, ownerUid, submissionId, uploadId) {
    const actual = await this.metadata(file.id);
    if (actual.trashed || !actual.parents?.includes(this.config.folderId) || actual.appProperties?.prototype !== 'ppcp-m04' || actual.appProperties?.ownerUid !== ownerUid || actual.appProperties?.submissionId !== submissionId || (uploadId && actual.appProperties?.uploadId !== uploadId) || actual.name !== file.name || actual.mimeType !== file.mimeType || Number(actual.size) !== file.size) throw new AppError(409, 'Attachment is incomplete or does not match this owner, operation, folder, type or size.');
    return actual;
  }
  async publish(file, ownerUid, submissionId, uploadId) {
    let actual = await this.verify(file, ownerUid, submissionId, uploadId);
    const anyone = actual.permissions?.find(p => p.type === 'anyone');
    if (anyone && (anyone.role !== 'reader' || anyone.allowFileDiscovery !== false)) throw new AppError(409, 'Attachment has unexpected public permissions.');
    if (!anyone) await this.request(`${DRIVE}/files/${encodeURIComponent(file.id)}/permissions`, { method: 'POST', body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }) });
    actual = await this.metadata(file.id);
    if (!actual.permissions?.some(p => p.type === 'anyone' && p.role === 'reader' && p.allowFileDiscovery === false) || !actual.webViewLink) throw new AppError(502, 'Drive link sharing could not be verified.');
    const link = new URL(actual.webViewLink);
    if (link.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(link.hostname)) throw new AppError(502, 'Unexpected Drive view link.');
    return { ...file, webViewLink: actual.webViewLink };
  }
  async trash(id) { await this.request(`${DRIVE}/files/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }); }
}
