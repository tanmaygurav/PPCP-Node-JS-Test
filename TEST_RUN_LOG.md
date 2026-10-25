# Test run log

Append results; do not overwrite earlier failures or promote reported/manual results into automated evidence. Dates here are Asia/Kolkata (IST). JSON report timestamps and filenames use UTC. Raw reports remain ignored; archive selected sanitized reports separately when long-term retention is required.

| Date | Version / target | Tests | Result / evidence |
| --- | --- | --- | --- |
| 2026-10-24 | Original prototype; sandboxed localhost tests | API fixture tests | Initially failed due to localhost access restrictions; rerun outside the sandbox passed. No application fix was required |
| 2026-10-24 | Original prototype; local mocked tests | Original 15 core cases (now M01-U01–U05, A01–A05, G01–G05) | Passed; tool output in development chat; no original JSON manifest |
| 2026-10-24 | Google OAuth setup | Consent | Initially blocked with access_denied; adding the exact signing-in account to Google's test-user list resolved it |
| 2026-10-24 | Initial local live connectivity | Sheet/folder access | Sheet 403 and Drive 404; sharing both test resources with the authorized personal account resolved it; no writes occurred on failure |
| 2026-10-24 | Local live Node → Google | Connection, two PNG uploads, save/readback, sequential retry, remark | Passed; original synthetic submission `7468e465-a24b-462c-9149-1daf5d5ed2fe`; files and remark retained. No original JSON manifest |
| 2026-10-24 | Vercel deployment | Initial manual integration test | User reported “test worked”; individual scenarios and source SHA were not independently captured |
| 2026-10-24 | Earlier Vercel deployments | Build and runtime | Reported missing local OAuth helper in build, then browser script executing as Node; deployment-only checks, updated source and root/framework settings preceded successful user acceptance |
| 2026-10-24 | Harness v1 development checkout; offline | 18 core/harness cases | Passed; `offline-2026-10-24T12-49-14-721Z-8a9f07cf.json` under output/test-runs |
| 2026-10-24 | Harness v1 development checkout; Node 22 | 18 core/harness cases | Passed under the Vercel runtime major; `offline-2026-10-24T13-58-00-526Z-73e1f445.json` |
| 2026-10-24 | Harness v1; Chromium + in-memory local server | B01–B05 | Passed, including simulated interrupted upload; `browser-mock-2026-10-24T12-50-01-524Z-ff4a2f7b.json`. Does not prove live Google CORS |
| 2026-10-24 | Preserved Vercel URL; expected app `7f1e82e` | L01–L03 | Passed; `api-smoke-2026-10-24T13-46-46-227Z-5071e84c.json`. Actual deployment SHA not verified by legacy API |
| 2026-10-24 | Preserved Vercel URL; expected app `7f1e82e` | L01–L07 | Passed; `api-smoke-2026-10-24T13-47-20-502Z-b601b920.json`; two uploaded PNGs, exact readback, sequential save retry, remark readback; synthetic artifacts retained |
| 2026-10-24 | Real Chromium → preserved Vercel URL → Google | B01–B04 | Passed; `browser-live-2026-10-24T13-51-13-000Z-a28c0892.json`. Actual browser uploads and feedback succeeded; oversized file rejected without upload initiation; logout returned API 401 |
| 2026-10-24 | Final Chromium + in-memory fixture | B01–B05 | Passed after logout verification tightened; `browser-mock-2026-10-24T14-01-16-196Z-dc5a68da.json` |
| 2026-10-24 | Final Chromium → Vercel, read-only | B01/B03/B04 | Passed; `browser-live-2026-10-24T14-03-15-613Z-ffb272a8.json`; no new Google artifacts |
| 2026-10-24 | Local target with separated local credentials | L01–L03 | Passed; `api-smoke-2026-10-24T14-03-00-507Z-38827d63.json`; no new Google artifacts |
| 2026-10-24 | Final Node 22 harness | All 18 offline cases | Passed after local-alias safety check; `offline-2026-10-24T14-06-03-437Z-03129b34.json` |
| 2026-10-24 | GitHub Actions, Ubuntu / Node 22, commit `9e794a3` | Syntax, offline suite, Chromium fixture and artifact upload | Passed; [run 40101243415](https://github.com/tanmaygurav/PPCP-Node-JS-Test/actions/runs/40101243415) |
| 2026-10-24 | GitHub Actions, Ubuntu / Node 22, tooling v1.0.1 / `7bd1707` | Syntax, offline suite, Chromium fixture and artifact upload | Passed; [run 40101541777](https://github.com/tanmaygurav/PPCP-Node-JS-Test/actions/runs/40101541777); permanent job/step summary in `test-evidence/m01/github-actions-40101541777.json` |
| 2026-10-24 | Authenticated Vercel metadata | Production source / branch separation | Confirmed stable URL → READY Production `dpl_6XDdWjrDhGTa7Jr7w3Bk74fFtjV3`, milestone branch, commit `7f1e82e`; later main `920ef91` is a separate Preview. Metadata archived in `vercel-production-verification.json` |
| 2026-10-24 | Confirmed M01 Production deployment | L01–L03 | Passed; `api-smoke-2026-10-24T14-18-49-472Z-ce758b2d.json`; no new records/files |

## Pending verification

- Live API and real-browser write regressions are now captured above. Reports contain exact created IDs; no secrets or upload-session URLs are retained.
- Manual M01-M02 boundary acceptance, M03 real network interruption, M04 ambiguous save-response recovery: not individually verified in historical evidence.
- 60-user burst, production identity/private attachment delivery, and M02 accounts: not implemented or verified by M01.
- Offline GitHub Actions passed. Live GitHub runs still require the **M01_TEST_ACCESS_KEY repository secret**; local live API/browser evidence is recorded above. The repository initially returned 404 while private; after the user made it public, hosted job/step results were independently verified. Source refs alone do not freeze Vercel's production branch; verify branch tracking independently.
- The earlier **No deployments found** error is resolved at the deployment level: authenticated metadata now verifies M01 in Production and later main work in Preview. The raw Branch Tracking settings field is not exposed by this connector; the observed deployed source/alias separation is archived above.

Selected passing JSON reports are archived permanently under `test-evidence/m01/`; they show the exact runner commit and whether the tooling checkout had uncommitted changes. They do not claim a clean release checkout or a verified deployment commit when those facts were unknown.

Tooling v1.0.1 is a CI compatibility correction: it uses a repository secret instead of a GitHub Environment, avoiding a paid-plan prerequisite for private repositories. Workflow YAML was validated locally; no application runtime code changed.

## M02 implementation — 2026-10-25

- Separate personal Spark project `ppcp-auth-test`; Email/Password enabled, server credential connection verified. Added stable pilot hostname to authorized domains. Created separate test Sheet and private Drive folder listed in milestones.json; Google connection/schema checks passed. No M01 resources changed.
- Initial API fixture omitted its authentication dependency; fixed. A browser initialization failure exposed mixed Firebase browser SDK versions; aligned Firebase 13.1.0/Admin 14.5.0 and moved M02/tooling to Node 24.22.1. Fixed the browser dropdown selector and a logout UI mode bug. Initial failures were not accepted as passing evidence.
- M02-A01–A05 and S01–S04 passed (9 cases); latest sanitized unit report `m02-unit-1792905057012.json`. M02-E01–E06 passed, including Chromium full flow (`m02-emulator-1792904699451.json`). Emulator verification/reset use synthetic local action codes, not real mail.
- First live localhost attempt could not reach a sandboxed server; restarted it with ordinary local networking. The first connected live run caught a malformed role-cell update URL; corrected the operator command and added S04. Synthetic Firebase accounts from that failed run were deleted; its labelled Profiles rows remain for traceability.
- Real local Node → Firebase → Sheets/Drive live tests L01–L05 then passed (`m02-live-1792904970076.json`): administrator-verified synthetic identities, bound uploads, RAW owned submission, private file permissions/download, second-student isolation, faculty feedback, logout replay. Three synthetic Firebase users deleted; labelled Google records/files retained. This does not establish real email delivery.
- M01's 18 offline cases passed on Node 24 (`offline-2026-10-25T04-58-22-478Z-93f8604a.json`); its 5 Chromium fixture cases passed (`browser-mock-2026-10-25T04-58-24-800Z-786fc6ef.json`); deployed read-only checks L01–L03 passed (`api-smoke-2026-10-25T04-58-29-762Z-9aa4b083.json`). Frozen M01 app configuration remains unchanged.
- Syntax and React production build passed. Production dependency audit: zero advisories. Full audit still reports five moderate advisories in Firebase CLI development dependencies; no forced major downgrade applied.
- Separate Vercel project `ppcp-m02-auth-test` created; 12 sensitive variables configured directly from local files. Real deployed flow, organization inbox delivery/reset, manual mobile/two-account acceptance and final milestone freeze remain pending at this entry. Candidate evidence does not certify 60-user capacity or production readiness.
- User-reported local M02-M01 acceptance: **success** for actual @welingkar.org registration, received verification email, verified access/profile completion, sign-out and password reset email/action. This is user-reported live mailbox evidence, separate from synthetic automated tests. Deployed mailbox flow remains pending.
- Initial Vercel builds failed because the preserved `.vercelignore` excludes local scripts. Moved deployment syntax validation to root `check-m02.mjs`, referencing only shipped runtime files; local build passed. The short hostname was already assigned elsewhere, so the pilot uses its own assigned `ppcp-m02-auth-test-tanmays-projects-8434e035.vercel.app` hostname. Updated only M02's origin, live-test allowlist and Firebase authorized domains; did not reassign the unavailable hostname.
- Hostname clarification after the first READY build: the earlier add-domain call returned 409, but subsequent alias metadata independently verified `ppcp-m02-auth-test.vercel.app` on this exact project/deployment. The team-qualified alias redirected to Vercel SSO. Canonical configuration was therefore restored to the verified short production alias, with no protection changes or domain reassignment.
- The first deployed function startup hit upstream jwks-rsa/jose CommonJS-to-ESM incompatibility inside Vercel's loader. Added a scoped jose 5.10.0 compatibility pin and S05, which exercises Firebase Admin with native require(esm) disabled. Local build and all 10 API/storage/module-loading cases passed after the fix; refreshed emulator and deployed evidence will be recorded separately.

## Entry template

Record: date/time (IST), milestone/app tag, harness commit/tag, local/deployed origin, actual deployment commit if verified, test IDs, manual/automated, outcome, report filenames or archived evidence, created IDs, limitations and cleanup status. Never paste keys, tokens, cookies, raw OAuth callback URLs or upload-session URLs.
