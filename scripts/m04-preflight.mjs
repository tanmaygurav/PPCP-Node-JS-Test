import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
import { M04Drive } from '../src/m04/drive.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { digest } from '../src/m04/domain.mjs';
loadM04Env(); const config = m04Config(), { auth, db } = services(config), drive = new M04Drive(config), store = new M04Store(config, db, drive);
await drive.checkFolder();
await db.collection('domains').limit(1).get();
await auth.listUsers(1);
if (process.argv.includes('--seed-domains')) {
  const names = (process.env.M04_DOMAINS || 'Education').split(',').map(v => v.trim()).filter(Boolean);
  for (const name of names) await store.ref('domains', digest(name.normalize('NFKC').toLowerCase())).set({ name, active: true });
}
console.log(JSON.stringify({ projectId: config.projectId, folderId: config.folderId, origin: config.origin, domains: await store.domains(), credentials: 'connected', anonymousSharing: 'Run m04-live --write to verify a real public attachment.' }, null, 2));
