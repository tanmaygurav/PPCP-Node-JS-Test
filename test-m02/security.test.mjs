import test from 'node:test';
import assert from 'node:assert/strict';
import { m02Fixture } from '../test-tools/m02-fixture.mjs';
import { sign } from '../src/security.mjs';
const identities = {
  alice: { uid: 'alice', email: 'alice@welingkar.org', email_verified: true },
  bob: { uid: 'bob', email: 'bob@welingkar.org', email_verified: true },
  faculty: { uid: 'faculty', email: 'faculty@welingkar.org', email_verified: true },
  unverified: { uid: 'unverified', email: 'test@welingkar.org', email_verified: false },
  outsider: { uid: 'outsider', email: 'test@example.com', email_verified: true }
};
async function fixture(t) {
  const revoked = new Set();
  const auth = {
    verifyIdToken: async token => { if (!identities[token]) throw new Error(); return { ...identities[token], auth_time: Date.now() / 1000 }; },
    createSessionCookie: async token => token,
    verifySessionCookie: async token => { if (!identities[token] || revoked.has(token)) throw new Error(); return identities[token]; },
    revokeRefreshTokens: async uid => { revoked.add(uid); }
  };
  const f = await m02Fixture(auth); t.after(f.close);
  for (const name of ['alice', 'bob', 'faculty']) f.profiles.set(name, { uid: name, email: identities[name].email, name, studentId: '01', program: 'Test', role: name === 'faculty' ? 'faculty' : 'student', status: 'active' });
  f.as = (name, path, data, headers) => f.call(path, data, `ppcp_m02=${name}`, headers);
  return f;
}
const submission = { title: 'Synthetic problem', description: 'Synthetic observation', domain: 'Education', solution: '' };
test('M02-A01 missing, invalid, unverified and wrong-domain identities are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('submissions')).status, 401);
  assert.equal((await f.as('invalid', 'submissions')).status, 401);
  assert.equal((await f.call('auth/session', { idToken: 'unverified' })).status, 403);
  assert.equal((await f.call('auth/session', { idToken: 'outsider' })).status, 403);
  assert.equal((await f.call('session', { accessKey: f.config.secret })).status, 401);
});
test('M02-A02 new profiles default to student and cannot self-promote', async t => {
  const f = await fixture(t); f.profiles.delete('alice');
  const result = await f.as('alice', 'profile', { name: 'Alice', program: 'Test', studentId: '01', role: 'admin', email: 'faculty@welingkar.org' });
  assert.equal(result.body.profile.role, 'student'); assert.equal(result.body.profile.email, 'alice@welingkar.org');
  assert.equal((await f.as('alice', 'checks')).status, 403);
});
test('M02-A03 ownership covers list, detail, remarks, attachments and upload tickets', async t => {
  const f = await fixture(t);
  const plan = await f.as('alice', 'upload-sessions', { files: [{ name: 'test.pdf', size: 10 }] });
  assert.equal((await f.as('bob', 'submissions', { ...submission, ticket: plan.body.ticket })).status, 403);
  const saved = await f.as('alice', 'submissions', { ...submission, email: 'forged@example.com', ownerUid: 'bob', ticket: plan.body.ticket });
  assert.equal(saved.status, 201); assert.equal(saved.body.item.email, 'alice@welingkar.org'); assert.equal(saved.body.item.ownerUid, 'alice');
  const id = saved.body.item.id, file = plan.body.uploads[0].id;
  assert.equal((await f.as('bob', 'submissions')).body.total, 0);
  for (const path of [`submissions/${id}`, `submissions/${id}/remarks`, `submissions/${id}/files/${file}`]) assert.equal((await f.as('bob', path)).status, 404);
  assert.equal((await f.as('alice', `submissions/${id}/files/${file}`)).body, 'synthetic attachment');
  assert.equal((await f.as('alice', `submissions/${id}/files/unknown`)).status, 404);
  assert.equal((await f.as('alice', `submissions/${id}/remarks`, { remark: 'forged' })).status, 403);
  assert.equal((await f.as('faculty', `submissions/${id}/remarks`, { remark: 'Review', givenBy: 'forged' })).body.item.givenBy, 'faculty@welingkar.org');
  assert.equal((await f.as('faculty', 'submissions')).body.total, 1);
  assert.equal((await f.as('alice', 'submissions', { ...submission, ticket: plan.body.ticket })).body.alreadySaved, true);
  assert.equal(f.records.length, 1);
});
test('M02-A04 ticket tampering, expiry, foreign origins and disabled profiles fail closed', async t => {
  const f = await fixture(t);
  assert.equal((await f.as('alice', 'upload-sessions', { files: [] }, { origin: 'https://elsewhere.example' })).status, 403);
  const plan = await f.as('alice', 'upload-sessions', { files: [] });
  assert.equal((await f.as('alice', 'submissions', { ...submission, ticket: `${plan.body.ticket}x` })).status, 401);
  const expired = sign(f.config.secret, { kind: 'm02-upload', uid: 'alice', exp: Date.now() - 1000 });
  assert.equal((await f.as('alice', 'submissions', { ...submission, ticket: expired })).status, 401);
  f.profiles.get('alice').status = 'disabled'; assert.equal((await f.as('alice', 'submissions')).status, 403);
});
test('M02-A05 logout revokes saved sessions and clears the browser cookie', async t => {
  const f = await fixture(t);
  const login = await f.call('auth/session', { idToken: 'alice' }); assert.equal(login.cookie, 'ppcp_m02=alice');
  assert.equal((await f.as('alice', 'auth/logout', {})).cookie, 'ppcp_m02=');
  assert.equal((await f.as('alice', 'me')).status, 401);
});
