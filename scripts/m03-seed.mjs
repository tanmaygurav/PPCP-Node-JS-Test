import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M03Store } from '../src/m03/store.mjs';
import { responseRow } from '../src/domain.mjs';
loadM03Env(); const config = m03Config(), auth = firebaseAuth(config), store = new M03Store(config);
const count = Number(process.argv.find(arg => arg.startsWith('--count='))?.split('=')[1] || 1200);
if (![1200, 3000].includes(count) || config.projectId !== 'ppcp-auth-test') throw new Error('Only approved synthetic test datasets/project allowed.');
const path = '.local/m03-accounts.json';
const pool = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { prefix: `m03-${randomBytes(5).toString('hex')}`, accounts: [] };
writeFileSync(path, JSON.stringify(pool, null, 2));
for (let i = pool.accounts.length; i < 62; i++) {
  const uid = `${pool.prefix}-${i}`, email = `${uid}@welingkar.org`, password = randomBytes(24).toString('base64url');
  // Persist before creation so an interrupted run can recover exactly these UIDs.
  const account = { uid, email, password, role: i < 60 ? 'student' : i === 60 ? 'faculty' : 'admin' };
  pool.accounts.push(account); writeFileSync(path, JSON.stringify(pool, null, 2));
  await auth.createUser({ uid, email, password, emailVerified: true, displayName: `Synthetic M03 ${i}` });
  if ((i + 1) % 10 === 0) console.log(`Prepared ${i + 1}/62 synthetic accounts; no email sent.`);
}
for (const account of pool.accounts) {
  try { await auth.getUser(account.uid); } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid: account.uid, email: account.email, password: account.password, emailVerified: true, displayName: 'Synthetic M03 recovered' });
  }
}
const profiles = await store.values("'Profiles'!A2:H");
const missing = pool.accounts.filter(account => !profiles.some(row => row[0] === account.uid));
if (missing.length) await store.request(store.sheetUrl("'Profiles'!A:H", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), { method: 'POST', body: JSON.stringify({ values: missing.map(account => [account.uid, account.email, 'Synthetic M03', 'Test program', account.uid, account.role, 'active', new Date().toISOString()]) }) });
if (config.checkpoint === 'M03-B') await store.request(store.sheetUrl("'Responses'!U1", '?valueInputOption=RAW'), { method: 'PUT', body: JSON.stringify({ values: [['Last save operation']] }) });
const existing = await store.list(), ids = new Set(existing.map(item => item.id));
const values = [];
for (let i = 0; i < count; i++) {
  const id = `m03-seed-${String(i).padStart(5, '0')}`;
  if (ids.has(id)) continue;
  const account = pool.accounts[i % 60];
  values.push([...responseRow(id, { email: account.email, name: 'Synthetic M03', studentId: account.uid, program: 'Test program', domain: 'Education', title: `Synthetic seed ${i}`, description: 'Synthetic classroom observation. '.repeat(12), solution: 'Synthetic proposed improvement.' }, [], '2026-10-01T00:00:00.000Z'), account.uid, ...(config.checkpoint === 'M03-B' ? ['', ''] : [])]);
}
if (values.length) await store.request(store.sheetUrl(config.checkpoint === 'M03-B' ? "'Responses'!A:U" : "'Responses'!A:S", ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), { method: 'POST', body: JSON.stringify({ values }) });
const after = await store.list();
const seeded = after.filter(item => item.id.startsWith('m03-seed-'));
if (new Set(after.map(item => item.id)).size !== after.length || seeded.length < count) throw new Error('Seed reconciliation failed. Do not repeat writes blindly.');
console.log(JSON.stringify({ checkpoint: config.checkpoint, syntheticAccounts: pool.accounts.length, seeded: seeded.length, totalRecords: after.length, appended: values.length }));
