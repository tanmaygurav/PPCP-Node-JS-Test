import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
loadM04Env(); const config = m04Config(), { auth, db } = services(config);
if (config.projectId !== 'ppcp-m04-redesign' || config.emulator) throw new Error('Approved M04 project only.');
const domain = 'ppcp-m04-event-poc.vercel.app';
try {
  const { access_token } = await auth.app.options.credential.getAccessToken();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.projectId}/config`, headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Auth settings read failed (${response.status}).`);
  const current = await response.json(), authorizedDomains = [...new Set([...(current.authorizedDomains || []), domain])];
  if (!current.authorizedDomains?.includes(domain)) {
    const updated = await fetch(`${url}?updateMask=authorizedDomains`, { method: 'PATCH', headers, body: JSON.stringify({ authorizedDomains }), signal: AbortSignal.timeout(30000) });
    if (!updated.ok) throw new Error(`Auth domain update failed (${updated.status}).`);
  }
  console.log(JSON.stringify({ projectId: config.projectId, authorizedDomain: domain }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.terminate(); }
