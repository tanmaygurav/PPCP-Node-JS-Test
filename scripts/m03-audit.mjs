import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { M03Store } from '../src/m03/store.mjs';
import { RedisCoordination } from '../src/m03/coordination.mjs';
loadM03Env(); const config = m03Config();
if (config.checkpoint !== 'M03-B') throw new Error('M03-B audit only.');
const store = new M03Store(config), coordination = new RedisCoordination(config.redis), records = await store.list();
const files = []; let pageToken;
do {
  const params = new URLSearchParams({ q: `'${config.folderId}' in parents and trashed = false`, fields: 'nextPageToken,files(id,size,name,appProperties)', pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
  const page = await store.request(`https://www.googleapis.com/drive/v3/files?${params}`); files.push(...page.files); pageToken = page.nextPageToken;
} while (pageToken);
const byId = new Map(files.map(file => [file.id, file])), brokenReferences = [], invalidLimits = [], mismatchedSaves = [];
for (const item of records) {
  let size = 0;
  for (const media of item.media) {
    const actual = byId.get(media.fileId);
    if (!actual || actual.name !== media.filename || actual.appProperties?.submissionId !== item.id) brokenReferences.push(item.id);
    const bytes = Number(actual?.size || 0); size += bytes;
    if (bytes < 1 || bytes > 5000000) invalidLimits.push(item.id);
  }
  if (item.media.length > 10 || size > 20000000) invalidLimits.push(item.id);
}
const reports = readdirSync('output/m03').filter(file => /^m03-\d+\.json$/.test(file)).map(file => JSON.parse(readFileSync(`output/m03/${file}`, 'utf8'))).filter(row => row.checkpoint === 'M03-B');
for (const report of reports) for (const save of report.saves) {
  const item = records.find(item => item.id === save.id);
  if (save.state === 'confirmed' && (!item || item.ownerUid !== save.uid || item.title !== save.expectedTitle)) mismatchedSaves.push(save.id);
  if (item && ['not-reserved', 'rejected'].includes(save.editReconciliation) && item.lastEdited) mismatchedSaves.push(save.id);
}
let cursor = '0'; const pending = new Set();
do { const page = await coordination.command(['SCAN', cursor, 'MATCH', `${coordination.namespace}:record:*`, 'COUNT', 100]); cursor = page[0]; for (const key of page[1]) pending.add(key); } while (cursor !== '0');
const report = { checkedAt: new Date().toISOString(), checkpoint: config.checkpoint, records: records.length, seeds: records.filter(item => item.id.startsWith('m03-seed-')).length, duplicateIds: records.length - new Set(records.map(item => item.id)).size, brokenReferences: [...new Set(brokenReferences)], invalidLimits: [...new Set(invalidLimits)], mismatchedSaves: [...new Set(mismatchedSaves)], pendingRecordReservations: pending.size, queuedCleanup: await coordination.command(['HLEN', `${coordination.namespace}:cleanup`]) };
mkdirSync('output/m03', { recursive: true }); const path = `output/m03/audit-${Date.now()}.json`; writeFileSync(path, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ path, ...report }));
if (report.duplicateIds || report.brokenReferences.length || report.invalidLimits.length || report.mismatchedSaves.length || report.pendingRecordReservations || report.queuedCleanup) process.exitCode = 1;
