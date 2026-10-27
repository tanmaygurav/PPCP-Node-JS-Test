import { readFileSync } from 'node:fs';
import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
loadM04Env(); const config = m04Config(), { auth, db } = services(config), apply = process.argv.includes('--apply');
if (config.emulator || config.projectId !== 'ppcp-m04-redesign') throw new Error('This provisioning command targets only the approved new M04 project.');
const { access_token } = await auth.app.options.credential.getAccessToken();
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const value = await response.json();
  if (!response.ok) throw new Error(`M04 settings ${method} failed (${response.status}, ${value.error?.status || 'unknown'}).`);
  return value;
}
try {
  const databaseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)`, database = await request(databaseUrl);
  console.log(JSON.stringify({ projectId: config.projectId, location: database.locationId, edition: database.databaseEdition, apply }));
  const authUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.projectId}/config`, current = await request(authUrl);
  const authorizedDomains = [...new Set([...(current.authorizedDomains || []), 'localhost', new URL(config.origin).hostname])];
  if (apply && authorizedDomains.length !== current.authorizedDomains.length) await request(`${authUrl}?updateMask=authorizedDomains`, 'PATCH', { authorizedDomains });
  console.log(JSON.stringify({ emailPasswordEnabled: current.signIn?.email?.enabled, authorizedDomains }));
  const indexUrl = `${databaseUrl}/collectionGroups/-/indexes`, existing = await request(indexUrl);
  console.log(JSON.stringify({ existingIndexes: existing.indexes?.length || 0 }));
  if (!apply) process.exitCode = 0;
  else {
    const manifest = JSON.parse(readFileSync('firestore.m04.indexes.json', 'utf8'));
    for (const index of manifest.indexes) {
      const fields = index.fields, prefix = `${databaseUrl}/collectionGroups/${index.collectionGroup}/indexes`;
      const found = existing.indexes?.find(item => item.name.includes(`/collectionGroups/${index.collectionGroup}/`) && item.queryScope === index.queryScope && JSON.stringify(item.fields) === JSON.stringify(fields));
      if (!found) await request(prefix, 'POST', { queryScope: index.queryScope, fields });
    }
    for (const field of manifest.fieldOverrides) await request(`${databaseUrl}/collectionGroups/${field.collectionGroup}/fields/${field.fieldPath}?updateMask=indexConfig`, 'PATCH', { indexConfig: { indexes: field.indexes } });
    console.log('M04 indexes submitted. Wait for READY before live query tests.');
    const rulesUrl = `https://firebaserules.googleapis.com/v1/projects/${config.projectId}`;
    const ruleset = await request(`${rulesUrl}/rulesets`, 'POST', { source: { files: [{ name: 'firestore.rules', content: readFileSync('firestore.m04.rules', 'utf8') }] } });
    const releaseName = `projects/${config.projectId}/releases/cloud.firestore`;
    const releases = await request(`${rulesUrl}/releases`);
    if (releases.releases?.some(release => release.name === releaseName)) await request(`https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`, 'PATCH', { release: { name: releaseName, rulesetName: ruleset.name } });
    else await request(`${rulesUrl}/releases`, 'POST', { name: releaseName, rulesetName: ruleset.name });
    console.log('M04 browser-deny Firestore rules published.');
  }
} finally { await db.terminate(); }
