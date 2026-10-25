# Test catalog — M01 / harness v1

Every case below has a stable ID. Offline tests exercise synthetic fixtures; live tests use the exact selected target and can require renewed Google authorization. M01 means the app tag in MILESTONES.md, not whichever code main contains later. Never edit an old case's meaning without documenting a revision.

## Setup and commands

Use Node 22.x and `npm ci` on the tooling checkout. Install Chromium once with `npx playwright install chromium` (Linux: `--with-deps`). Browser version is pinned by package-lock.json. `npm run fixtures:export` exports manual test images, an oversized rejection file, and all tab headers to `output/fixtures/m01` without Google writes.

| Command | Purpose / side effects |
| --- | --- |
| `npm run check:local` | Syntax-check server, browser, and test helpers; no Google access |
| `npm test` | Offline Node suite; mocked Google plus temporary loopback servers; JSON result manifest |
| `npm run test:browser:mock` | Actual Chromium and in-memory server; upload/feedback/readback and one simulated interruption; no Google access |
| `npm run google:smoke -- --target local` | Running local server, read-only Google operations |
| `npm run google:smoke -- --target m01` | Preserved Vercel deployment, read-only Google operations |
| `npm run google:smoke -- --target m01 --write` | One labelled submission, two tiny PNGs, one remark; verifies readback/retry |
| `npm run test:browser -- --target m01` | Browser unlock, connection, oversize rejection and logout; no Google file/record writes |
| `npm run test:browser -- --target m01 --write` | Browser submission, two direct uploads, feedback, readback, oversize rejection and logout |

Replace `m01` with an explicit origin (e.g. `http://localhost:3000`) when recreating a baseline elsewhere; choose the server's actual origin. `--headed` displays the browser when useful. Remote HTTP, credentials in URLs, paths, query strings and fragments are rejected. Remote tests require TEST_TARGET_ACCESS_KEY in ignored `.env.test.local` or the environment, and never reuse the local key implicitly. Optional VERCEL_AUTOMATION_BYPASS_SECRET handles deployment protection; it is sent only to the app origin. Do not put keys in command arguments. No Google OAuth secrets are needed by the remote runner.

To rerun **one offline test**, use its prefix:

```powershell
node --test --test-name-pattern=M01-U01 test/domain.test.mjs
```

For A cases use `test/api.test.mjs`; G cases `test/google.test.mjs`; TOOL cases `test/harness.test.mjs`. U cases use `test/domain.test.mjs`. The table is the assertion recipe and expected outcome; those commands reproduce it without external data.

## Offline cases (18)

| ID | Purpose / fixture action | Expected result |
| --- | --- | --- |
| M01-U01 | Test exactly 5,000,000 bytes/file and 20,000,000 total; exceed file/total/count; zero/null entries | Exact limits accepted; >5 MB, >20 MB, >10 files, empty/malformed rejected |
| M01-U02 | Uppercase PDF and misleading MIME; EXE/DOCM and path/control characters | Canonical PDF type; unsafe extensions and names rejected |
| M01-U03 | Map fixture to Responses; add legacy J/M fragments; formula-looking title | 18 columns; fixed B ID; R description; legacy fragments preserved; literal title |
| M01-U04 | Sign ticket, tamper, expire, use it as session | Valid ticket accepted; other cases rejected |
| M01-U05 | Submit missing metadata | Validation rejects missing email |
| M01-A01 | No key, bad key, correct key, foreign-origin POST | Protected reads 401; valid unlock; foreign mutation 403 |
| M01-A02 | Mock upload/save/detail/list/remark, then save same ticket again | One record; same ID; compact list; server-set author; feedback reads back |
| M01-A03 | Make attachment verification fail | 409 and zero Sheet rows written |
| M01-A04 | EXE, null JSON body, inactive domain, forged ticket | Server rejects each independently of UI |
| M01-A05 | Use Vercel rewrite query; log out and read protected endpoint | Rewrite works; logout removes cookie access |
| M01-G01 | Concurrent mock reads need token refresh | One refresh; bearer used only in server requests |
| M01-G02 | Append formula-looking literal; switch ID header to ArrayFormula | RAW write with correct 18-column mapping; formula-based ID sheet rejected |
| M01-G03 | Create resumable session with pre-generated ID | Expected folder/size/marker; no general Google token in returned plan |
| M01-G04 | Change folder, size, marker, trash flag or omit completed size | Valid metadata accepted; all mismatches rejected |
| M01-G05 | Google append returns ambiguous 503 | Fails without automatically retrying the write |
| TOOL-U01 | Missing target, remote HTTP, credential/path/query URLs | Fail before issuing requests; local/m01 aliases resolve |
| TOOL-U02 | Remote target with only local key; unknown milestone/options | Refuse key fallback and invalid options; explicit remote key works |
| TOOL-U03 | Default vs --write; inject secret-like raw error into self-test report | Writes default off; saved report omits keys/raw errors; intentional self-test failure is expected |

## Live API cases

Run L01–L03 using read smoke; add `--write` for L04–L07. Prerequisites: correct key, running target, writable test Sheet/folder, plain headers, active domain, Google authorization. Every failure exits nonzero and retains the last step and known artifact IDs.

| ID | Purpose / steps | Expected result |
| --- | --- | --- |
| M01-L01 | GET health; unlock with selected target key | Healthy Node JSON and session cookie |
| M01-L02 | GET checks | Expected `PPCP Test DB` and `Media`; schema/access checks pass |
| M01-L03 | Read domains and one-record list | At least one domain; list response shape valid |
| M01-L04 | Initiate two PNG sessions; upload bytes to Google | Both complete; IDs/filenames recorded, no token/session URL recorded |
| M01-L05 | Save fixture labelled with run ID; retrieve detail | Same ID, exact description, exactly the two uploaded file IDs |
| M01-L06 | Save identical ticket sequentially | alreadySaved true and same ID; not a concurrent exactly-once guarantee |
| M01-L07 | Append unique run-labelled remark; read remarks | Unique text appears under the test submission |

Resource **names** are a guardrail, not proof of resource IDs. Inspect the target's configured Sheet/folder IDs before a new write target. Actual deployment commit is not exposed by M01; confirm its Source view in Vercel and record evidence separately.

## Browser cases

These run in Chromium, not just an HTTP client. No tracing/HAR/storage-state or raw browser errors are saved because they may contain credentials, cookies or upload URLs. A failure report names the stage; use `--headed` for diagnosis. Read-only mode runs B01/B03/B04; write adds B02; mock write also runs B05.

| ID | Purpose / browser actions | Expected result |
| --- | --- | --- |
| M01-B01 | Load page, unlock, click Check Google connection | Expected Sheet name; domain choices populate |
| M01-B02 | Fill synthetic form; attach two tiny PNGs; save; add feedback | Saved detail and two attachment links; feedback visible; manifest records IDs |
| M01-B03 | Fill valid metadata; attach 5,000,001-byte file; submit | UI reports file limit; no upload-session request sent |
| M01-B04 | Lock API; request protected records | Session access removed, HTTP 401 |
| M01-B05 | Mock only: abort first upload request, allow status probe and retry | Browser resumes and completes B02; proves application recovery logic, not real-network resilience |

## Manual cases and exact reproduction

Export fixtures, open the recorded M01 URL (or local server), unlock with its key, and check the connection. Use only synthetic metadata. Record target, source/deployment, date, outcome, and any created IDs in TEST_RUN_LOG.md or your own sanitized run note.

| ID | Purpose / procedure | Expected result |
| --- | --- | --- |
| M01-M01 | Submit `tiny-a.png` and `tiny-b.png`; open saved detail; add a unique remark; inspect Sheet/Media/Remarks | One Responses row; two correct files; description in R; remark references fixed B ID |
| M01-M02 | Submit exactly 5 MB/file; four 5 MB files; then >5 MB, >20 MB combined, >10 files and EXE | Boundaries accepted; invalid cases rejected; count/total cases already covered offline |
| M01-M03 | Using a file within limits, go offline in browser devtools during upload; restore connection before timeout | Resume if retry window allows; otherwise explicit failure with no incomplete saved submission; inspect retained files |
| M01-M04 | After files upload, interrupt only the app save response; restore network; choose Retry saving uploaded files without reloading | Same fixed ID; one logical sequential submission; do not start a new upload |
| M01-M05 | Access API without unlocking, then unlock and Lock API | Protected records inaccessible before login and after logout |

## Cleanup and reports

Reports live in `output/test-runs/*.json`, ignored by Git and deployment. They include run ID, target, runner commit/dirty flag, expected milestone source, timings, pass/fail, and known created IDs. Configuration errors before a test starts print a safe message and do not create a run. Ctrl+C or a killed process can leave status `running`; treat that as incomplete, never passed. A failed report can still list successful writes. Lost initiation responses can leave artifacts whose IDs the runner never received; inspect run-labelled filenames before cleanup. Google app properties also carry the submission ID.

Preserve artifacts by default. For explicit manual cleanup: back up the test Sheet, match the exact Responses B ID and run-labelled title, remove only matching Remarks A IDs, and trash only the exact file IDs/names in that run manifest. Do not delete unrelated rows or folders. Re-run reports keep old data intact. No automatic destructive cleanup or production-data writes exist.

## GitHub Actions

`Offline regression` runs on main pushes/PRs and on demand with no secrets or Google access. `Live milestone regression (manual)` defaults to API read-only; explicitly select write mode to create retained fixtures. In GitHub → repository Settings → Secrets and variables → Actions → New repository secret, add **M01_TEST_ACCESS_KEY** with the deployed test key. Optionally add VERCEL_AUTOMATION_BYPASS_SECRET for protected deployments. The workflow maps the repository key to TEST_TARGET_ACCESS_KEY for the runner. No Google OAuth secrets or GitHub Environment are required. Reports upload as artifacts retained 90 days; download important evidence before expiry. Selected sanitized milestone reports are kept permanently in `test-evidence/m01/` in Git. Workflow files must reach main before they appear in Actions. Baseline branches intentionally do not evolve; run the tooling workflow against their preserved deployment.

Tooling v1.0.1 uses repository secrets because GitHub Environments for private repositories require a paid plan. Local `.env.test.local` still uses TEST_TARGET_ACCESS_KEY. [GitHub plan requirements](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
# M02 — Firebase pilot tests

M02 is isolated from M01. See [M02 setup and reconstruction](M02_SETUP.md) for Node 24, separate resources, Firebase credentials, role assignment and deployment configuration. Do not run the M01 shared-key harness against M02.

| IDs | Purpose | Recreate | Expected result |
| --- | --- | --- | --- |
| M02-A01–A05 | API identity/domain/verification gate; default student; ownership across list/detail/remarks/files/tickets; expiry/tampering/CSRF; disabled profiles and logout | `npm run test:m02` | All cases pass with injected authentication and in-memory data; no real services |
| M02-S01–S04 | Conflicting/disabled profiles fail closed; RAW profile writes have no passwords; configuration blocks M01 resources and deployed emulator; operator role writes target the correct RAW cell | `npm run test:m02` | All cases pass |
| M02-E01 | Real Auth Emulator registration and email action verification | `npm run test:m02:emulator` | Unverified session rejected; applying local verification code allows registration as student |
| M02-E02 | Real emulator wrong-domain, malformed and expired credentials | Same | Access denied |
| M02-E03 | Real emulator identity plus submission permissions | Same | Owner succeeds, second student blocked, faculty review allowed |
| M02-E04 | Replay a copied session after logout | Same | Session rejected |
| M02-E05 | Reset password through emulator action codes | Same | Old password fails; new password succeeds |
| M02-E06 | Chromium + built React + Auth Emulator + in-memory application store | `npm run build:m02`, then emulator command | Register → verify → complete profile → submit → faculty remark → logout; no page errors |
| M02-L01 | Real local/deployed health/config and anonymous-access checks | `npm run test:m02:live -- --target local` or `--target https://ppcp-m02-auth-test.vercel.app` | M02 project identified; anonymous submissions rejected; no writes |
| M02-L02–L05 | Synthetic administrator-verified Firebase accounts → real Node API → real Sheets/Drive; roles, private upload/download, second-user isolation and logout replay | Add `--write` to live command | All steps pass; labelled Google records/files retained; synthetic Firebase users deleted |
| M02-M01 | Actual organization inbox verification, immediate profile access and password reset | Follow M02_SETUP.md live acceptance locally and on the pilot URL | Emails actually arrive, verification grants student access, old password fails after reset |
| M02-M02 | Two controlled student accounts plus staff account, mobile layout and private files | Follow M02_SETUP.md live acceptance | Owner/staff succeed; other student blocked; student cannot add remarks; no public Drive access |

Live write tests create three synthetic `m02-test-...@welingkar.org` accounts marked verified by the administrator credential; **no email is sent**. They do not establish mailbox delivery or a real verification-link journey. Their UIDs are recorded for cleanup; Google Profiles rows, submission and tiny PNG remain inspectable. Do not turn those synthetic identities into real accounts. Manual tests use real inboxes; never record passwords, action codes, ID tokens or cookies in reports. All automated reports are sanitized JSON under output/test-runs.

M02 remains a candidate until required live/manual tests pass and a stable source tag, branch, deployment URL and evidence are recorded. Runtime and browser failures must be logged honestly; an emulator pass does not certify live behavior or 60-user capacity.
