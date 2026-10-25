import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { loadM02Env, m02Config } from '../src/m02/config.mjs';
import { GoogleStore } from '../src/google.mjs';
import { PROFILE_HEADERS } from '../src/m02/store.mjs';

loadM02Env();
const source = m02Config(), store = new GoogleStore(source);
const headers = JSON.parse(readFileSync('fixtures/m01/schema.json', 'utf8')).tabs.Responses;
const variant = process.env.M03_RESOURCE_VARIANT || '';
if (variant && !['a-1200', 'b-3000'].includes(variant)) throw new Error('Only preserved dataset variants allowed.');
for (const suffix of variant ? [variant[0]] : ['a', 'b']) {
  const path = variant ? `.env.m03-${variant}.local` : `.env.m03-${suffix}.local`, checkpoint = `M03-${suffix.toUpperCase()}`;
  let local = existsSync(path) ? readFileSync(path, 'utf8') : readFileSync('.env.m02.local', 'utf8').split(/\r?\n/).filter(line => !/^(M02_|APP_ORIGIN=)/.test(line)).join('\n');
  const get = key => { const raw = local.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]; return raw ? JSON.parse(raw) : ''; };
  const set = (key, value) => {
    const line = `${key}=${JSON.stringify(value)}`;
    local = new RegExp(`^${key}=.*$`, 'm').test(local) ? local.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${local}\n${line}\n`;
    writeFileSync(path, local);
  };
  set('M03_CHECKPOINT', checkpoint); set('APP_ORIGIN', suffix === 'a' ? 'http://localhost:3003' : 'http://localhost:3004');
  set('PORT', suffix === 'a' ? '3003' : '3004');
  if (!get('M03_SIGNING_SECRET')) set('M03_SIGNING_SECRET', randomBytes(32).toString('hex'));
  set('M03_COORDINATION_NAMESPACE', `m03-${variant || suffix}-pilot`);
  if (variant && suffix === 'b' && existsSync('.env.m03-b.local')) {
    const shared = parseEnv(readFileSync('.env.m03-b.local', 'utf8'));
    for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) if (shared[key]) set(key, shared[key]);
  }
  let folderId = get('M03_GOOGLE_MEDIA_FOLDER_ID');
  if (!folderId) {
    const folder = await store.request('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify({ name: `PPCP ${checkpoint} ${variant ? variant.slice(2) + ' ' : ''}Test Media`, mimeType: 'application/vnd.google-apps.folder' }) });
    folderId = folder.id; set('M03_GOOGLE_MEDIA_FOLDER_ID', folderId);
  }
  let spreadsheetId = get('M03_GOOGLE_SPREADSHEET_ID');
  if (!spreadsheetId) {
    const sheet = await store.request('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title: `PPCP ${checkpoint} ${variant ? variant.slice(2) + ' ' : ''}Test DB` }, sheets: ['Profiles', 'Responses', 'Remarks', 'Calculations'].map(title => ({ properties: { title, gridProperties: { rowCount: 5000, columnCount: 26 } } })) }) });
    spreadsheetId = sheet.spreadsheetId; set('M03_GOOGLE_SPREADSHEET_ID', spreadsheetId);
  }
  if (!get('M03_SCHEMA_READY')) {
    await store.request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: [
      { range: 'Profiles!A1:H1', values: [PROFILE_HEADERS] },
      { range: suffix === 'a' ? 'Responses!A1:S1' : 'Responses!A1:U1', values: [[...headers, 'Owner UID', ...(suffix === 'b' ? ['Last edited', 'Last save operation'] : [])]] },
      { range: 'Remarks!A1:D1', values: [['UUID', 'Given by', 'Remarks', 'Timestamp']] },
      { range: 'Calculations!A1:C2', values: [['Domain', 'Program Name', 'Active Domains'], ['', '', 'Education']] }
    ] }) }); set('M03_SCHEMA_READY', 'yes');
  }
  console.log(JSON.stringify({ checkpoint, spreadsheetId, folderId }));
}
