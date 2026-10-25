import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadLocalEnv, readConfig } from '../src/config.mjs';
import { GoogleStore } from '../src/google.mjs';
import { PROFILE_HEADERS } from '../src/m02/store.mjs';

// Explicit provisioning command. Never copies old user records or attachment permissions.
loadLocalEnv();
const config = readConfig(), store = new GoogleStore(config);
const target = '.env.m02.local';
if (existsSync(target)) {
  const existing = readFileSync(target, 'utf8');
  if (/^M02_GOOGLE_(SPREADSHEET|MEDIA_FOLDER)_ID=.+/m.test(existing)) throw new Error('M02 resources already configured. Refusing duplicate provisioning.');
}
const schema = JSON.parse(readFileSync('fixtures/m01/schema.json', 'utf8'));
// Keep generated resource IDs immediately, allowing recovery if a later operation fails.
let local = existsSync(target) ? readFileSync(target, 'utf8') : readFileSync('.env.m02.example', 'utf8');
const set = (key, value) => {
  const line = `${key}=${JSON.stringify(value)}`;
  local = new RegExp(`^${key}=.*$`, 'm').test(local) ? local.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${local}\n${line}\n`;
  writeFileSync(target, local);
};
for (const [key, value] of [['GOOGLE_CLIENT_ID', config.clientId], ['GOOGLE_CLIENT_SECRET', config.clientSecret], ['GOOGLE_REFRESH_TOKEN', config.refreshToken]]) set(key, value);
set('M02_SIGNING_SECRET', randomBytes(32).toString('hex'));
const folder = await store.request('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify({ name: 'PPCP M02 Test Media', mimeType: 'application/vnd.google-apps.folder' }) });
set('M02_GOOGLE_MEDIA_FOLDER_ID', folder.id);
const spreadsheet = await store.request('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({
  properties: { title: 'PPCP M02 Test DB' }, sheets: ['Profiles', 'Responses', 'Remarks', 'Calculations'].map(title => ({ properties: { title } }))
}) });
set('M02_GOOGLE_SPREADSHEET_ID', spreadsheet.spreadsheetId);
const headers = schema.tabs.Responses;
if (!Array.isArray(headers) || headers.length !== 18) throw new Error('Invalid response header fixture.');
await store.request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [
  { range: 'Profiles!A1:H1', values: [PROFILE_HEADERS] },
  { range: 'Responses!A1:S1', values: [[...headers, 'Owner UID']] },
  { range: 'Remarks!A1:D1', values: [['UUID','Given by','Remarks','Timestamp']] },
  { range: 'Calculations!A1:C2', values: [['Domain','Program Name','Active Domains'], ['','','Education']] }
] }) });
console.log('Created separate M02 test Sheet and private Media folder; saved IDs and credentials in ignored .env.m02.local.');
console.log(JSON.stringify({ spreadsheetId: spreadsheet.spreadsheetId, folderId: folder.id }));
