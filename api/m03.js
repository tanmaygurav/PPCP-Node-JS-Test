import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M02Store } from '../src/m02/store.mjs';
import { M03Store } from '../src/m03/store.mjs';
import { RedisCoordination } from '../src/m03/coordination.mjs';
import { createM03Handler } from '../src/m03/app.mjs';
import { measure, measuredFetch } from '../src/m03/metrics.mjs';
let handler;
export default async function api(req, res) {
  if (!handler) {
    loadM03Env(); const config = m03Config(), baseline = config.checkpoint === 'M03-A';
    handler = measure(createM03Handler(config, baseline ? new M02Store(config, measuredFetch('google')) : new M03Store(config, measuredFetch('google')), firebaseAuth(config), baseline ? null : new RedisCoordination(config.redis, measuredFetch('redis'))));
  }
  return handler(req, res);
}
