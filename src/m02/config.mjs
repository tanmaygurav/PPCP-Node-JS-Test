import { existsSync, readFileSync } from 'node:fs';

export function loadM02Env() {
  if (!process.env.VERCEL && existsSync('.env.m02.local')) process.loadEnvFile('.env.m02.local');
}
export function m02Config() {
  const origin = process.env.APP_ORIGIN || 'http://localhost:3002';
  if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an exact origin.');
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && (process.env.VERCEL || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))) {
    throw new Error('Firebase Emulator is allowed only on local development servers.');
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID in .env.m02.local. See M02_SETUP.md.');
  const secret = process.env.M02_SIGNING_SECRET || '';
  if (secret.length < 32) throw new Error('M02_SIGNING_SECRET needs at least 32 random characters.');
  let saved = {};
  if (!process.env.VERCEL && existsSync('.local/google-oauth.json')) saved = JSON.parse(readFileSync('.local/google-oauth.json', 'utf8'));
  const config = {
    origin, secret, projectId, emulator,
    clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || saved.refresh_token || '',
    spreadsheetId: process.env.M02_GOOGLE_SPREADSHEET_ID || '', folderId: process.env.M02_GOOGLE_MEDIA_FOLDER_ID || '',
    web: { apiKey: process.env.FIREBASE_WEB_API_KEY || 'emulator-only', authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`, projectId,
      appId: process.env.FIREBASE_WEB_APP_ID || '' }
  };
  // Prevent accidental writes into the preserved M01 resources, including partial configuration.
  if (config.spreadsheetId === '15UGqhLqvg9dbuQ9AAAmtRbxiZvcI0z8ZQY46Kl-WcpA' || config.folderId === '1NCKrlzniwuUaEcBNVzW4LocVYPYu5sem') {
    throw new Error('M02 must use separate Google test resources.');
  }
  return config;
}
