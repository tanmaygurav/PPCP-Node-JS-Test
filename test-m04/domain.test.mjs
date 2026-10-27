import test from 'node:test';
import assert from 'node:assert/strict';
import { files, displayId, institutional, facets, digest } from '../src/m04/domain.mjs';
import { allowedIdentity } from '../src/m04/auth.mjs';
import { m04Config } from '../src/m04/config.mjs';
import { listSpec } from '../src/m04/query.mjs';
import { formatEnv } from '../src/m04/envfile.mjs';
import { parseEnv } from 'node:util';
test('local dotenv keeps service-account JSON and private-key newlines intact', () => {
  const value = JSON.stringify({ project_id: 'ppcp-m04-test', private_key: 'fake\nfake\n' });
  const parsed = parseEnv(formatEnv({ M04_FIREBASE_SERVICE_ACCOUNT_JSON: value }));
  assert.equal(parsed.M04_FIREBASE_SERVICE_ACCOUNT_JSON, value); assert.equal(JSON.parse(parsed.M04_FIREBASE_SERVICE_ACCOUNT_JSON).private_key, 'fake\nfake\n');
});
test('two exact institutional domains, verified identities and lookalike rejection', () => {
  for (const email of ['a@welingkar.org', 'b@welingkarmail.org']) assert.equal(allowedIdentity({ uid: 'a', email, email_verified: true }).email, email);
  for (const email of ['a@gmail.com', 'a@welingkar.org.evil.com', 'a@sub.welingkar.org', 'a@@welingkar.org']) assert.equal(institutional(email), false);
  assert.throws(() => allowedIdentity({ email: 'a@welingkar.org', email_verified: false }));
});
test('exact count, individual and combined attachment boundaries', () => {
  const f = size => ({ name: 'a.pdf', size });
  assert.equal(files([f(5000000), f(5000000)]).length, 2);
  assert.equal(files(Array.from({ length: 10 }, () => f(1000000))).length, 10);
  for (const value of [[f(5000001)], [f(5000000), f(5000000), f(1)], Array.from({ length: 11 }, () => f(1)), [f(0)], [{ name: '../x.pdf', size: 1 }], [{ name: 'x.exe', size: 1 }]]) assert.throws(() => files(value));
});
test('readable IDs extend past three digits and hashes ignore object key order', () => {
  assert.equal(displayId(1), 'PP001'); assert.equal(displayId(1000), 'PP1000'); assert.equal(digest({ b: 1, a: 2 }), digest({ a: 2, b: 1 }));
});
test('query filters use one indexed facet and stable bound cursors', () => {
  const profile = { uid: 's', role: 'student' }, params = new URLSearchParams({ domain: 'Education', locked: 'true', remarked: 'false', searchBy: 'title', search: 'Water', from: '2026-10-01', sort: 'newest' });
  const spec = listSpec(params, profile), item = { domainNormalized: 'education', locked: true, hasRemarks: false };
  assert(spec.filters.some(([f, op, value]) => f === 'facets' && op === 'array-contains' && facets(item).includes(value)));
  assert.deepEqual(spec.order, [['titleNormalized', 'asc'], ['createdAt', 'asc'], ['__name__', 'asc']]);
  assert.equal(spec.orderLabel, 'title A–Z'); assert.notEqual(spec.fingerprint, listSpec(params, { ...profile, role: 'faculty' }).fingerprint);
  assert.throws(() => listSpec(new URLSearchParams('limit=51'), profile));
});
test('M04 rejects legacy project, credentials and folders without fallback', () => {
  const env = { M04_FIREBASE_PROJECT_ID: 'ppcp-m04-test', M04_SIGNING_SECRET: 'x'.repeat(32), M04_FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'ppcp-m04-test' }) };
  assert.equal(m04Config(env).refreshToken, '');
  assert.throws(() => m04Config({ ...env, M04_FIREBASE_PROJECT_ID: 'ppcp-auth-test' }));
  assert.throws(() => m04Config({ ...env, M04_GOOGLE_MEDIA_FOLDER_ID: '1dXZzRW3o08Is2wo02XlQxvhBiSLOHwGe' }));
  assert.throws(() => m04Config({ ...env, M04_FIREBASE_SERVICE_ACCOUNT_JSON: '' }));
});
