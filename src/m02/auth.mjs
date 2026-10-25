import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { AppError } from '../domain.mjs';

export function firebaseAuth(config) {
  const name = `m02-${config.projectId}`;
  let app = getApps().find(item => item.name === name);
  if (!app) {
    const options = { projectId: config.projectId };
    if (!config.emulator) options.credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
    app = initializeApp(options, name);
  }
  return getAuth(app);
}
export function allowedIdentity(identity) {
  const email = String(identity.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@welingkar\.org$/.test(email) || !identity.email_verified) {
    throw new AppError(403, 'Verify your @welingkar.org email before accessing the portal.');
  }
  return { uid: identity.uid || identity.sub, email };
}
export const SESSION_SECONDS = 3600;
export function sessionCookie(config, value, age = SESSION_SECONDS) {
  return `ppcp_m02=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.origin.startsWith('https:') ? '; Secure' : ''}`;
}
export async function authenticate(req, auth) {
  const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ppcp_m02='))?.slice(9);
  if (!value) throw new AppError(401, 'Please sign in.');
  try { return allowedIdentity(await auth.verifySessionCookie(value, true)); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(401, 'Your session expired. Please sign in again.'); }
}
