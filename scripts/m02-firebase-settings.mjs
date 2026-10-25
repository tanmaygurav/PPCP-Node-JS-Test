import { loadM02Env, m02Config } from '../src/m02/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
loadM02Env(); const config = m02Config();
if (config.projectId !== 'ppcp-auth-test' || config.emulator) throw new Error('Only the real M02 test project may be configured.');
const auth = firebaseAuth(config), { access_token } = await auth.app.options.credential.getAccessToken();
const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.projectId}/config`;
const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
const response = await fetch(endpoint, { headers });
if (!response.ok) throw new Error(`Firebase configuration read failed (HTTP ${response.status}).`);
const current = await response.json();
const authorizedDomains = [...new Set([...(current.authorizedDomains || []).filter(domain => domain !== 'ppcp-m02-auth-test.vercel.app'), 'localhost', 'ppcp-m02-auth-test-tanmays-projects-8434e035.vercel.app'])];
console.log(JSON.stringify({ projectId: config.projectId, emailPasswordEnabled: current.signIn?.email?.enabled, authorizedDomains: current.authorizedDomains || [], missingDomains: authorizedDomains.filter(domain => !current.authorizedDomains?.includes(domain)) }));
if (process.argv.includes('--apply')) {
  const updated = await fetch(`${endpoint}?updateMask=authorizedDomains`, { method: 'PATCH', headers, body: JSON.stringify({ authorizedDomains }) });
  if (!updated.ok) throw new Error(`Firebase domain configuration failed (HTTP ${updated.status}).`);
  console.log('Added local and stable M02 pilot hosts; preserved existing domains and sign-in configuration.');
}
