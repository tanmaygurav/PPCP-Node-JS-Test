import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
import { M04Drive } from '../src/m04/drive.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { createM04Handler } from '../src/m04/app.mjs';
import { meteredDB } from '../src/m04/metered-db.mjs';
let handler;
export default async function api(req, res) {
  try {
    if (!handler) {
      loadM04Env(); const config = m04Config(), { database, auth } = services(config, { lazyFirestore: true });
      const store = new M04Store(config, null, new M04Drive(config)); let ready;
      store.initialize = () => ready ||= database().then(db => { store.db = meteredDB(db); });
      handler = createM04Handler(config, store, auth);
    }
    return await handler(req, res);
  } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'M04 configuration is unavailable. Contact the organizer.' })); }
}
