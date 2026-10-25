import { M02Store } from '../m02/store.mjs';
import { AppError, parseResponse, responseRow, validateFiles, validateSubmission } from '../domain.mjs';

export class M03Store extends M02Store {
  async appendProtected(id, data, files, operationId) {
    await this.checkResponseHeaders();
    const row = [...responseRow(id, data, files.map(file => ({ filename: file.name, fileId: file.id, size: file.size, mimeType: file.mimeType }))), data.ownerUid, '', operationId];
    await this.request(this.sheetUrl("'Responses'!A:U", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), { method: 'POST', body: JSON.stringify({ values: [row] }) });
    return { ...parseResponse(row), ownerUid: data.ownerUid, lastEdited: '', lastSaveOperation: operationId };
  }
  async list() {
    return (await this.values("'Responses'!A2:U")).map((row, index) => ({ ...parseResponse(row), ownerUid: row[18] || '', lastEdited: row[19] || '', lastSaveOperation: row[20] || '', rowNumber: index + 2 })).filter(item => item.id).reverse();
  }
  async validateEdit(item, changes, files) {
    validateSubmission({ ...item, ...changes });
    if (!(await this.activeDomains()).includes(changes.domain)) throw new AppError(400, 'Choose an active domain.');
    validateFiles(files);
    if (new Set(files.map(file => file.id)).size !== files.length) throw new AppError(400, 'Duplicate attachments are not allowed.');
    await this.verifyUploads(item.id, files);
  }
  async updateExisting(item, changes, files, timestamp, operationId) {
    const headers = await this.values("'Responses'!S1:U1");
    if (headers[0]?.join('|') !== 'Owner UID|Last edited|Last save operation') throw new AppError(409, 'M03 Responses schema mismatch.');
    const range = `'Responses'!A${item.rowNumber}:U${item.rowNumber}`;
    const [current] = await this.values(range);
    if (!current || current[1] !== item.id || current[18] !== item.ownerUid || (current[19] || '') !== item.lastEdited) throw new AppError(409, 'Record changed. Keep your draft.');
    const row = Array.from({ length: 21 }, (_, i) => current[i] || '');
    row[7] = changes.domain; row[8] = changes.title; row[11] = changes.solution;
    for (const i of [9, 12, 13, 14, 15, 16]) row[i] = '';
    row[17] = changes.description; row[19] = timestamp;
    row[20] = operationId;
    row[10] = JSON.stringify(files.map(file => ({ filename: file.name, fileId: file.id, size: file.size, mimeType: file.mimeType })));
    await this.request(this.sheetUrl(range, '?valueInputOption=RAW'), { method: 'PUT', body: JSON.stringify({ values: [row] }) });
    return { ...parseResponse(row), ownerUid: row[18], lastEdited: row[19], lastSaveOperation: row[20] };
  }
  async trashAttachment(submissionId, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const actual = await this.request(`${url}?fields=id,parents,appProperties,trashed`);
    if (!actual.parents?.includes(this.config.folderId) || actual.appProperties?.submissionId !== submissionId) throw new AppError(409, 'Cleanup attachment ownership mismatch.');
    if (!actual.trashed) await this.request(url, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
  }
}
