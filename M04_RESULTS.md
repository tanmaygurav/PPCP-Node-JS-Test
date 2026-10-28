# M04 candidate verification — 2026-10-27 (IST)

Status: implemented candidate; **not yet a live-accepted or frozen event release**. No old data, accounts or attachments were migrated. M01–M03 application modules, preserved source refs, data and credentials were not changed.

## Verified locally

- M04 production React build and server syntax checks pass on Node 24.22.1.
- Eighteen API/domain/store/Drive-permission tests passed against local Firebase Auth/Firestore emulators and adapters, including revoked-session rejection during parallel profile loading, dotenv credential serialization, twenty concurrent transactional ID allocations, exact retry reconciliation, changed-payload rejection, ownership, failed edits, attachment boundaries, lock/save races, remarks, last-admin protection and deactivated access.
- Actual browser → Node API → Auth/Firestore emulator rehearsal passed: lost create HTTP response/retry, student create/edit/lock, faculty using the second institutional domain reviewing/remarking/unlocking, and admin disabling a faculty user whose existing session then receives 403. No browser script errors were observed.
- Desktop student/admin and 390px faculty detail layouts were rendered and screenshots inspected. No horizontal overflow in the tested mobile faculty view.
- Query combinations and cursor separation ran against the emulator. Forty-seven composite index definitions are committed; deployed index readiness is **not** established by emulator success.
- Preserved offline regressions pass: M01 18/18, M02 10/10, M03 14/14. Initial localhost attempts were blocked by sandbox networking; reruns with loopback access passed.
- Read-only live M01 L01–L03 pass; M02 and both M03 health endpoints return their expected milestone identifiers. No live legacy write checks were run.

## New resources

- Separate Vercel project: `ppcp-m04-event-poc`, project ID `prj_qGTt8zK98qN9Ue8WH23sTKEANwS4`, existing team `team_abf9xIKj95Kv5Rei3QPOU6Gb`. Node 24, Mumbai. Candidate URL: https://ppcp-m04-event-poc.vercel.app.
- Owner-created Firebase/GCP project, OAuth client and private Drive folder are connected. No legacy Firebase project, Drive folder or OAuth credential is used by M04.

## Connected-resource checks

- Owner-created Firebase project `ppcp-m04-redesign`: Firestore Standard in `asia-south1`; Email/Password authentication enabled.
- New private Drive folder `1mSHxDTd2_kqc92PNdiqklz2EiBb21BqE` is accessible through the new OAuth client. Credentials stay in ignored local files.
- Firestore browser-deny rules and index manifest deployed using an isolated owner CLI sign-in. Runtime credentials were not elevated for deployment.
- Initial institutional administrator registered and verified their real email, completed the profile and confirmed the admin controls. Backend independently verified active admin status and completed bootstrap; the one-time UID allowlist was cleared afterward.
- Domain and default faculty-list queries pass against live Firestore. Local app health and portal page return HTTP 200.
- Live functional/Drive suite passed against the local Node app with real Firebase/Firestore/Drive: exact retry and ownership, anonymous direct view, edit/lock/remark/unlock, over-limit rejection, actual 5 MB/file and 10 MB/ten-file boundaries, staff deactivation with existing-session denial, and faculty search/filter/sort combinations. Sanitized report: `output/m04/live-1793099783995.json`. This is real-provider local-server evidence, not deployed Vercel or load acceptance.
- Owner confirmed ten attachments on the faculty detail page and opened a valid PDF from PP004 in a private browser without Google sign-in.
- First local five-user stage completed 5/5 workflows with zero failures: read p95 394 ms, create/edit save p95 3,374 ms, excluding direct transfer. The save target of 3,000 ms did not pass; higher local stages were stopped. Report: `output/m04/capacity-1793100256786.json`. Repeat from the Mumbai deployment before claiming event capacity.

## Pending acceptance

The original checklist below predates the connected-resource and deployment checks; completed checks are recorded above and below. Higher-load acceptance, second-domain inbox/reset testing, organizer rehearsal and release freeze remain pending.

- Connect owner-created resources; verify billing remains disabled, rules are deployed and composite indexes are ready.
- Verify real Firebase registration/verification/reset delivery for both institutional domains and bootstrap the intended administrator.
- Complete actual Drive sharing, anonymous direct-view, replacement/interruption and exact-byte boundary tests using the new resources.
- Run deployed faculty search/filter/sort/pagination checks and staged 5 → 20 → 60 → 120 workloads; attempt 200 only if all earlier stages pass. No live capacity or latency target is certified yet.
- Organizer rehearsal and manual fallback readiness; only afterward create the release tag/milestone branch and verify stable deployment provenance.

## Evidence and limitations

Local sanitized reports/screenshots are in ignored `output/m04`; preserved regression runners retain their own `output` reports. Important final evidence should be copied into a new `test-evidence/m04` directory after live acceptance, without changing older evidence.

Emulator fixtures have synthetic verified accounts and no real Drive transfers. Offline Drive adapters exercise rejection paths but are not evidence of Google permissions or throughput. Browser rehearsal does not establish real inbox delivery. Provider billing/document operations require separate console verification; API sample counts alone are insufficient.

Two early browser rehearsals stopped on test-harness dropdown selectors; those selectors were corrected and the end-to-end rehearsal rerun successfully. The failures are not presented as accepted runs. No release tag has been created.

## Mumbai candidate deployment

- Branch `codex/m04-event-poc` is pushed to GitHub. READY deployment `dpl_HMF76c6Qkth4Ao1N8VccTZahkzn6` resolves from the canonical alias to source `c9cd6a803d6269df73ba8311f5375ca01c4003ad`, branch `codex/m04-event-poc`, region `bom1`. This is a candidate, not a frozen milestone.
- Public health/auth-config endpoints return HTTP 200 with M04 and the new Firebase project. The canonical hostname is authorized in Firebase; no deployment protection settings were disabled.
- Deployed real-provider functional suite passed: `output/m04/live-1793102247628.json`.
- First deployed five-user probe overlapped functional testing: 5/5 completed, zero request failures, read p95 2,641 ms (target missed), save p95 2,581 ms. Report `output/m04/capacity-1793102227000.json`; not treated as isolated capacity evidence.
- Subsequent isolated five-user run: 5/5 completed, zero failures, read p95 552 ms, create/edit save p95 2,441 ms, excluding direct transfer. Report `output/m04/capacity-1793102332189.json`. This small warm-deployment observation does not certify higher loads or eliminate cold-start risk.
- Owner confirmed administrator sign-in and Manage users on the hosted app.
- The next staged run again missed the five-user prerequisite on reads (2,327 ms p95), despite 5/5 completed and zero request failures; save p95 2,852 ms. Twenty users were provisioned but the twenty-user stage did not run. Report `output/m04/capacity-1793102712645.json`.
- Static live audit passed across 25 current submissions: unique sequences/readable IDs, attachment limits, complete pagination for all four sort modes, and matching active-admin counts. Report `output/m04/audit-1793102946315.json`.
- Candidate improvement uses Firestore REST in production and retains credential-free emulator gRPC. API Server-Timing now separates auth, profile and read-query work. This change still requires deployed verification; earlier latency failures remain recorded.
- REST candidate `0356f5d`, deployment `dpl_6zKyhMYYEPpJVpqhdm5FbsmvmaB1`, passed deployed functional checks (`output/m04/live-1793103265797.json`). Five-user stage still missed targets: read p95 2,317 ms, save p95 3,041 ms, 5/5 workflows complete and no failures (`output/m04/capacity-1793103296342.json`). Timing headers place the slow query work below 100 ms; startup/authentication dominate. Higher stages did not run.
- Real Chromium on the deployed app passed direct browser-to-Drive upload under deployed CORS/CSP, a deliberately dropped successful save response with exactly one saved submission after retry, a separate anonymous Drive tab, editing with retained attachment, and student locking (`output/m04/browser-live-1793103381440.json`).
- Follow-up candidate overlaps profile loading with the SDK's revocation check after cryptographic verification, and verifies Drive permission creation from its API response without a redundant metadata read. Eighteen checks and the emulator browser rehearsal passed; live latency verification is pending.
- On 2026-10-28 IST, the owner reported successful hosted password reset through email, subsequent sign-in and restored visibility of Manage users. This is real mailbox acceptance for the administrator's `@welingkar.org` account; it does not establish inbox delivery for the second domain.
- Source `e63e2dc`, deployment `dpl_8g2Za8M87g58a7PaatPZ7HWujUYP`, passed live functional checks (`output/m04/live-1793163778660.json`). Five-user stage completed 5/5 without request failures; read p95 2,397 ms still missed the 2,000 ms target, while save p95 improved to 2,178 ms (`output/m04/capacity-1793163810231.json`). No higher stage ran.
- A subsequent candidate defers the Firestore SDK import and overlaps it with token validation. Eighteen emulator checks/browser rehearsal and a real-resource probe of the actual deferred API entry point passed (session creation, profile access and indexed query). Deployed latency is not yet established for this candidate.
