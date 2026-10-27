import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
import { M04Drive } from '../src/m04/drive.mjs';
import { M04Store } from '../src/m04/store.mjs';
import { createM04Handler } from '../src/m04/app.mjs';
let handler;
export default async function api(req, res) {
  try {
    if (!handler) { loadM04Env(); const config = m04Config(), { db, auth } = services(config); handler = createM04Handler(config, new M04Store(config, db, new M04Drive(config)), auth); }
    return await handler(req, res);
  } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'M04 configuration is unavailable. Contact the organizer.' })); }
}
