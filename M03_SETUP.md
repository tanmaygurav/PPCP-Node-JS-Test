# M03 — Editing, reliability and capacity

Status: editing/reliability checks passed and both source checkpoints are frozen. Sheets did not pass classroom capacity. The owner narrowed B to reliability plus a one/five-user comparison, deferring its larger matrix in favor of database evaluation. See [M03_RESULTS.md](M03_RESULTS.md) and [DB_OPTIONS.md](DB_OPTIONS.md). M01 and M02 remain preserved.

## Isolated resources

| Checkpoint | Vercel project | Spreadsheet | Drive folder |
|---|---|---|---|
| M03-A, submission baseline | ppcp-m03-a-test | 14jNrpdslyrm-jTB9vJ-SNW1-Rs_lckwXIiK2HPpeKjw | 1Elgmj7cCydeGpf2qOmvzFyzfGjWwQeFf |
| M03-B, editing | ppcp-m03-b-test | 1uytXq2OqBQwL0CmZwhTvKLGDxhRpsK7lCpNJnvz67lo | 1dXZzRW3o08Is2wo02XlQxvhBiSLOHwGe |

Verified stable hosts: `https://ppcp-m03-a-test.vercel.app` and `https://ppcp-m03-b-test.vercel.app`. A is pinned to `milestone/m03-a-submission-baseline`, source `748ff21`, tag `m03-a-submission-baseline-v0.1.0`. B is pinned to `milestone/m03-b-editing`, source `04fab82`, tag `m03-b-editing-v0.1.0`. Saved Production branches, deployed branches and source SHAs were verified through Vercel's API. These tags preserve source, not a 60-user capacity certification.

Both use personal Spark Firebase project `ppcp-auth-test`, with a dedicated, namespaced pool of 60 synthetic students, one faculty user and one admin. No messages are sent to these synthetic addresses. Real M02 users are not modified. Pool passwords live only in ignored `.local/m03-accounts.json`.

Shared coordinator: Upstash Redis `ppcp-m03-coordination`, free plan, Mumbai region, automatic upgrades disabled, eviction disabled. Provisioned through Vercel Marketplace after the owner accepted its terms. Connected only to M03-B. Never delete/flush the coordinator while saves are pending: a missing reservation could permit an unsafe write.

## Environment

Local files: `.env.m03-a.local`, `.env.m03-b.local` (ignored). Set `M03_CHECKPOINT=M03-A` or `M03-B` before invoking commands; default is B. Keep Node 24 on PATH.

Variables: `APP_ORIGIN`, `M03_CHECKPOINT`, `M03_GOOGLE_SPREADSHEET_ID`, `M03_GOOGLE_MEDIA_FOLDER_ID`, `M03_SIGNING_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_WEB_APP_ID`, and local `GOOGLE_APPLICATION_CREDENTIALS` or deployed `FIREBASE_SERVICE_ACCOUNT_JSON`.

B additionally requires `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `M03_COORDINATION_NAMESPACE` (`m03-b-pilot`). Marketplace uses `KV_REST_API_URL`/`KV_REST_API_TOKEN`; the environment helper maps these without printing credentials. No Firebase private keys, OAuth tokens, Redis credentials, passwords or session cookies belong in Git, evidence or chat.

## Setup and reproduction

PowerShell:

```powershell
npm ci
$env:M03_CHECKPOINT='M03-A'
node --env-file=.env.m03-a-1200.local scripts/m03-seed.mjs --count=1200
npm run build:m03
node --env-file=.env.m03-a-1200.local server-m03.mjs
# In another terminal, with the same checkpoint:
node --env-file=.env.m03-a-1200.local scripts/m03-capacity.mjs --target=http://localhost:3003 --users=5 --dataset=1200 --scenario=burst --write
```

For B use `M03-B` and port 3004. `npm run test:m03` runs offline save-protection tests. `npm run build:m03` builds the corresponding React interface. `node build-deployment.mjs` selects the checkpoint at Vercel build time. Root API entry selects M03 only when `M03_CHECKPOINT` is set; M01/M02 frozen source is unchanged.

The example assumes this workspace's ignored environment files. On a new machine, restore credentials using M02_SETUP.md, then recreate the M03 environment files using the variable names and preserved IDs above. Do not provision duplicate resources merely to reconnect to a checkpoint. For a genuinely new scratch fixture, `npm run m03:resources` provisions isolated defaults; setting `M03_RESOURCE_VARIANT=a-1200` or `b-3000` before that command provisions the corresponding separate variant. Restore the existing Redis credentials for B; do not flush or recreate its operational state.

The original matrix sequence is 5, 10, 20, then 60 burst; then 60 classroom. A completed this sequence at both sizes; B intentionally completed only the agreed smaller comparison. Classroom scheduling lasts at most ten minutes with 15–30 second pauses between actions; burst arrivals are spread across five seconds. Never extend a preserved smaller fixture to run a larger case. The runner now requires the exact seed count and rejects a mislabeled dataset. Test-created records remain alongside the seeds.

Current deployed A has 3,000 seeds; deployed B has 1,200. Independent local replay environments preserve the other sizes:

| Environment file | Checkpoint / seeds | Spreadsheet | Private Media folder |
|---|---|---|---|
| `.env.m03-a-1200.local` | A / 1,200 | 1uQUsZPHszm7a8uBXzN0s3Os2EmmiqV_ajEiC9epxZ6g | 1-mjC_Lo91Xg6aXeICugaam0PnjznebCA |
| `.env.m03-b-3000.local` | B / 3,000 | 1rYUzT360eGSgJedskTz4firnIsPg4Aus99WtHE3TeWs | 1hmGXIGTTcUD6Fynk1NfBTPwryv7yhcZm |

Use Node's `--env-file` flag before the script name for these local variants; their values take precedence over default local environment loading. No extra Vercel projects were created for these variants. B's 3,000-row capacity remains untested. The original A 1,200-row reports remain archived from before its fixture grew; the new independent A fixture reproduces the same synthetic seed data without changing its frozen deployed resources.

The runner requires `--write`, validates target/checkpoint/dataset, pre-authenticates synthetic accounts, uploads a 1,000,000-byte PDF fixture directly to Drive, saves and downloads it, and on B edits once. It stops scheduling after ten consecutive unexpected failures or ten upstream quota responses in thirty seconds, awaits in-flight work and reconciles Sheet records after quota refill. An aborted run is not a successful 60-user capacity result. Reports live in ignored `output/m03`; review and copy sanitized reports into `test-evidence/m03` when finalized.

## Save semantics

B adds T `Last edited` and U `Last save operation` to Responses. U is coordination metadata for identifying an uncertain write, not edit history. Remarks remain in their original separate tab. Edits preserve original ID, submission date, owner and identity fields. Timestamp comparisons reject stale drafts. Retained and replacement attachments are checked server-side against Drive before writing, with decimal-byte limits 10 files / 5,000,000 each / 20,000,000 total.

Redis Lua atomically reserves each record across instances. Reservations do not expire: a late Sheets request must not overwrite a successor after a lease expires. Operation IDs bind retries to the same request digest. An uncertain PUT/append is not repeated. Reconciliation confirms the last-operation marker and timestamp; unresolved outcomes remain blocked for operator review. Do not manually release pending reservations while a Google request may still finish.

After confirmed save, a Lua transition atomically records removed file IDs for cleanup and releases the record. Cleanup checks the current attachment list, folder and submission ownership before trashing. Failures remain in the Redis cleanup hash for retry. Current content only is stored; draft/operation hashes and cleanup IDs do not retain prior text.

Replacement tickets bind to one record, owner and operation ID. A ticket cannot be reused by a later edit to reintroduce a file while its cleanup is pending. The browser keeps the same operation when a response is lost. After a conflict, “Reload saved version, keep my text” refreshes the timestamp and saved attachment selection while preserving draft text and selected new files.

Additional verification commands: `node scripts/m03-browser.mjs` (mocked browser draft/conflict/mobile checks), `node scripts/m03-redis-check.mjs` (two real clients, disposable keys), `node scripts/m03-live.mjs --target=https://ppcp-m03-b-test.vercel.app --write` (real functional tests), `node scripts/m03-boundaries.mjs --target=https://ppcp-m03-b-test.vercel.app --write` (actual size and interrupted-upload cases). Run live tests sequentially with capacity tests because all share the OAuth quota. `node scripts/m03-cleanup.mjs` reports queued cleanup; add `--apply` to retry up to ten files with ownership checks.

## Allowances and evidence limitations

Checked 2026-10-25: [Sheets limits](https://developers.google.com/workspace/sheets/api/limits), [Upstash pricing](https://upstash.com/pricing/redis), [Firebase Auth limits](https://firebase.google.com/docs/auth/limits), [Vercel Hobby](https://vercel.com/docs/plans/hobby). Sheets documents 60 read and 60 write requests per minute per user per project, and 300 each per project. The shared OAuth account means 60 students do not get independent Sheets quotas. Upstash currently lists 250 MB, 500K monthly commands and 10 GB bandwidth on Free. Do not enable paid upgrades.

Before capacity runs, verify actual account/team usage and free-plan state. Request headers count Google REST calls (including GET retries), Redis calls, upstream 429 responses, observed process RSS and application time. These do not replace provider billing metrics or measure Firebase Admin SDK calls. Attachment transfer latency is reported separately. No latency acceptance threshold is set until measurements are reviewed.

Verification evidence, limits, results and the intentionally deferred B cases are recorded in M03_RESULTS.md. Frozen deployment provenance and sanitized reports are in `test-evidence/m03`. Use `m03-reliability-tools-v0.1.0` for the final harness/docs; app tags preserve the deployed implementation. Final commands include `node scripts/m03-faults.mjs --write`, `node scripts/m03-functional-suite.mjs --write`, `node scripts/m03-report.mjs`, and `node scripts/m03-deployment-record.mjs --checkpoint=M03-B --require-frozen`.

`node scripts/m03-audit.mjs` performs the final read-only B audit, including exact saved attachment metadata, limit checks, comparison against acknowledged/rejected load-test saves, pending reservation count and queued cleanup. Test artifacts, synthetic accounts and abandoned uploads remain available for inspection/reruns; no permanent Drive deletion was performed. Trashed files still consume Drive storage until permanently deleted by their owner.
