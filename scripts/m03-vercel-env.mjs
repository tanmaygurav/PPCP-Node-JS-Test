import { readFileSync, writeFileSync } from 'node:fs';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
loadM03Env(); const config = m03Config(), suffix = config.checkpoint.slice(-1).toLowerCase();
const projects = { a: 'prj_mH12fBmpYgAMbzNpI9i97Cr8wnqv', b: 'prj_LZL4nesFDJRUkwWxcJOtjyyKY9ha' };
const projectId = projects[suffix], teamId = 'team_abf9xIKj95Kv5Rei3QPOU6Gb';
if (suffix === 'b' && !config.redis.token) {
  process.loadEnvFile('.local/m03-b-link/.env.redis.local');
  process.env.UPSTASH_REDIS_REST_URL ||= process.env.KV_REST_API_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN ||= process.env.KV_REST_API_TOKEN;
  let local = readFileSync('.env.m03-b.local', 'utf8');
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (!process.env[key]) throw new Error(`Missing ${key}.`);
    local += `\n${key}=${JSON.stringify(process.env[key])}\n`;
  }
  writeFileSync('.env.m03-b.local', local);
}
const values = {
  M03_CHECKPOINT: config.checkpoint, APP_ORIGIN: `https://ppcp-m03-${suffix}-test.vercel.app`, FIREBASE_PROJECT_ID: config.projectId,
  FIREBASE_WEB_API_KEY: config.web.apiKey, FIREBASE_AUTH_DOMAIN: config.web.authDomain, FIREBASE_WEB_APP_ID: config.web.appId,
  GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_REFRESH_TOKEN: config.refreshToken,
  M03_GOOGLE_SPREADSHEET_ID: config.spreadsheetId, M03_GOOGLE_MEDIA_FOLDER_ID: config.folderId, M03_SIGNING_SECRET: config.secret,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || JSON.stringify(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
  ...(suffix === 'b' ? { UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN, M03_COORDINATION_NAMESPACE: config.redis.namespace } : {})
};
if (Object.values(values).some(value => !value)) throw new Error('Complete local M03 configuration first.');
if (JSON.parse(values.FIREBASE_SERVICE_ACCOUNT_JSON).project_id !== 'ppcp-auth-test') throw new Error('Test Firebase credentials only.');
if (!process.argv.includes('--apply')) { console.log('Dry run:', config.checkpoint, Object.keys(values)); process.exit(0); }
const { token } = JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8'));
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const project = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, { headers });
if (!project.ok || (await project.json()).name !== `ppcp-m03-${suffix}-test`) throw new Error('M03 project identity mismatch.');
const response = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&upsert=true`, { method: 'POST', headers, body: JSON.stringify(Object.entries(values).map(([key, value]) => ({ key, value, type: 'sensitive', target: ['production', 'preview'] }))) });
if (!response.ok) throw new Error(`Environment configuration failed: HTTP ${response.status}. No values logged.`);
console.log(`Configured ${config.checkpoint}; credentials were not printed.`);
