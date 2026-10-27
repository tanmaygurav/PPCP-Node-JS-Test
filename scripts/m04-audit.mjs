import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { environment, client, writeReport } from './m04-test-support.mjs';
import { files, displayId } from '../src/m04/domain.mjs';
const context = await environment(), samples = [], checks = [];
try {
  const pool = JSON.parse(readFileSync('.local/m04-accounts.json', 'utf8'));
  if (pool.projectId !== context.config.projectId || !pool.faculty) throw new Error('Matching M04 faculty fixture required.');
  const actor = await client(context, pool.faculty, samples);
  // This explicit verification scan is bounded, separate from application queries.
  const snapshot = await context.db.collection('submissions').orderBy('sequence').limit(1001).get();
  if (snapshot.size > 1000) throw new Error('Audit bound exceeded; increase deliberately before claiming a complete audit.');
  const expected = snapshot.docs.map(doc => doc.data()), expectedIds = expected.map(item => item.id);
  assert.equal(new Set(expected.map(item => item.sequence)).size, expected.length);
  for (const item of expected) { assert.equal(item.displayId, displayId(item.sequence)); files(item.media); assert(item.version >= 1); }
  checks.push('unique numeric/readable IDs and current attachment limits');
  const summaries = [];
  for (const sort of ['id', 'newest', 'oldest', 'edited']) {
    let cursor = '', pages = 0; const ids = [];
    do {
      const page = await actor.api(`submissions?${new URLSearchParams({ sort, limit: '7', ...(cursor ? { cursor } : {}) })}`);
      ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor; pages++;
      if (pages > 200) throw new Error('Unexpected pagination loop.');
    } while (cursor);
    assert.equal(ids.length, new Set(ids).size, 'Duplicate page entry');
    assert.deepEqual([...ids].sort(), [...expectedIds].sort(), 'Missing or unexpected page entry');
    if (sort === 'id') assert.deepEqual(ids, expectedIds);
    summaries.push({ sort, pages, records: ids.length });
  }
  checks.push('all list pages have no duplicate or missing records in a static dataset');
  const control = (await context.db.collection('counters').doc('access').get()).data();
  const activeAdmins = (await context.db.collection('users').where('role', '==', 'admin').where('status', '==', 'active').count().get()).data().count;
  assert.equal(control.admins, activeAdmins); assert(activeAdmins >= 1); checks.push('active administrator counter matches profiles');
  writeReport('audit', { passed: true, origin: context.origin, checks, records: expected.length, pagination: summaries, activeAdmins, concurrentWrites: 'Run only after workload writers finish.' });
} catch (error) { writeReport('audit', { passed: false, origin: context.origin, checks, samples, failure: error.message }); process.exitCode = 1; }
finally { await context.db.terminate(); }
