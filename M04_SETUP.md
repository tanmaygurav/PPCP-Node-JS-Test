# M04 — isolated event POC

Implementation branch: `codex/m04-event-poc`. This checkpoint uses new resources only. M01–M03 source refs, data, credentials and stable deployments are preserved. No migration, backups or edit history are introduced.

## Owner-created resources

1. Under the existing Google owner, create a Firebase project whose ID starts `ppcp-m04-`. Keep Spark; do not attach billing or enable paid upgrades. Create the default Firestore **Standard** database in `asia-south1` (Mumbai) if offered. Database location is selected at creation.
2. Add a Firebase web app. Enable Authentication → Email/Password. Add `localhost` and the eventual M04 deployment hostname to authorized domains. All application API sessions require a verified `@welingkar.org` or `@welingkarmail.org` identity, including staff/admin. Firebase may contain an otherwise ineligible identity; it receives no portal session or data access.
3. Download a service-account key for **this new project only** to `.local/m04-firebase-admin.json`. Save the Firebase web config as pure JSON (not a JavaScript `const`) to `.local/m04-web-config.json`, containing `projectId`, `apiKey`, `authDomain`, `appId`.
4. In the linked GCP project enable Google Drive API, configure the OAuth consent screen and create a **Desktop** OAuth client. Download it to `.local/m04-oauth-client.json`. In external Testing mode, add the owner as a test user. Testing-mode authorization may need renewal before the event; verify it during rehearsal.
5. Create a new private Drive folder named `PPCP M04 Event Media`. Share only its link and the Firebase project link in chat; never paste credentials.

## Local connection

Use Node **24.x** (24.22.1 used for verification), npm and Java 21 for the Firestore emulator. All commands run from this repository root.

```powershell
npm ci
node scripts/m04-setup.mjs
```

Edit only ignored `.env.m04.local`: set `M04_GOOGLE_MEDIA_FOLDER_ID` from the new folder link. No environment values are read from `.env.local`, M02/M03 environments or the old OAuth cache. Dedicated service credentials are required; application-default legacy credentials are not used.

For an owner-created folder, authorize the new OAuth client:

```powershell
node scripts/m04-authorize.mjs --existing-folder
```

Open the displayed consent URL as the existing Google owner. The callback is `http://127.0.0.1:3006/oauth/callback`; the token is written directly to `.env.m04.local`. Full Drive scope is used for the pre-existing folder. The default command without `--existing-folder` requests `drive.file`, which is suitable only for resources created by that new OAuth client or explicitly granted to it through Picker; no Picker is implemented in M04.

Deploy rules and indexes to the explicit **new project ID**, never the previous project:

```powershell
firebase deploy --config firebase.m04.json --project ppcp-m04-YOUR-ID --only firestore:rules,firestore:indexes
node scripts/m04-preflight.mjs --seed-domains
npm run build:m04
npm run start:m04
```

The seed command creates only the `Education` domain by default. Set `M04_DOMAINS` to an organizer-approved comma-separated list before invoking it for a different initial set. There is no student-controlled domain creation. Wait for all indexes to become ready before live query tests.

Open `http://localhost:3005`. Register the intended admin's institutional account, verify its email, then copy its **UID** from Firebase Authentication into `M04_BOOTSTRAP_ADMIN_UIDS` before completing its portal profile. Restart the server after configuration changes. Bootstrap elevates only the first allowlisted verified profile, once. Remove the allowlist after success. Further staff/admin elevation happens through Manage users. If the profile was already completed as student, a deliberate operator correction is needed; bootstrap never silently re-elevates existing accounts.

## Runtime behavior

- Firestore Admin SDK handles all application data. Browser Firestore rules deny every direct read/write. Roles/status are authoritative in `users`; every protected API request checks them, and mutations recheck within their transaction.
- `submissions` stores current fields, immutable sequence/readable ID, timestamps, version, lock state and attachment metadata. Remarks are separate and retain attribution when staff access is disabled.
- Counter allocation, current content, version, receipt and post-commit cleanup tasks commit atomically. Drive I/O never runs in transaction callbacks.
- Upload preparation binds owner, operation, submission, retained IDs, sizes, types and version. Completed files are verified before saving, then granted `anyone`/`reader`, `allowFileDiscovery=false`. The folder remains private. Returned `webViewLink` values open Drive directly in another tab. There is no download proxy.
- Limits use decimal bytes: 10 files; 5,000,000 bytes per file; 10,000,000 bytes total, retained plus new. Supported formats: JPG/JPEG, PNG, WebP, PDF, DOC/DOCX, PPT/PPTX.
- A lost save response keeps the operation and browser-selected files in memory for retry. Keep the page open. A stale edit returns 409 and preserves draft text; **Refresh version, keep draft** refreshes the version/attachment choices before resaving. No historical text is stored.
- Filters use eight derived facet tokens per submission so domain/lock/remark combinations share 47 composite index definitions. Prefix searches sort by the searched field; date filters are UTC. Cursors include the full order, unique document ID and query/user fingerprint. Concurrent changes require list refresh; cursor pagination is not a historical snapshot.

## API surface

All mutations use same-origin JSON POST; reads use GET. Secure one-hour HttpOnly server sessions use the independent `ppcp_m04` cookie.

| Endpoint | Behavior |
| --- | --- |
| `/api/auth/config`, `/api/auth/session`, `/api/auth/logout` | Firebase web config, verified-token exchange, session revocation |
| `/api/me`, `/api/profile`, `/api/domains` | Current user, idempotent profile completion, active domains |
| `/api/upload-sessions` | `operationId`, file descriptors; edits include `submissionId`, `expectedVersion`, `retainedIds` |
| `/api/submissions` | GET cursor list; POST submission fields, `operationId`, `uploadId` |
| `/api/submissions/:id`, `/:id/edits` | Authorized detail; POST edit with expected version |
| `/api/submissions/:id/lock`, `/:id/unlock` | POST operation ID and expected version |
| `/api/submissions/:id/remarks` | Cursor-paginated GET; faculty POST remark and operation ID |
| `/api/operations/:operationId` | Owner-scoped committed receipt or `not-observed` |
| `/api/admin/users?email=...`, `/api/admin/users/:uid` | Exact verified-account lookup; POST role/status and operation ID |

List parameters: `searchBy=id|email|domain|name|title`, `search`, `domain`, `locked=true|false|all`, `remarked=true|false|all`, `from`, `to`, `sort=newest|oldest|edited|id`, `limit=1..50` (default 20), `cursor`. ID/email/domain search is exact; name/title is normalized whole-field prefix. There is no contains search.

## Verification and cleanup

```powershell
npm run test:m04
npm run test:m04:emulator
node scripts/m04-indexes.mjs --check
node scripts/m04-live.mjs --target=https://YOUR-M04-HOST --write --boundaries
node scripts/m04-capacity.mjs --target=https://YOUR-M04-HOST --write --users=120
```

Emulator tests are isolated from live Firebase/Drive. Browser rehearsal uses real emulator Auth/Firestore and the Node API, with no external files. Emulators do not certify deployed composite-index readiness, Drive sharing, inbox delivery or live capacity.

Live scripts refuse non-M04 targets and require `--write` before creating new synthetic accounts/submissions. Fresh synthetic test accounts are Admin-verified, not emailed; credentials stay in `.local/m04-accounts.json`. Synthetic privileged profiles are operator-created test fixtures in the new project, with the admin count updated transactionally. This does not change existing user roles or establish real mailbox delivery. Reports in `output/m04` omit passwords, cookies, keys and upload URLs.

Capacity runs include all earlier stages: 5 → 20 → 60 → 120; `--users=200` adds 200 only after those pass. Stop before the next stage on request/integrity/quota failures or missed latency targets. API and Drive transfer timing are separate. Firebase/Firestore billing-console usage must be reviewed separately; request counts are not document-operation totals.

```powershell
npm run m04:cleanup
npm run m04:cleanup -- --apply
```

Dry-run identifies expired pending uploads and eligible removed-file cleanup. Apply first marks expired upload operations abandoned transactionally, then queues their files. Cleanup checks the current saved attachment list, folder and owner before trashing; failed/missing uploads remain retryable because a previously issued resumable upload could complete late. Each invocation is bounded to 20 operations/jobs; rerun as required. This is operational cleanup, not backup/history. No permanent Drive deletion is performed.

## Deployment and release gate

Use only the separate `ppcp-m04-event-poc` Vercel project in the existing Hobby team. Set Node 24, Mumbai functions, build `node build-deployment.mjs`, output `dist-deployment`, and `PPCP_MILESTONE=M04`. Copy only the new `M04_*` values through secure environment configuration. Set `M04_APP_ORIGIN` to the exact stable HTTPS origin and authorize that hostname in the new Firebase project.

Do not change M01–M03 projects, branch tracking, aliases or environment variables. `vercel.json` disables automatic Git deployments for the two M04 branches so pushing them does not trigger previews across the preserved projects sharing this repository. Deploy M04 explicitly to its separate project. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

Source changes remain on `codex/m04-event-poc`; freeze only after live sharing, deployed queries, load acceptance and organizer rehearsal pass. Then create a new annotated release tag and `milestone/m04-event-poc` branch, configure only M04 production branch tracking, and independently verify deployment commit/branch/alias. Do not label an emulator-only candidate as a frozen release.
