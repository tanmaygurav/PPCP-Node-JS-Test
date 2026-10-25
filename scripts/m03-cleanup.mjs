import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { M03Store } from '../src/m03/store.mjs';
import { RedisCoordination } from '../src/m03/coordination.mjs';
loadM03Env(); const config = m03Config();
if (config.checkpoint !== 'M03-B') throw new Error('Cleanup is only for M03-B.');
const coordination = new RedisCoordination(config.redis);
if (!process.argv.includes('--apply')) {
  const entries = await coordination.command(['HLEN', `${coordination.namespace}:cleanup`]);
  console.log(JSON.stringify({ pendingFiles: entries, applied: false }));
} else console.log(JSON.stringify(await coordination.retryCleanup(new M03Store(config), 10)));
