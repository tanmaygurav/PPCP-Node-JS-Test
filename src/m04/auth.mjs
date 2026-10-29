import { span } from './telemetry.mjs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'node:module';
import { AppError, institutional, normalize } from './domain.mjs';
const require = createRequire(import.meta.url);
export function services(config, { lazyFirestore = false } = {}) {
  const name = `m04-${config.projectId}`;
  const app = getApps().find(app => app.name === name) || initializeApp({ projectId: config.projectId, ...(config.serviceAccount ? { credential: cert(JSON.parse(config.serviceAccount)) } : {}) }, name);
  // Deployed requests may load the large Firestore SDK while session validation
  // is in flight. CLI callers retain their synchronous database interface.
  const settings = { preferRest: !config.emulator };
  if (lazyFirestore) return { auth: getAuth(app), database: async () => { const { initializeFirestore } = await import('firebase-admin/firestore'); return initializeFirestore(app, settings); } };
  const { initializeFirestore } = require('firebase-admin/firestore');
  return { auth: getAuth(app), db: initializeFirestore(app, settings) };
}
export function allowedIdentity(identity) {
  if (!institutional(identity.email) || !identity.email_verified) throw new AppError(403, 'Verify your @welingkar.org or @welingkarmail.org email.');
  return { uid: identity.uid || identity.sub, email: normalize(identity.email) };
}
export const SESSION_SECONDS = 3600;
export function sessionCookie(config, value, age = SESSION_SECONDS) { return `ppcp_m04=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.origin.startsWith('https:') ? '; Secure' : ''}`; }
export async function authenticate(req, auth, readProfile) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ppcp_m04='))?.slice(9);
  if (!token) throw new AppError(401, 'Please sign in.');
  let decoded; try { decoded = await span('auth-validate',()=>auth.verifySessionCookie(token,false)); } catch { throw new AppError(401, 'Session expired or disabled. Sign in again.'); }
  const identity = allowedIdentity(decoded);
  if (!readProfile) {
    try { return allowedIdentity(await span('auth-revoke',()=>auth.verifySessionCookie(token,true))); } catch { throw new AppError(401, 'Session expired or disabled. Sign in again.'); }
  }
  // Only a cryptographically verified institutional UID may start this read.
  // The SDK still checks revocation/disabled state before any response is sent.
  const revocation = span('auth-revoke',()=>auth.verifySessionCookie(token,true)).catch(() => { throw new AppError(401, 'Session expired or disabled. Sign in again.'); });
  const [checked, profile] = await Promise.all([revocation, readProfile(identity.uid)]);
  return { identity: allowedIdentity(checked), profile };
}
