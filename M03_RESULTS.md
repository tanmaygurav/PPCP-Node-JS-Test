# M03 measured results and narrowed scope

Measured on 2026-10-25 from this local machine to Vercel Functions in Mumbai, using personal test Google/Firebase resources. All data is synthetic. No paid upgrade was enabled.

The owner narrowed M03-B after the baseline demonstrated Sheets quota failures: finish reliability verification and a small editing comparison, then evaluate replacement databases. The 10/20/60-user B matrix and B 3,000-row load run were intentionally deferred. They are not passing or completed tests.

## Capacity observations

| Checkpoint | Seed rows | Users | Scenario | Completed cycles | Failed requests | Upstream 429s | Stopped early |
|---|---:|---:|---|---:|---:|---:|---|
| M03-A | 1200 | 5 | burst | 5 | 0 | 0 | No |
| M03-A | 1200 | 10 | burst | 9 | 1 | 3 | Incomplete |
| M03-A | 1200 | 20 | burst | 0 | 18 | 54 | Circuit breaker |
| M03-A | 1200 | 60 | burst | 0 | 24 | 72 | Circuit breaker |
| M03-A | 1200 | 60 | classroom | 0 | 7 | 21 | Circuit breaker |
| M03-A | 3000 | 5 | burst | 5 | 0 | 0 | No |
| M03-A | 3000 | 10 | burst | 10 | 0 | 0 | No |
| M03-A | 3000 | 20 | burst | 0 | 17 | 51 | Circuit breaker |
| M03-A | 3000 | 60 | burst | 0 | 20 | 60 | Circuit breaker |
| M03-A | 3000 | 60 | classroom | 0 | 10 | 30 | Circuit breaker |
| M03-B | 1200 | 1 | burst | 1 | 0 | 0 | No |
| M03-B | 1200 | 5 | burst | 2 | 3 | 9 | Incomplete |

Five-user submission-only bursts passed at both dataset sizes. Ten users passed one 3,000-seed run but failed in the 1,200-seed run; this is not evidence that larger data improves capacity. Minute-quota timing and run variability matter. Neither 60-user baseline scenario passed. Classroom scenarios stopped during browsing and did not complete ten minutes.

## Successful request latency

Seconds, p95 of successful requests only. A five-sample p95 is effectively the slowest sample; a one-user reference is a single observation, not a capacity or statistical latency claim. File transfer is separated from API work.

| Checkpoint / seeds / users | Browse | Create | Edit | 1 MB upload transfer | 1 MB private download |
|---|---:|---:|---:|---:|---:|
| M03-A / 1200 / 5 | 1.31 | 3.21 | — | 2.15 | 2.66 |
| M03-A / 1200 / 10 | 1.91 | 4.83 | — | 2.22 | 2.52 |
| M03-A / 3000 / 5 | 1.75 | 3.51 | — | 2.05 | 2.74 |
| M03-A / 3000 / 10 | 1.63 | 3.57 | — | 1.96 | 2.64 |
| M03-B / 1200 / 1 | 1.61 | 2.82 | 3.51 | 2.07 | 2.45 |
| M03-B / 1200 / 5 | 2.00 | 3.19 | 3.79 | 1.93 | 2.30 |

The edit request is additional to create/upload/download. The single-student B reference isolates its elapsed time; the five-user comparison also reveals the extra Sheets reads and coordination cost. Do not treat a successful individual edit as a successful five-user workflow.

## Throughput and observed resources

Client HTTP requests include direct upload transfers and unsuccessful attempts. RSS is the largest observed process sample, not allocated or billed memory. Upstream counts include retries. Full samples and per-run throughput are retained in JSON.

| Checkpoint / seeds / users / scenario | HTTP req/s | Google REST calls | Redis calls | Observed RSS MiB | Transfer MB |
|---|---:|---:|---:|---:|---:|
| M03-A / 1200 / 5 / burst | 1.76 | 75 | 0 | 129.7 | 10.0 |
| M03-A / 1200 / 10 / burst | 3.43 | 152 | 0 | 136.7 | 19.0 |
| M03-A / 1200 / 20 / burst | 6.97 | 200 | 0 | 137.0 | 20.0 |
| M03-A / 1200 / 60 / burst | 13.69 | 304 | 0 | 144.4 | 34.0 |
| M03-A / 1200 / 60 / classroom | 1.74 | 128 | 0 | 146.7 | 0.0 |
| M03-A / 3000 / 5 / burst | 1.71 | 76 | 0 | 128.8 | 10.0 |
| M03-A / 3000 / 10 / burst | 3.29 | 151 | 0 | 134.1 | 20.0 |
| M03-A / 3000 / 20 / burst | 7.01 | 184 | 0 | 137.8 | 20.0 |
| M03-A / 3000 / 60 / burst | 12.86 | 331 | 0 | 156.1 | 41.0 |
| M03-A / 3000 / 60 / classroom | 1.67 | 138 | 0 | 170.9 | 0.0 |
| M03-B / 1200 / 1 / burst | 0.41 | 23 | 8 | 108.3 | 2.0 |
| M03-B / 1200 / 5 / burst | 1.77 | 108 | 31 | 133.1 | 10.0 |

## Integrity and verification

No duplicate IDs, missing acknowledged records, silent ownership/title mismatches or broken tested attachment references were detected in the selected reconciliations. Rejected/unconfirmed attempts are distinguished from acknowledged saves; M03-A has no operation journal, so unsuccessful create attempts can only be reported as not observed, never blindly repeated.

Passing checks: 14 offline M03 cases; three Chromium draft/conflict/mobile checks; four real Redis cross-client/cleanup-retry checks; eight deployed functional groups; six actual attachment/interruption boundary groups; two actual HTTP lost-response groups. M01 passed 18 offline cases and five browser mock cases. M02 passed ten unit/API cases and six Auth Emulator/Chromium cases. Session expiration is covered by the preserved Auth Emulator suite; deployed checks cover invalid/missing cookies and real disabled accounts.

The real boundary tests uploaded four 5,000,000-byte files, saved 20,000,000 bytes, downloaded a private 5 MB file through Vercel, rejected oversized combined sets, rejected an incomplete resumable replacement without changing saved content, and replaced attachments with ten actual files. Removed originals were trashed only after a confirmed edit. Lost create/edit HTTP responses were deliberately dropped after Vercel completed the save; exact retries returned the same record/operation without a second write or timestamp change.

The final separate audit checked all 1,214 B records and their current Drive references: zero duplicate IDs, broken references, attachment-limit violations, mismatched acknowledged/rejected saves, pending record reservations or queued cleanup jobs. See the archived audit JSON. Orphaned uploads from failed/abandoned test attempts are retained as labelled test artifacts; this is not a claim that every uploaded file belongs to a saved record.

## Interpretation and priorities

1. Replace Sheets as the application database before claiming classroom capacity. Full Profiles/Responses scans and repeated schema/domain/ownership reads consume a shared OAuth-user quota; Node/Vercel does not remove that quota.
2. Retain Drive provisionally. Direct file transfers and size boundaries passed. Some download routes failed at their preceding Sheets permission/record reads, which does not establish a Drive storage failure. Repeat storage load tests after removing that dependency.
3. Carry owner authorization, version conflicts, operation receipts and post-commit cleanup into the replacement database. Use its transactions/conditional writes instead of reproducing the Sheets-plus-Redis locking workaround.
4. Add indexed owner/date queries, bounded pagination and an explicit read/write budget. Reuse these synthetic fixtures and guarded workloads on the replacement; do not infer its capacity from pricing quotas.

No latency acceptance threshold has been applied. Review the measured results before choosing targets.

## Limits of these measurements

- API-driven student workloads exclude browser rendering; the separate UI checks use mocked network responses.
- Google/Redis header counts cover the app REST adapters, not Firebase Admin SDK internals or provider billing totals. Google GET retries are included in request totals; 429-driven retry lower bounds can be derived, but all upstream retry types were not separately instrumented.
- Observed process RSS is not billed memory-duration. Actual Firebase billing state could not be read (403); the existing project was user-created as Spark. Vercel Hobby and the newly provisioned Redis Free plan were verified. Paid upgrades were not enabled.
- Early probe runs and evolving test-harness versions remain archived. Two early baseline reports counted uploaded-but-unscheduled saves as pending; later runs corrected this. Their pending counts are not evidence of missing acknowledged records.
- Seed counts are exact; test-created records are retained in addition to seeds. Dataset size does not mean the entire Sheet contains exactly that many total rows.

## Selected evidence

- [m03-1792914245409](test-evidence/m03/m03-1792914245409.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792914331463](test-evidence/m03/m03-1792914331463.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792914488148](test-evidence/m03/m03-1792914488148.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792914653077](test-evidence/m03/m03-1792914653077.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792914858036](test-evidence/m03/m03-1792914858036.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792916346839](test-evidence/m03/m03-1792916346839.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792916434680](test-evidence/m03/m03-1792916434680.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792916527053](test-evidence/m03/m03-1792916527053.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792916690786](test-evidence/m03/m03-1792916690786.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792916895273](test-evidence/m03/m03-1792916895273.json) — https://ppcp-m03-a-test.vercel.app
- [m03-1792923462416](test-evidence/m03/m03-1792923462416.json) — https://ppcp-m03-b-test.vercel.app
- [m03-1792923596500](test-evidence/m03/m03-1792923596500.json) — https://ppcp-m03-b-test.vercel.app

See M03_SETUP.md for commands, environment names, resource IDs and frozen source references. See DB_OPTIONS.md for the replacement evaluation.
