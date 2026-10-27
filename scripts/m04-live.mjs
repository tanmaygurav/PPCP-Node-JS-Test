import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { environment, accountPool, client, uploadSave, writeReport } from './m04-test-support.mjs';
const context = await environment(), samples = [], checks = [];
if (!process.argv.includes('--write')) { console.log('M04 health passed. Use --write for synthetic accounts, submissions and real Drive uploads.'); await context.db.terminate(); process.exit(0); }
try {
  await context.store.drive.checkFolder(); const pool = await accountPool(context, 2, true), student = await client(context, pool.students[0], samples), other = await client(context, pool.students[1], samples), faculty = await client(context, pool.faculty, samples), admin = await client(context, pool.admin, samples);
  const domains = (await student.api('domains')).domains; if (!domains.length) throw new Error('Seed at least one active M04 domain first.');
  const values = { title: `M04 synthetic ${randomUUID()}`, domain: domains[0], description: 'Retained labelled live verification submission.', solution: '' };
  const saved = await uploadSave(student, values, [{ name: 'proof.pdf', size: 1000000 }], null, samples), item = (await student.api(`submissions/${saved.receipt.submissionId}`)).item;
  assert.match(item.displayId, /^PP\d+$/); assert.deepEqual(await student.api(saved.path, saved.data), saved.receipt); await other.api(`submissions/${item.id}`, undefined, 404); checks.push('create, exact retry and ownership');
  const view = await fetch(item.media[0].webViewLink, { redirect: 'follow', signal: AbortSignal.timeout(30000) }); const html = await view.text();
  assert(view.ok && !view.url.startsWith('https://accounts.google.com/') && html.includes('proof.pdf'), 'Anonymous Drive view did not show the expected file'); checks.push('real upload and anonymous direct Drive view');
  const edited = await uploadSave(student, { ...values, title: `${values.title} edited` }, [], item, samples); assert.deepEqual(await student.api(edited.path, edited.data), edited.receipt);
  await student.api(`submissions/${item.id}/lock`, { operationId: randomUUID(), expectedVersion: edited.receipt.version });
  await student.api('upload-sessions', { operationId: randomUUID(), submissionId: item.id, expectedVersion: edited.receipt.version + 1, files: [] }, 409);
  await faculty.api(`submissions/${item.id}/remarks`, { operationId: randomUUID(), remark: 'M04 synthetic review' });
  await faculty.api(`submissions/${item.id}/unlock`, { operationId: randomUUID(), expectedVersion: edited.receipt.version + 1 });
  assert.equal((await student.api(`submissions/${item.id}/remarks`)).items.length, 1); checks.push('edit, lock, remark and faculty unlock');
  await student.api('upload-sessions', { operationId: randomUUID(), files: [{ name: 'big.pdf', size: 5000001 }] }, 400);
  await student.api('upload-sessions', { operationId: randomUUID(), files: [{ name: 'a.pdf', size: 5000000 }, { name: 'b.pdf', size: 5000000 }, { name: 'c.pdf', size: 1 }] }, 400);
  await student.api('upload-sessions', { operationId: randomUUID(), files: Array.from({ length: 11 }, (_, i) => ({ name: `${i}.pdf`, size: 1 })) }, 400); checks.push('over-limit rejection');
  if (process.argv.includes('--boundaries')) {
    await uploadSave(student, { ...values, title: 'M04 exact 5MB/10MB boundary' }, [{ name: 'a.pdf', size: 5000000 }, { name: 'b.pdf', size: 5000000 }], null, samples);
    await uploadSave(student, { ...values, title: 'M04 exact ten-file boundary' }, Array.from({ length: 10 }, (_, i) => ({ name: `${i}.pdf`, size: 1000000 })), null, samples); checks.push('actual 5MB/file, 10MB total, ten-file boundaries');
  }
  const user = (await admin.api(`admin/users?email=${encodeURIComponent(pool.faculty.email)}`)).user; assert(user.emailVerified);
  const change = { operationId: randomUUID(), role: 'faculty', status: 'disabled' }; await admin.api(`admin/users/${user.uid}`, change); await faculty.api('submissions', undefined, 403);
  await admin.api(`admin/users/${user.uid}`, { operationId: randomUUID(), role: 'faculty', status: 'active' }); checks.push('admin deactivation denies existing faculty session');
  for (const searchBy of ['id', 'email', 'domain', 'name', 'title']) for (const sort of ['newest', 'oldest', 'edited', 'id']) {
    const search = { id: item.displayId, email: item.email, domain: item.domain, name: item.name.slice(0, 5), title: 'M04' }[searchBy]; await faculty.api(`submissions?${new URLSearchParams({ searchBy, search, sort, limit: '2', domain: item.domain, locked: 'false', remarked: 'true', from: '2026-01-01', to: '2030-01-01' })}`);
  }
  checks.push('deployed composite query/index combinations'); writeReport('live', { passed: true, origin: context.origin, projectId: context.config.projectId, checks, samples, mailDelivery: 'Synthetic identities verified through Admin SDK; no mailbox delivery claim.' });
} catch (error) { writeReport('live', { passed: false, origin: context.origin, checks, samples, failure: error.message }); process.exitCode = 1; }
finally { await context.db.terminate(); }
