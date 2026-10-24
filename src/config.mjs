import { existsSync, readFileSync } from 'node:fs';

export function loadLocalEnv() {
  if (!process.env.VERCEL && existsSync('.env.local')) process.loadEnvFile('.env.local');
}

export function readConfig() {
  let saved = {};
  if (!process.env.VERCEL && existsSync('.local/google-oauth.json')) {
    saved = JSON.parse(readFileSync('.local/google-oauth.json', 'utf8'));
  }
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash.');
  const secret = process.env.TEST_ACCESS_KEY || '';
  if (secret.length < 32) throw new Error('Set TEST_ACCESS_KEY to at least 32 random characters. Run npm run setup.');
  return {
    origin, secret,
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || saved.refresh_token || '',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    folderId: process.env.GOOGLE_MEDIA_FOLDER_ID || ''
  };
}
