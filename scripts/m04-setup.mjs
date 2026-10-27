import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { formatEnv } from '../src/m04/envfile.mjs';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const path = '.env.m04.local', env = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
if (existsSync('.local/m04-firebase-admin.json')) { const credential = json('.local/m04-firebase-admin.json'); if (!/^ppcp-m04-[a-z0-9-]+$/.test(credential.project_id)) throw new Error('Expected a dedicated ppcp-m04-* service account.'); env.M04_FIREBASE_PROJECT_ID = credential.project_id; env.M04_FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(credential); }
if (existsSync('.local/m04-oauth-client.json')) { const client = json('.local/m04-oauth-client.json').installed; if (!client) throw new Error('Download a new Desktop OAuth client JSON.'); env.M04_GOOGLE_CLIENT_ID = client.client_id; env.M04_GOOGLE_CLIENT_SECRET = client.client_secret; }
if (existsSync('.local/m04-web-config.json')) { const web = json('.local/m04-web-config.json'); if (env.M04_FIREBASE_PROJECT_ID && web.projectId !== env.M04_FIREBASE_PROJECT_ID) throw new Error('Firebase web/service-account project mismatch.'); env.M04_FIREBASE_PROJECT_ID = web.projectId; env.M04_FIREBASE_WEB_API_KEY = web.apiKey; env.M04_FIREBASE_AUTH_DOMAIN = web.authDomain; env.M04_FIREBASE_WEB_APP_ID = web.appId; }
env.M04_SIGNING_SECRET ||= randomBytes(32).toString('hex'); env.M04_APP_ORIGIN ||= 'http://localhost:3005'; env.PPCP_MILESTONE = 'M04';
for (const key of ['M04_GOOGLE_MEDIA_FOLDER_ID', 'M04_BOOTSTRAP_ADMIN_UIDS']) env[key] ||= '';
if (Object.keys(env).some(key => !key.startsWith('M04_') && key !== 'PPCP_MILESTONE')) throw new Error('M04 environment must not contain legacy configuration.');
writeFileSync(path, formatEnv(env), { mode: 0o600 });
console.log('M04 configuration saved locally. No credentials printed.');
