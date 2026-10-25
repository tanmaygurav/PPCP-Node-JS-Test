import { readFileSync } from 'node:fs';
import { loadM02Env, m02Config } from '../src/m02/config.mjs';
loadM02Env();
const config = m02Config();
const teamId = 'team_abf9xIKj95Kv5Rei3QPOU6Gb', projectId = 'prj_VSQ1HfIdZmNiFOhIT81Bja3jrAi2';
const apply = process.argv.includes('--apply');
const values = {
  APP_ORIGIN: 'https://ppcp-m02-auth-test-tanmays-projects-8434e035.vercel.app', FIREBASE_PROJECT_ID: config.projectId,
  FIREBASE_WEB_API_KEY: config.web.apiKey, FIREBASE_AUTH_DOMAIN: config.web.authDomain, FIREBASE_WEB_APP_ID: config.web.appId,
  GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_REFRESH_TOKEN: config.refreshToken,
  M02_GOOGLE_SPREADSHEET_ID: config.spreadsheetId, M02_GOOGLE_MEDIA_FOLDER_ID: config.folderId, M02_SIGNING_SECRET: config.secret,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || JSON.stringify(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')))
};
if (Object.values(values).some(value => !value)) throw new Error('Complete local M02 configuration before configuring Vercel.');
if (JSON.parse(values.FIREBASE_SERVICE_ACCOUNT_JSON).project_id !== config.projectId) throw new Error('Firebase credential project mismatch.');
if (!apply) { console.log('Dry run. Will configure only ppcp-m02-auth-test:', Object.keys(values).join(', ')); process.exit(0); }
const { token } = JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8'));
if (!token) throw new Error('Sign in to the isolated local Vercel CLI profile first.');
const project = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, { headers: { Authorization: `Bearer ${token}` } });
if (!project.ok || (await project.json()).name !== 'ppcp-m02-auth-test') throw new Error('Vercel target verification failed.');
const response = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&upsert=true`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(Object.entries(values).map(([key, value]) => ({ key, value, type: 'sensitive', target: ['production', 'preview'] })))
});
if (!response.ok) throw new Error(`Vercel configuration failed (HTTP ${response.status}); values were not logged.`);
console.log(`Configured ${Object.keys(values).length} sensitive variables on the separate M02 project. No values printed.`);
