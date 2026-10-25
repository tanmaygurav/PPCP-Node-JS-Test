# M03 — Editing, reliability and capacity

Status: implementation and verification in progress. No capacity claim or passing milestone tag exists yet. M01 and M02 remain pinned to their existing milestone branches.

## Isolated resources

| Checkpoint | Vercel project | Spreadsheet | Drive folder |
|---|---|---|---|
| M03-A, submission baseline | ppcp-m03-a-test | 14jNrpdslyrm-jTB9vJ-SNW1-Rs_lckwXIiK2HPpeKjw | 1Elgmj7cCydeGpf2qOmvzFyzfGjWwQeFf |
| M03-B, editing | ppcp-m03-b-test | 1uytXq2OqBQwL0CmZwhTvKLGDxhRpsK7lCpNJnvz67lo | 1dXZzRW3o08Is2wo02XlQxvhBiSLOHwGe |

Expected stable hosts: `https://ppcp-m03-a-test.vercel.app` and `https://ppcp-m03-b-test.vercel.app`. Deployment verification is pending.

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
npm run m03:resources
$env:M03_CHECKPOINT='M03-A'
node scripts/m03-seed.mjs --count=1200
node scripts/m03-vercel-env.mjs --apply
npm run build:m03
npm run start:m03
# In another terminal, with the same checkpoint:
node scripts/m03-capacity.mjs --target=http://localhost:3003 --users=5 --dataset=1200 --scenario=burst --write
```

For B use `M03-B` and port 3004. `npm run test:m03` runs offline save-protection tests. `npm run build:m03` builds the corresponding React interface. `node build-deployment.mjs` selects the checkpoint at Vercel build time. Root API entry selects M03 only when `M03_CHECKPOINT` is set; M01/M02 frozen source is unchanged.

Capacity sequence per checkpoint and dataset: users 5, 10, 20, then 60 burst; then 60 classroom. Set `--target` to that checkpoint's stable URL. Classroom scheduling lasts at most ten minutes with 15–30 second pauses between actions; burst arrivals are spread across five seconds. Increase the dataset using `--count=3000` after preserving the 1,200-row reports. Seeding only appends missing deterministic seed IDs and preserves test-created records.

The runner requires `--write`, validates target/checkpoint/dataset, pre-authenticates synthetic accounts, uploads a 1,000,000-byte PDF fixture directly to Drive, saves and downloads it, and on B edits once. It stops scheduling after ten consecutive unexpected failures or ten upstream quota responses in thirty seconds, awaits in-flight work and reconciles Sheet records after quota refill. An aborted run is not a successful 60-user capacity result. Reports live in ignored `output/m03`; review and copy sanitized reports into `test-evidence/m03` when finalized.

## Save semantics

B adds T `Last edited` and U `Last save operation` to Responses. U is coordination metadata for identifying an uncertain write, not edit history. Remarks remain in their original separate tab. Edits preserve original ID, submission date, owner and identity fields. Timestamp comparisons reject stale drafts. Retained and replacement attachments are checked server-side against Drive before writing, with decimal-byte limits 10 files / 5,000,000 each / 20,000,000 total.

Redis Lua atomically reserves each record across instances. Reservations do not expire: a late Sheets request must not overwrite a successor after a lease expires. Operation IDs bind retries to the same request digest. An uncertain PUT/append is not repeated. Reconciliation confirms the last-operation marker and timestamp; unresolved outcomes remain blocked for operator review. Do not manually release pending reservations while a Google request may still finish.

After confirmed save, a Lua transition atomically records removed file IDs for cleanup and releases the record. Cleanup checks the current attachment list, folder and submission ownership before trashing. Failures remain in the Redis cleanup hash for retry. Current content only is stored; draft/operation hashes and cleanup IDs do not retain prior text.

## Allowances and evidence limitations

Checked 2026-10-25: [Sheets limits](https://developers.google.com/workspace/sheets/api/limits), [Upstash pricing](https://upstash.com/pricing/redis), [Firebase Auth limits](https://firebase.google.com/docs/auth/limits), [Vercel Hobby](https://vercel.com/docs/plans/hobby). Sheets documents 60 read and 60 write requests per minute per user per project, and 300 each per project. The shared OAuth account means 60 students do not get independent Sheets quotas. Upstash currently lists 250 MB, 500K monthly commands and 10 GB bandwidth on Free. Do not enable paid upgrades.

Before capacity runs, verify actual account/team usage and free-plan state. Request headers count Google REST calls (including GET retries), Redis calls, upstream 429 responses, observed process RSS and application time. These do not replace provider billing metrics or measure Firebase Admin SDK calls. Attachment transfer latency is reported separately. No latency acceptance threshold is set until measurements are reviewed.

Pending completion: end-to-end editing and boundary tests, deployed verification, capacity matrix, M01/M02 regression evidence, sanitized comparative report, immutable tags, branch pinning and final stable-URL provenance.
