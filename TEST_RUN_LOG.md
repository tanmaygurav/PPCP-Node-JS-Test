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

## Pending verification

- Live API and real-browser write regressions are now captured above. Reports contain exact created IDs; no secrets or upload-session URLs are retained.
- Manual M01-M02 boundary acceptance, M03 real network interruption, M04 ambiguous save-response recovery: not individually verified in historical evidence.
- 60-user burst, production identity/private attachment delivery, and M02 accounts: not implemented or verified by M01.
- GitHub workflows are pushed. Live GitHub runs require the **M01_TEST_ACCESS_KEY repository secret**; offline runs do not. Hosted Actions execution was not verified through the unauthenticated API (private repository returned 404). Source refs alone do not freeze Vercel's production branch; verify branch tracking independently.
- User selected the milestone branch, but the supplied screenshot showed **No deployments found**, so the saved branch setting is not yet confirmed. Deploy that branch once and retry the setting.

Selected passing JSON reports are archived permanently under `test-evidence/m01/`; they show the exact runner commit and whether the tooling checkout had uncommitted changes. They do not claim a clean release checkout or a verified deployment commit when those facts were unknown.

Tooling v1.0.1 is a CI compatibility correction: it uses a repository secret instead of a GitHub Environment, avoiding a paid-plan prerequisite for private repositories. Workflow YAML was validated locally; no application runtime code changed.

## Entry template

Record: date/time (IST), milestone/app tag, harness commit/tag, local/deployed origin, actual deployment commit if verified, test IDs, manual/automated, outcome, report filenames or archived evidence, created IDs, limitations and cleanup status. Never paste keys, tokens, cookies, raw OAuth callback URLs or upload-session URLs.
