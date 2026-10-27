import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirestore } from 'firebase-admin/firestore';
import { AppError, institutional, normalize } from './domain.mjs';
export function services(config) {
  const name = `m04-${config.projectId}`;
  const app = getApps().find(app => app.name === name) || initializeApp({ projectId: config.projectId, ...(config.serviceAccount ? { credential: cert(JSON.parse(config.serviceAccount)) } : {}) }, name);
  // REST avoids initializing a gRPC channel on each new serverless instance.
  // Transactions, indexes and per-request authorization remain unchanged.
  // The emulator uses gRPC so its credential-free mode cannot fall back to ADC.
  return { auth: getAuth(app), db: initializeFirestore(app, { preferRest: !config.emulator }) };
}
export function allowedIdentity(identity) {
  if (!institutional(identity.email) || !identity.email_verified) throw new AppError(403, 'Verify your @welingkar.org or @welingkarmail.org email.');
  return { uid: identity.uid || identity.sub, email: normalize(identity.email) };
}
export const SESSION_SECONDS = 3600;
export function sessionCookie(config, value, age = SESSION_SECONDS) { return `ppcp_m04=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.origin.startsWith('https:') ? '; Secure' : ''}`; }
export async function authenticate(req, auth) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ppcp_m04='))?.slice(9);
  if (!token) throw new AppError(401, 'Please sign in.');
  let decoded; try { decoded = await auth.verifySessionCookie(token, true); } catch { throw new AppError(401, 'Session expired or disabled. Sign in again.'); }
  return allowedIdentity(decoded);
}
