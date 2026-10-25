# M02 — Firebase accounts and permissions

Status: preserved functional milestone `m02-firebase-auth-v0.1.0`, app commit `c1c2731`; production branch/source and user-reported local/Vercel acceptance are verified in the registry and run log. The earlier rc.1 tag remains available. This is not a production-load certification. M01 remains on its existing branch and URL. Never promote main onto either frozen milestone project. New regression tooling and evidence live on main and tooling tag `m02-regression-tools-v1.0.1`.

## Accounts and test resources

- Firebase Spark project: `ppcp-auth-test` (personal Google account). Enable Authentication → Sign-in method → Email/Password. Firestore, Firebase Storage, Analytics and paid upgrades are not required.
- Native Google Sheet: `1IKhPcT5cYwcGOUAuvZ9HfW_i0RGiRC4c8UDgr1zuCAo`, named PPCP M02 Test DB.
- Private Drive folder: `1d-NdxhDeEFJywRlESw2p_UjP7nOgQKT4`, named PPCP M02 Test Media.
- M02 refuses the known M01 resource IDs. Do not share the M02 folder or its files with anyone-with-link. File downloads use an authorized Node endpoint, not public Drive URLs.
- Production will use a separate organization-owned Firebase project and Google resources. Existing accounts, historical submissions, S3, and load certification are deferred.

## Local setup

Use **Node 24 LTS (24.12 or newer)**, then `npm ci`. Current Firebase SDK packages require this runtime. M01's frozen application retains its original Node 22 configuration. The machine's older default Node 20 is not supported for M02.

Copy `.env.m02.example` to ignored `.env.m02.local` if it does not already exist. Firebase web configuration is public, but service-account keys, Google OAuth secrets and signing secrets are private. Never add private JSON files to Git. Keep them under ignored `.local/`.

1. Firebase → Project settings → General → Your apps → SDK setup and configuration → Config. Set FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN and FIREBASE_WEB_APP_ID. Storage/messaging/measurement configuration is unused.
2. Firebase → Authentication → Settings → Authorized domains: add `localhost` and the eventual stable M02 Vercel hostname. Use Firebase's default email action handler initially. Custom email domains and Microsoft administrator access are unnecessary for email/password login.
3. Firebase → Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Save to `.local/ppcp-auth-test-service-account.json`; set `GOOGLE_APPLICATION_CREDENTIALS=.local/ppcp-auth-test-service-account.json` locally. Node uses it to create signed session cookies and check revocation. This is separate from the Google OAuth account used for Sheets/Drive.
4. For fresh resources, configure the original Google test OAuth authorization locally and run `npm run m02:resources` once. It creates new empty resources, copies only headers, sets Education active, generates an independent signing secret and saves configuration locally. It refuses duplicate provisioning when IDs are already set. If interrupted, inspect resources and finish their headers manually; do not rerun blindly.
5. Run `npm run build:m02`, then `npm run start:m02`. Open `http://localhost:3002`. M01's `npm start` still serves the old local harness on port 3000.

No VITE-prefixed secrets or build-time credential injection is used. The browser loads only public Firebase configuration from `/api/auth/config`.

## Authentication, permissions and interfaces

React signs in with Firebase using in-memory persistence, then exchanges a recently issued ID token at `POST /api/auth/session`. Node verifies the token, exact email domain and verified-email flag before issuing a one-hour HttpOnly, SameSite=Strict session cookie (Secure on HTTPS). Firebase client credentials are cleared after exchange. Every protected request checks Firebase session revocation and profile status. Logout revokes all sessions for that Firebase account and clears this browser's cookie. In-flight requests may finish; revocation follows Firebase timestamp semantics.

The organization-domain restriction protects the portal APIs. Firebase's public email/password signup endpoint can still create out-of-domain Firebase accounts when called directly; those accounts cannot start a portal session. No paid Identity Platform blocking function is enabled.

Firebase Admin's jwks-rsa dependency uses an ESM-only jose release by default, which failed under Vercel's loader despite working on native Node 24. The lockfile pins jose 5.10.0 specifically under jwks-rsa for CommonJS compatibility. S05 loads Firebase Admin with native require(esm) disabled to catch this regression. Review [the upstream issue](https://github.com/auth0/node-jwks-rsa/issues/507) before removing the override; production dependency audit currently passes.

Public GET routes: `/api/health`, `/api/auth/config`. Session exchange requires same-origin JSON POST. `GET /api/me` returns identity and an optional profile; `POST /api/profile` creates only a student profile after email verification. No client can set email, role, status, author or submission ownership. `/api/session` from M01 is unavailable on M02.

Profiles columns A–H: Firebase UID, Email, Name, Program, Student ID, Role, Status, Created at. Passwords are never written to Sheets. Responses retains the 18 M01 columns and adds **Owner UID in S**. Remarks retains UUID, Given by, Remarks, Timestamp. Calculations retains Active Domains in C. All data writes use RAW values. Conflicting duplicate profile rows fail closed for administrator review; Sheets cannot provide atomic uniqueness under concurrent requests. Submission retry deduplication is best effort, not a transactional guarantee.

Students list/read only records with their Firebase UID, including remarks and attachment downloads. Faculty/admin review all records and add remarks; `/api/checks` requires admin. Unauthorized record/file access returns 404. Ownership is server-set, and signed upload tickets bind UID and submission ID. Upload validation retains 10 files, 5 MB/file and 20 MB/submission; unfinished uploads may leave orphaned private files for later cleanup.

After a verified account completes its profile, a trusted operator with local credentials assigns roles using:

```powershell
npm run m02:role -- FIREBASE_UID faculty
npm run m02:role -- FIREBASE_UID faculty --apply
```

The first command is a dry run; use `admin` or `student` as needed. No role-changing HTTP endpoint exists. Back up the Sheet first for manual maintenance; resolve duplicate rows before role changes. Changes apply on the next request, without a role cache.

## Automated tests and reconstruction

```powershell
npm ci
npx playwright install chromium
npm run build:m02
npm run test:m02
npm run test:m02:emulator
npm run test:m02:live -- --target local
npm run test:m02:live -- --target local --write
npm test
npm run test:browser:mock
npm run google:smoke -- --target m01
```

Auth Emulator tests use only `demo-ppcp-m02` on 127.0.0.1:9099, synthetic accounts, and in-memory application data. They do not contact the real Firebase project, send real mail or write to Google Sheets/Drive. E06 launches Chromium against the built React app and tests registration → verification action → profile → submission → staff remark → logout. Emulator action codes are local-only; Firebase may print them to transient CLI logs, which are ignored. Sanitized JSON reports are saved in `output/test-runs`; archive selected reports in `test-evidence/m02` before freezing.

The separate `test:m02:live` command requires an explicit local or canonical M02 pilot target. Default is read-only. `--write` uses the local administrator credential to create three labelled, already-verified synthetic accounts without sending email. It tests the real APIs, Google ownership metadata, private file access and role enforcement, then launches Chromium to sign in, read the saved record, download its attachment and sign out on that same target. Finally it deletes only those created Firebase accounts. Labelled Google artifacts remain, with their IDs recorded. This complements the real-mail manual acceptance; it does not replace it.

To reconstruct the app, check out the app tag in a separate checkout, use Node 24 and `npm ci`, restore the ignored local environment/credential file from your own secure copy, then build and start. The frozen app contains the original five-step live API harness; use tooling tag `m02-regression-tools-v1.0.1` for the expanded six-step browser/API harness against the same preserved server or URL. Frozen source documentation records the acceptance state at implementation time; use the newer tooling registry/run log for final acceptance evidence. Do not move old tags for fixes or credential renewal.

For interactive emulator development, run `npx firebase emulators:start --project demo-ppcp-m02 --only auth` and configure demo project values plus FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 in a temporary local M02 configuration. Never set that variable on Vercel; startup rejects it there.

## Separate Vercel pilot and live acceptance

Use the **new** project `ppcp-m02-auth-test` linked to this repository/main, framework Other, repository root, Node 24.x, build `npm run build:m02`, output `dist-m02`. Keep M01's project tracking milestone/m01-google-integration. Main's `vercel.json` builds M02; restore M01 using its frozen branch and original configuration.

Set APP_ORIGIN to the exact stable M02 HTTPS origin. Set the Firebase public values, M02_SIGNING_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, M02_GOOGLE_SPREADSHEET_ID and M02_GOOGLE_MEDIA_FOLDER_ID as **server environment variables**. Set FIREBASE_SERVICE_ACCOUNT_JSON to the single-line contents of the private key JSON, marked sensitive. Do not set GOOGLE_APPLICATION_CREDENTIALS to a local path on Vercel. Do not set TEST_ACCESS_KEY or emulator variables. Redeploy after configuration changes. Only the public web fields are returned by `/api/auth/config`.

For this workspace, the separate pilot project ID is `prj_VSQ1HfIdZmNiFOhIT81Bja3jrAi2`. After a trusted operator signs in to Vercel CLI with global config `.local/vercel-cli`, `node scripts/m02-vercel-env.mjs` previews variable **names only** and `--apply` transfers the local values directly to that exact project's Production and Preview environments as sensitive values. It cannot configure M01. The script reads the locally saved credential filename from GOOGLE_APPLICATION_CREDENTIALS; the original download name is acceptable. `node scripts/m02-firebase-settings.mjs` checks Email/Password and authorized hosts; `--apply` adds localhost and the stable pilot host while preserving other settings. Neither helper changes billing plans.

Keep this project's Production Branch Tracking on `milestone/m02-firebase-auth`. A manual Preview deployment of this exact branch was created so it can be selected even when Vercel skips a new branch sharing an existing commit. With local CLI sign-in available, `node scripts/m02-deployment-record.mjs` verifies the canonical alias, source commit and project branch metadata and writes a sanitized evidence file. Do not infer a saved setting from a selected field with an error toast.

Canonical pilot origin: `https://ppcp-m02-auth-test.vercel.app`, independently verified as belonging to this project after its first successful build. Team-qualified and generated deployment aliases may require Vercel login and do not match APP_ORIGIN. Test through the canonical origin. Preview deployments need their own exact APP_ORIGIN and authorized host before interactive use; a Preview build alone is not a runnable milestone.

If Google OAuth authorization expires (external apps in Testing commonly issue seven-day refresh tokens), run the existing `npm run google:authorize` flow locally with the same OAuth client, copy the new refresh token into `.env.m02.local` without displaying it, rerun the Vercel environment helper, and redeploy the same preserved source. Alternatively leave the local GOOGLE_REFRESH_TOKEN blank to use the renewed ignored `.local/google-oauth.json` fallback; the deployment helper reads that resolved value. Never alter a frozen source tag merely to renew credentials. Re-run read-only checks before write tests.

Use synthetic content and controlled organization inboxes for live acceptance:

1. Register with @welingkar.org; confirm an unverified account cannot reach APIs. Open the actual verification email and continue; complete profile and confirm immediate student access. Verify a wrong-domain account cannot start a portal session.
2. Submit a synthetic problem with PDF/image attachments; inspect the actual Sheet UID and private Drive files. Download as owner; confirm a second student receives 404 for the same detail, remarks and file routes and cannot reuse the owner's upload ticket.
3. Assign a controlled faculty account using the local role command. Review both students' records and add a remark; confirm author is server-set. Confirm a student cannot add remarks or use admin checks.
4. Use Forgot password, open the actual email, set a new password and confirm old credentials fail. Check spam/delivery in Outlook.
5. Sign out, replay the saved session cookie through the test harness, and confirm rejection. Refresh the browser and confirm sign-in is required. Check mobile layout and browser console.
6. Repeat local and Vercel flows, run M01 regression, append dated outcomes to TEST_RUN_LOG.md, and retain sanitized evidence. Do not claim real mail, deployed authorization, Google integration or load tests from emulator success.

Freeze verified 2026-10-25: app commit `c1c2731`, branch `milestone/m02-firebase-auth`, stable Production deployment `dpl_CyCrMN3H1885vMu1n2BDnFDqCsjZ`. The actual saved project Production branch also matches. User reported local and Vercel verification/reset and submission/attachment acceptance as successful; emulator and live API/browser reports are archived separately. A separate second-inbox registration and device-specific mobile/manual two-account matrix were optional in the final user prompt and are not independently established by that aggregate success reply. Automated two-user isolation passed. Existing-data migration, load testing and S3 remain deferred. Never move old tags.

References: [Firebase session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies), [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth).
