import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
import { M04Drive } from '../src/m04/drive.mjs';
import { M04Store } from '../src/m04/store.mjs';
loadM04Env(); const config = m04Config(), { db } = services(config), store = new M04Store(config, db, new M04Drive(config));
const apply = process.argv.includes('--apply');
console.log(JSON.stringify({ apply, abandoned: await store.abandoned(apply), cleanup: await store.cleanup(apply) }, null, 2));
