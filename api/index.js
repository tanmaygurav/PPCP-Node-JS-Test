import { createHandler } from '../src/app.mjs';
import { readConfig } from '../src/config.mjs';
import { GoogleStore } from '../src/google.mjs';

let handler;
export default async function api(req, res) {
  if (!handler) {
    const config = readConfig();
    handler = createHandler(config, new GoogleStore(config));
  }
  return handler(req, res);
}
