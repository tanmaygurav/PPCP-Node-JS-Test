import { randomUUID } from 'node:crypto';
import { environment, accountPool, client, uploadSave, writeReport } from './m04-test-support.mjs';
const context = await environment(), samples = [], requested = Number(process.argv.find(arg => arg.startsWith('--users='))?.slice(8) || 5), stages = [5, 20, 60, 120];
if (requested === 200) stages.push(200);
if (!stages.includes(requested) || !process.argv.includes('--write')) throw new Error('Use --write --users=5|20|60|120|200. Earlier stages are mandatory.');
const passedStages = [], ids = new Set(), failures = [];
try {
  const pool = await accountPool(context, requested), actors = [];
  for (const account of pool.students.slice(0, requested)) actors.push(await client(context, account, samples));
  const domains = (await actors[0].api('domains')).domains; if (!domains.length) throw new Error('Seed an active M04 domain.');
  for (const users of stages.filter(value => value <= requested)) {
    const stageStart = samples.length;
    const results = await Promise.allSettled(actors.slice(0, users).map(async (actor, i) => {
      await actor.api('submissions?limit=20');
      const values = { title: `M04 capacity ${users}/${i}/${randomUUID()}`, domain: domains[0], description: 'Independent synthetic M04 capacity fixture.', solution: '' };
      const saved = await uploadSave(actor, values, [{ name: 'capacity.pdf', size: 1000000 }], null, samples);
      const item = (await actor.api(`submissions/${saved.receipt.submissionId}`)).item;
      if (item.ownerUid !== actor.uid || item.title !== values.title || ids.has(item.displayId)) throw new Error('Submission integrity mismatch or duplicate ID.'); ids.add(item.displayId);
      const edit = await uploadSave(actor, { ...values, title: values.title + ' edited' }, [], item, samples);
      await actor.api(`submissions/${item.id}/lock`, { operationId: randomUUID(), expectedVersion: edit.receipt.version }); return item.id;
    }));
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason.message);
    const current = samples.slice(stageStart), p95 = list => { const values = list.map(row => row.ms).sort((a, b) => a - b); return values.length ? values[Math.ceil(values.length * .95) - 1] : null; };
    const readP95 = p95(current.filter(row => row.method === 'GET' && (row.path === 'submissions' || /^submissions\/[\w-]+$/.test(row.path))).filter(row => row.status === 200));
    const saveP95 = p95(current.filter(row => row.method === 'POST' && (row.path === 'submissions' || row.path.endsWith('/edits'))));
    const stage = { users, completed: results.filter(r => r.status === 'fulfilled').length, failures: results.filter(r => r.status === 'rejected').length, readP95ms: readP95, saveP95ms: saveP95 };
    console.log(JSON.stringify(stage)); passedStages.push(stage);
    if (failures.length || current.some(row => row.status === 429 || row.status === 503)) throw new Error('Stopped before the next stage after request/integrity failure or quota pressure.');
    if ((readP95 || 0) > 2000 || (saveP95 || 0) > 3000) throw new Error('Stopped before the next stage because latency targets did not pass.');
  }
  writeReport('capacity', { passed: true, origin: context.origin, stages: passedStages, samples, measuredScope: 'Concurrent synthetic browser-like API workflows; rendering excluded; transfers timed separately.' });
} catch (error) { writeReport('capacity', { passed: false, origin: context.origin, stages: passedStages, failures, samples, failure: error.message }); process.exitCode = 1; }
finally { await context.db.terminate(); }
