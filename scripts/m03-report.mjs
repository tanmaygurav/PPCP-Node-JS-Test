import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const files = readdirSync('output/m03').filter(file => file.endsWith('.json'));
const documents = files.map(file => ({ file, ...JSON.parse(readFileSync(`output/m03/${file}`, 'utf8')) }));
const matrices = documents.filter(row => row.runId?.startsWith('matrix-M03-A-') && row.rows.length === 5);
const selected = [];
for (const matrix of matrices) for (let i = 0; i < matrix.rows.length; i++) {
  const row = matrix.rows[i], end = matrix.rows[i + 1]?.startedAt || '9999';
  const match = documents.find(report => report.checkpoint === matrix.checkpoint && report.dataset === matrix.dataset && report.users === row.users && report.scenario === row.scenario && report.startedAt >= row.startedAt && report.startedAt < end);
  if (!match) throw new Error('A matrix report is missing.'); selected.push(match);
}
for (const users of [1, 5]) {
  const match = documents.filter(row => row.checkpoint === 'M03-B' && row.users === users && row.dataset === 1200).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (match) selected.push(match);
}
const errors = row => row.samples.filter(sample => sample.failed || !sample.status || sample.status >= 400).length;
const seconds = value => value === undefined ? '—' : (value / 1000).toFixed(2);
function p95(row, operation) {
  const values = row.samples.filter(sample => sample.operation === operation && sample.status >= 200 && sample.status < 300 && !sample.failed).map(sample => sample.ms).sort((a, b) => a - b);
  return values.length ? values[Math.ceil(values.length * .95) - 1] : undefined;
}
const lines = [
  '# M03 measured results and narrowed scope', '',
  'Measured on 2026-10-25 from this local machine to Vercel Functions in Mumbai, using personal test Google/Firebase resources. All data is synthetic. No paid upgrade was enabled.', '',
  'The owner narrowed M03-B after the baseline demonstrated Sheets quota failures: finish reliability verification and a small editing comparison, then evaluate replacement databases. The 10/20/60-user B matrix and B 3,000-row load run were intentionally deferred. They are not passing or completed tests.', '',
  '## Capacity observations', '',
  '| Checkpoint | Seed rows | Users | Scenario | Completed cycles | Failed requests | Upstream 429s | Stopped early |',
  '|---|---:|---:|---|---:|---:|---:|---|',
  ...selected.map(row => `| ${row.checkpoint} | ${row.dataset} | ${row.users} | ${row.scenario} | ${row.completedCycles} | ${errors(row)} | ${row.quotaResponses} | ${row.stopped ? 'Circuit breaker' : row.scenario === 'burst' && row.completedCycles < row.users ? 'Incomplete' : 'No'} |`), '',
  'Five-user submission-only bursts passed at both dataset sizes. Ten users passed one 3,000-seed run but failed in the 1,200-seed run; this is not evidence that larger data improves capacity. Minute-quota timing and run variability matter. Neither 60-user baseline scenario passed. Classroom scenarios stopped during browsing and did not complete ten minutes.', '',
  '## Successful request latency', '',
  'Seconds, p95 of successful requests only. A five-sample p95 is effectively the slowest sample; a one-user reference is a single observation, not a capacity or statistical latency claim. File transfer is separated from API work.', '',
  '| Checkpoint / seeds / users | Browse | Create | Edit | 1 MB upload transfer | 1 MB private download |',
  '|---|---:|---:|---:|---:|---:|',
  ...selected.filter(row => row.scenario === 'burst' && row.users <= 10).map(row => `| ${row.checkpoint} / ${row.dataset} / ${row.users} | ${seconds(p95(row, 'browse'))} | ${seconds(p95(row, 'create'))} | ${seconds(p95(row, 'edit'))} | ${seconds(p95(row, 'upload-transfer'))} | ${seconds(p95(row, 'download'))} |`), '',
  'The edit request is additional to create/upload/download. The single-student B reference isolates its elapsed time; the five-user comparison also reveals the extra Sheets reads and coordination cost. Do not treat a successful individual edit as a successful five-user workflow.', '',
  '## Throughput and observed resources', '',
  'Client HTTP requests include direct upload transfers and unsuccessful attempts. RSS is the largest observed process sample, not allocated or billed memory. Upstream counts include retries. Full samples and per-run throughput are retained in JSON.', '',
  '| Checkpoint / seeds / users / scenario | HTTP req/s | Google REST calls | Redis calls | Observed RSS MiB | Transfer MB |',
  '|---|---:|---:|---:|---:|---:|',
  ...selected.map(row => `| ${row.checkpoint} / ${row.dataset} / ${row.users} / ${row.scenario} | ${row.requestsPerSecond.toFixed(2)} | ${row.googleRequests} | ${row.redisRequests} | ${(row.maxRssBytes / 1048576).toFixed(1)} | ${(row.samples.reduce((n, sample) => n + (sample.bytes || 0), 0) / 1000000).toFixed(1)} |`), '',
  '## Integrity and verification', '',
  'No duplicate IDs, missing acknowledged records, silent ownership/title mismatches or broken tested attachment references were detected in the selected reconciliations. Rejected/unconfirmed attempts are distinguished from acknowledged saves; M03-A has no operation journal, so unsuccessful create attempts can only be reported as not observed, never blindly repeated.', '',
  'Passing checks: 14 offline M03 cases; three Chromium draft/conflict/mobile checks; four real Redis cross-client/cleanup-retry checks; eight deployed functional groups; six actual attachment/interruption boundary groups; two actual HTTP lost-response groups. M01 passed 18 offline cases and five browser mock cases. M02 passed ten unit/API cases and six Auth Emulator/Chromium cases. Session expiration is covered by the preserved Auth Emulator suite; deployed checks cover invalid/missing cookies and real disabled accounts.', '',
  'The real boundary tests uploaded four 5,000,000-byte files, saved 20,000,000 bytes, downloaded a private 5 MB file through Vercel, rejected oversized combined sets, rejected an incomplete resumable replacement without changing saved content, and replaced attachments with ten actual files. Removed originals were trashed only after a confirmed edit. Lost create/edit HTTP responses were deliberately dropped after Vercel completed the save; exact retries returned the same record/operation without a second write or timestamp change.', '',
  'The final separate audit checked all 1,214 B records and their current Drive references: zero duplicate IDs, broken references, attachment-limit violations, mismatched acknowledged/rejected saves, pending record reservations or queued cleanup jobs. See the archived audit JSON. Orphaned uploads from failed/abandoned test attempts are retained as labelled test artifacts; this is not a claim that every uploaded file belongs to a saved record.', '',
  '## Interpretation and priorities', '',
  '1. Replace Sheets as the application database before claiming classroom capacity. Full Profiles/Responses scans and repeated schema/domain/ownership reads consume a shared OAuth-user quota; Node/Vercel does not remove that quota.',
  '2. Retain Drive provisionally. Direct file transfers and size boundaries passed. Some download routes failed at their preceding Sheets permission/record reads, which does not establish a Drive storage failure. Repeat storage load tests after removing that dependency.',
  '3. Carry owner authorization, version conflicts, operation receipts and post-commit cleanup into the replacement database. Use its transactions/conditional writes instead of reproducing the Sheets-plus-Redis locking workaround.',
  '4. Add indexed owner/date queries, bounded pagination and an explicit read/write budget. Reuse these synthetic fixtures and guarded workloads on the replacement; do not infer its capacity from pricing quotas.', '',
  'No latency acceptance threshold has been applied. Review the measured results before choosing targets.', '',
  '## Limits of these measurements', '',
  '- API-driven student workloads exclude browser rendering; the separate UI checks use mocked network responses.',
  '- Google/Redis header counts cover the app REST adapters, not Firebase Admin SDK internals or provider billing totals. Google GET retries are included in request totals; 429-driven retry lower bounds can be derived, but all upstream retry types were not separately instrumented.',
  '- Observed process RSS is not billed memory-duration. Actual Firebase billing state could not be read (403); the existing project was user-created as Spark. Vercel Hobby and the newly provisioned Redis Free plan were verified. Paid upgrades were not enabled.',
  '- Early probe runs and evolving test-harness versions remain archived. Two early baseline reports counted uploaded-but-unscheduled saves as pending; later runs corrected this. Their pending counts are not evidence of missing acknowledged records.',
  '- Seed counts are exact; test-created records are retained in addition to seeds. Dataset size does not mean the entire Sheet contains exactly that many total rows.', '',
  '## Selected evidence', '',
  ...selected.map(row => `- [${row.runId}](test-evidence/m03/${row.file}) — ${row.target}`), '',
  'See M03_SETUP.md for commands, environment names, resource IDs and frozen source references. See DB_OPTIONS.md for the replacement evaluation.'
];
writeFileSync('M03_RESULTS.md', lines.join('\n') + '\n');
mkdirSync('test-evidence/m03', { recursive: true });
for (const document of documents) writeFileSync(`test-evidence/m03/${document.file}`, readFileSync(`output/m03/${document.file}`));
writeFileSync('test-evidence/m03/comparison.json', JSON.stringify({ selectedReports: selected.map(row => row.file), scope: 'M03-B narrowed by owner: reliability plus one/five-user comparison; larger B matrix deferred' }, null, 2));
console.log(`Wrote M03_RESULTS.md and archived ${documents.length} sanitized JSON reports.`);
