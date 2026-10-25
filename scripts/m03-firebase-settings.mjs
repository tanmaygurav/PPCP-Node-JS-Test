import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
loadM03Env(); const config = m03Config();
if (config.projectId !== 'ppcp-auth-test' || config.emulator) throw new Error('Personal test project only.');
const auth = firebaseAuth(config), { access_token } = await auth.app.options.credential.getAccessToken();
const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.projectId}/config`;
const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
const response = await fetch(endpoint, { headers }); if (!response.ok) throw new Error(`Firebase settings read failed: ${response.status}`);
const current = await response.json(), authorizedDomains = [...new Set([...(current.authorizedDomains || []), 'localhost', 'ppcp-m03-a-test.vercel.app', 'ppcp-m03-b-test.vercel.app'])];
console.log(JSON.stringify({ projectId: config.projectId, emailPasswordEnabled: current.signIn?.email?.enabled, adding: authorizedDomains.filter(domain => !current.authorizedDomains?.includes(domain)) }));
if (process.argv.includes('--apply')) {
  const updated = await fetch(`${endpoint}?updateMask=authorizedDomains`, { method: 'PATCH', headers, body: JSON.stringify({ authorizedDomains }) });
  if (!updated.ok) throw new Error(`Firebase settings update failed: ${updated.status}`);
  console.log('Added M03 hosts; preserved existing Firebase settings.');
}
