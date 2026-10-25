import { existsSync, readFileSync } from 'node:fs';

const protectedIds = new Set(['15UGqhLqvg9dbuQ9AAAmtRbxiZvcI0z8ZQY46Kl-WcpA', '1NCKrlzniwuUaEcBNVzW4LocVYPYu5sem', '1IKhPcT5cYwcGOUAuvZ9HfW_i0RGiRC4c8UDgr1zuCAo', '1d-NdxhDeEFJywRlESw2p_UjP7nOgQKT4']);
export function loadM03Env() {
  if (!process.env.VERCEL) {
    const checkpoint = process.env.M03_CHECKPOINT || 'M03-B';
    const path = checkpoint === 'M03-A' ? '.env.m03-a.local' : '.env.m03-b.local';
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
export function m03Config() {
  const checkpoint = process.env.M03_CHECKPOINT || 'M03-B';
  if (!['M03-A', 'M03-B'].includes(checkpoint)) throw new Error('Invalid M03 checkpoint.');
  const origin = process.env.APP_ORIGIN || (checkpoint === 'M03-A' ? 'http://localhost:3003' : 'http://localhost:3004');
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an exact origin.');
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && (process.env.VERCEL || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))) throw new Error('Emulator allowed only locally.');
  let saved = {};
  if (!process.env.VERCEL && existsSync('.local/google-oauth.json')) saved = JSON.parse(readFileSync('.local/google-oauth.json', 'utf8'));
  const config = {
    checkpoint, origin, emulator, projectId: process.env.FIREBASE_PROJECT_ID,
    secret: process.env.M03_SIGNING_SECRET || '', clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '', refreshToken: process.env.GOOGLE_REFRESH_TOKEN || saved.refresh_token || '',
    spreadsheetId: process.env.M03_GOOGLE_SPREADSHEET_ID || '', folderId: process.env.M03_GOOGLE_MEDIA_FOLDER_ID || '',
    redis: { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, namespace: process.env.M03_COORDINATION_NAMESPACE },
    web: { apiKey: process.env.FIREBASE_WEB_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, projectId: process.env.FIREBASE_PROJECT_ID, appId: process.env.FIREBASE_WEB_APP_ID }
  };
  if (!config.projectId || config.secret.length < 32) throw new Error('M03 Firebase and signing configuration incomplete.');
  if (protectedIds.has(config.spreadsheetId) || protectedIds.has(config.folderId)) throw new Error('M03 cannot use M01 or M02 resources.');
  return config;
}
