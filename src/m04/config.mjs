import { existsSync } from 'node:fs';
const protectedFolders = new Set(['1NCKrlzniwuUaEcBNVzW4LocVYPYu5sem', '1d-NdxhDeEFJywRlESw2p_UjP7nOgQKT4', '1Elgmj7cCydeGpf2qOmvzFyzfGjWwQeFf', '1dXZzRW3o08Is2wo02XlQxvhBiSLOHwGe', '1-mjC_Lo91Xg6aXeICugaam0PnjznebCA', '1hmGXIGTTcUD6Fynk1NfBTPwryv7yhcZm']);
export function loadM04Env() { if (!process.env.VERCEL && existsSync('.env.m04.local')) process.loadEnvFile('.env.m04.local'); }
export function m04Config(env = process.env) {
  const origin = env.M04_APP_ORIGIN || 'http://localhost:3005', projectId = env.M04_FIREBASE_PROJECT_ID || '', emulator = env.FIREBASE_AUTH_EMULATOR_HOST;
  if (new URL(origin).origin !== origin) throw new Error('M04_APP_ORIGIN must be an exact origin.');
  if (!/^ppcp-m04-[a-z0-9-]+$/.test(projectId) && !(emulator && projectId.startsWith('demo-ppcp-m04'))) throw new Error('Use a dedicated ppcp-m04-* Firebase project.');
  if ((emulator || env.FIRESTORE_EMULATOR_HOST) && (env.VERCEL || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))) throw new Error('Emulators are local only.');
  const config = { origin, projectId, emulator, secret: env.M04_SIGNING_SECRET || '', folderId: env.M04_GOOGLE_MEDIA_FOLDER_ID || '', clientId: env.M04_GOOGLE_CLIENT_ID || '', clientSecret: env.M04_GOOGLE_CLIENT_SECRET || '', refreshToken: env.M04_GOOGLE_REFRESH_TOKEN || '', serviceAccount: env.M04_FIREBASE_SERVICE_ACCOUNT_JSON || '', bootstrapUids: (env.M04_BOOTSTRAP_ADMIN_UIDS || '').split(',').map(v => v.trim()).filter(Boolean), web: { projectId, apiKey: env.M04_FIREBASE_WEB_API_KEY || 'emulator-only', authDomain: env.M04_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`, appId: env.M04_FIREBASE_WEB_APP_ID || '' } };
  if (config.secret.length < 32) throw new Error('Set a new M04 signing secret of at least 32 characters.');
  if (protectedFolders.has(config.folderId)) throw new Error('M04 cannot use a preserved Drive folder.');
  if (config.serviceAccount && JSON.parse(config.serviceAccount).project_id !== projectId) throw new Error('M04 credential project mismatch.');
  if (!emulator && !config.serviceAccount) throw new Error('Set dedicated M04 Firebase credentials; legacy/default credentials are not used.');
  return config;
}
