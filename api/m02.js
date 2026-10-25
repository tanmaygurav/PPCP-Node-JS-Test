import { m02Config } from '../src/m02/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M02Store } from '../src/m02/store.mjs';
import { createM02Handler } from '../src/m02/app.mjs';
let handler;
export default async function api(req, res) {
  if (!handler) { const config = m02Config(); handler = createM02Handler(config, new M02Store(config), firebaseAuth(config)); }
  return handler(req, res);
}
