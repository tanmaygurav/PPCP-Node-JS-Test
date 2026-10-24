import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './domain.mjs';

export function equal(a, b) {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
export function sign(secret, value) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verify(secret, token, kind) {
  try {
    if (typeof token !== 'string' || token.length > 20_000) throw new Error();
    const [payload, signature, extra] = token.split('.');
    if (extra || !equal(signature, createHmac('sha256', secret).update(payload).digest('base64url'))) throw new Error();
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (value.kind !== kind || !Number.isFinite(value.exp) || value.exp < Date.now()) throw new Error();
    return value;
  } catch { throw new AppError(401, 'Session or upload ticket is invalid or expired.'); }
}
export function session(req, config) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ppcp_session='))?.slice(13);
  return verify(config.secret, token, 'session');
}
export function cookie(config, token, maxAge = 28_800) {
  return `ppcp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${config.origin.startsWith('https:') ? '; Secure' : ''}`;
}
