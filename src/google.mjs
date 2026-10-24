import { AppError, parseResponse, responseRow } from './domain.mjs';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleStore {
  constructor(config, fetcher = fetch) { this.config = config; this.fetch = fetcher; }

  assertConfig() {
    for (const key of ['clientId', 'clientSecret', 'refreshToken', 'spreadsheetId', 'folderId']) {
      if (!this.config[key]) throw new AppError(503, `Google configuration is incomplete (${key}). See README.md.`);
    }
  }

  async accessToken() {
    this.assertConfig();
    if (this.token && this.expires > Date.now() + 60_000) return this.token;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const response = await this.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken, grant_type: 'refresh_token' })
      });
      if (!response.ok) throw new AppError(503, 'Google authorization failed. Re-run npm run google:authorize and check OAuth settings.');
      const body = await response.json();
      if (!body.access_token) throw new AppError(503, 'Google did not return an access token.');
      this.token = body.access_token;
      this.expires = Date.now() + Number(body.expires_in || 3600) * 1000;
      return this.token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }

  async request(url, options = {}, format = 'json') {
    const method = options.method || 'GET';
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await this.accessToken();
      const response = await this.fetch(url, {
        ...options, signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
      });
      if (response.status === 401 && attempt === 0) { this.token = null; continue; }
      if (method === 'GET' && [429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 100));
        continue;
      }
      if (!response.ok) {
        const status = response.status === 404 ? 404 : response.status === 429 ? 503 : 502;
        throw new AppError(status, `Google ${response.status}: check API access, resource IDs, permissions, or quota. Writes are not automatically retried; check saved records before retrying.`);
      }
      if (format === 'response') return response;
      return response.status === 204 ? {} : response.json();
    }
    throw new AppError(503, 'Google request could not complete.');
  }

  sheetUrl(range, suffix = '') {
    return `${SHEETS}/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`;
  }
  async values(range, render = 'FORMATTED_VALUE') {
    return (await this.request(this.sheetUrl(range, `?valueRenderOption=${render}`))).values || [];
  }
  async checkResponseHeaders() {
    // Reject the old row-ID ArrayFormula before any writes to the test sheet.
    const rows = await this.values("'Responses'!A1:R2", 'FORMULA');
    if (rows.some(row => typeof row[1] === 'string' && /^=/.test(row[1]))) {
      throw new AppError(409, 'Remove formulas from Responses rows 1–2 in the TEST COPY. Use fixed IDs and plain headers; do not change production.');
    }
    if (String(rows[0]?.[1]).toUpperCase() !== 'ID' || String(rows[0]?.[17]).toLowerCase() !== 'description') {
      throw new AppError(409, 'Responses needs 18 columns: ID in B and Description in R. See README.md for headers.');
    }
  }
  async checks() {
    await this.checkResponseHeaders();
    const sheet = await this.request(`${SHEETS}/${this.config.spreadsheetId}?fields=properties(title),sheets(properties(title))`);
    const folder = await this.request(`${DRIVE}/files/${this.config.folderId}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)`);
    if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) {
      throw new AppError(409, 'Configured Media resource must be an accessible, writable Drive folder.');
    }
    const remarks = await this.values("'Remarks'!A1:D1");
    if (remarks[0]?.join('|') !== 'UUID|Given by|Remarks|Timestamp') {
      throw new AppError(409, 'Remarks headers must be UUID, Given by, Remarks, Timestamp in columns A–D.');
    }
    return { spreadsheet: sheet.properties.title, tabs: sheet.sheets.map(s => s.properties.title), folder: folder.name };
  }
  async activeDomains() {
    return (await this.values("'Calculations'!C2:C")).map(row => String(row[0] || '').trim()).filter(Boolean);
  }
  async list() {
    const rows = await this.values("'Responses'!A2:R");
    return rows.filter(row => row[1]).map(parseResponse).reverse();
  }
  async find(id) { return (await this.list()).find(record => record.id === id); }
  async appendSubmission(id, data, files) {
    await this.checkResponseHeaders();
    const media = files.map(file => ({ filename: file.name, fileId: file.id,
      fileUrl: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view` }));
    const row = responseRow(id, data, media);
    await this.request(this.sheetUrl("'Responses'!A:R", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), {
      method: 'POST', body: JSON.stringify({ values: [row] })
    });
    return parseResponse(row);
  }
  async remarks(id) {
    return (await this.values("'Remarks'!A2:D")).filter(row => row[0] === id)
      .map(row => ({ submissionId: row[0], givenBy: row[1], remark: row[2], timestamp: row[3] }));
  }
  async appendRemark(id, givenBy, remark) {
    const result = { submissionId: id, givenBy, remark, timestamp: new Date().toISOString() };
    await this.request(this.sheetUrl("'Remarks'!A:D", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), {
      method: 'POST', body: JSON.stringify({ values: [[id, givenBy, remark, result.timestamp]] })
    });
    return result;
  }
  async createUploads(submissionId, files) {
    if (!files.length) return [];
    const generated = await this.request(`${DRIVE}/files/generateIds?count=${files.length}&space=drive&type=files`);
    const uploads = [];
    for (const [index, file] of files.entries()) {
      const id = generated.ids[index];
      const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST', headers: { Origin: this.config.origin, 'X-Upload-Content-Type': file.mimeType, 'X-Upload-Content-Length': String(file.size) },
        body: JSON.stringify({ id, name: file.name, mimeType: file.mimeType, parents: [this.config.folderId],
          appProperties: { prototype: 'ppcp-v3-test', submissionId, expectedSize: String(file.size) } })
      }, 'response');
      const uploadUrl = response.headers.get('location');
      if (!uploadUrl || new URL(uploadUrl).origin !== 'https://www.googleapis.com') {
        throw new AppError(502, 'Google did not return an expected upload session URL.');
      }
      uploads.push({ ...file, id, uploadUrl });
    }
    return uploads;
  }
  async verifyUploads(submissionId, expected) {
    const verified = [];
    for (const file of expected) {
      const actual = await this.request(`${DRIVE}/files/${encodeURIComponent(file.id)}?fields=id,name,size,mimeType,parents,trashed,appProperties`);
      if (actual.trashed || !actual.parents?.includes(this.config.folderId)
        || actual.appProperties?.prototype !== 'ppcp-v3-test' || actual.appProperties?.submissionId !== submissionId
        || actual.name !== file.name || actual.mimeType !== file.mimeType || Number(actual.size) !== file.size) {
        throw new AppError(409, 'An attachment is incomplete or does not match this submission, folder, type, or size.');
      }
      verified.push({ ...file });
    }
    return verified;
  }
}
