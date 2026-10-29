# M04 URL navigation checkpoint

Uses the existing `ppcp-m04-event-poc` project (`prj_qGTt8zK98qN9Ue8WH23sTKEANwS4`) in team `team_abf9xIKj95Kv5Rei3QPOU6Gb`. Firebase `ppcp-m04-redesign`, the existing M04 Drive folder and application accounts remain in use. No data migration, persistent drafts, history or new resources. Capacity acceptance remains separate.

## Preserved working version

- Annotated tag `m04-routing-baseline-v0.1.0` points to `e05cac3028521135e1b6070dc6ee1cadcd79dea0`.
- Production baseline: `dpl_DTWHqfbfRrveYDpL1CGs6MB5SNet`, Mumbai; canonical origin `https://ppcp-m04-event-poc.vercel.app`.
- Original branch `codex/m04-event-poc` retained. Work proceeds on `codex/m04-url-routing`. Its automatic Git deployments are disabled in `vercel.json` before first push; deployments are manual and explicitly target the M04 project.
- Build configuration: Node 24.x, `node build-deployment.mjs`, output `dist-deployment`, `PPCP_MILESTONE=M04`.
- Environment names: `M04_APP_ORIGIN`, `M04_FIREBASE_PROJECT_ID`, `M04_FIREBASE_AUTH_DOMAIN`, `M04_FIREBASE_WEB_API_KEY`, `M04_FIREBASE_WEB_APP_ID`, `M04_FIREBASE_SERVICE_ACCOUNT_JSON`, `M04_GOOGLE_CLIENT_ID`, `M04_GOOGLE_CLIENT_SECRET`, `M04_GOOGLE_REFRESH_TOKEN`, `M04_GOOGLE_MEDIA_FOLDER_ID`, `M04_SIGNING_SECRET`. Bootstrap allowlist is no longer configured after bootstrap. Values stay in secure provider settings/ignored local configuration.

## Navigation behavior

React Router v7 data router retains authentication, theme and mutation recovery in one portal shell. Routes: `/`, `/submissions/new`, `/submissions/:id`, `/submissions/:id/edit`, `/admin/users`, `/admin/event-theme`. Internal document IDs appear in URLs, readable PP identifiers in screens. Links support normal browser new-tab behavior.

List filters/sort/page size are shareable query parameters. Cursor trail, current page and scroll are browser history state scoped to the signed-in UID. A copied URL starts at page one; expired/invalid cursors restart with filters retained. Back/Forward restores the previous page and scroll. Concurrent changes require refreshing. Save acknowledgment replaces the form entry with detail; refresh, remarks, locks and retries do not push history. Obsolete route reads are aborted and ignored.

Sign-in/profile completion retain the requested URL. Protected screens recheck current API identity; student ownership and administrator access remain server-enforced. Locked/staff edit links redirect to detail with an explanation. Missing and foreign submissions share an unavailable screen.

Unsaved forms show a keyboard-accessible modal before internal navigation. Cancelling preserves fields and selected File objects in the mounted shell. Pending/unreconciled operations block leaving until receipt reconciliation, retaining the existing operation ID. Reload/tab-close warnings are best effort; no persistent drafts are introduced. SPA fallbacks cover only the frontend route families; API and asset routes retain priority.

## Verification and release

1. Build with `npm run build:m04`. Run `npm run test:m04:emulator` (Node 24 and Java 21), the preserved offline regressions, and `node scripts/m04-routing-rollback.mjs`.
2. Create an explicitly targeted Preview deployment from the routing branch. Set only its branch-specific Preview `M04_APP_ORIGIN` to the assigned stable preview origin, add its hostname to M04 Firebase authorized domains, then rebuild. Production origin remains canonical.
3. Exercise synthetic write fixtures on Preview, including create/edit/lock/remark/unlock, direct Drive viewing and retained theme. PP039 is read-only. Verify deployed source SHA and project.
4. After checks pass, create Production from the same verified source with Production's canonical origin. Verify canonical alias, actual source/branch and navigation, then wait for one owner navigation check.

## Deployed checkpoint — 2026-10-28 IST

- Verified application source: `89dbb70ab40cfacf4278fc0b6bbd2b9eb527b3f0`, `codex/m04-url-routing`.
- Accepted Preview: `dpl_AZ6M9Jf5e5fCikpHbbiT8Asy31m6`. Branch hostname `ppcp-m04-event-poc-git-codex-m-b84ac9-tanmays-projects-8434e035.vercel.app` had its own origin and was authorized in M04 Firebase. Protected access used a temporary share cookie; deployment protection remained enabled.
- Production: `dpl_HRcyUjLUGMTihZqjjg8Wok9FbAb1`, READY in `bom1`, canonical origin `https://ppcp-m04-event-poc.vercel.app`. Exact source and alias verified after deployment. Production Git tracking is `codex/m04-url-routing`; automatic Git deployments remain disabled by source configuration.
- The previously unlinked M04 project was connected to the existing repository to permit branch-specific Preview variables. Vercel prohibits making a branch with Preview-specific variables the Production branch. After Preview acceptance, its temporary `M04_APP_ORIGIN` override was removed, then Production tracking was changed. The base origin variable was never modified. The branch alias now follows Production and is not a separate testing origin. A future Preview cycle must explicitly configure a non-Production testing branch and matching origin again.
- All 20 emulator API/domain/store/Drive checks passed on the final run. The first run hit an emulator transaction lock timeout in the existing 20-create test; the repeat passed without code changes. This transient failure is not capacity evidence.
- Expanded emulator browser acceptance passed with zero browser errors: sign-in/profile return URLs, page/filter/scroll Back/Forward, copied queries, cursor expiry, direct URLs/refresh/new tabs, foreign/admin rejection, locked/staff edit redirects, unsaved file cancellation, unresolved-save navigation blocking, receipt retry and event themes.
- Hosted Preview and canonical Production passed synthetic create/edit/lock/remark/unlock with real Drive upload and anonymous direct viewing, one save after a dropped successful response, attachment/theme retention, indexed page/scroll restoration, copied-query page one and role access. Accepted synthetic records: Preview PP042, Production PP043. An earlier Preview run completed its workflows but failed at a test-only theme heading selector; the corrected test passed. PP039 was compared read-only before/after both complete runs and remained unchanged.
- Preserved offline regressions passed: M01 17 checks, M02 10 checks, M03 14 checks. Read-only GETs of all four M01/M02/M03-A/M03-B stable URLs returned HTTP 200. No preserved source modules or legacy resource data were written.
- Exact baseline build plus temporary 302 redirects, root, API and assets passed local rehearsal. Secret scan passed. Vite reports a 522 KB JavaScript chunk (145 KB gzip); capacity acceptance remains separate.
- Sanitized evidence is in `test-evidence/m04/url-routing-*.json`. Later evidence/tooling commits do not change the deployed application runtime.
- On 2026-10-29 IST, the owner confirmed the requested PP039 browser Back/Forward check: dashboard and submission reopened correctly. Navigation checkpoint accepted. No capacity certification or milestone freeze is implied.

## Manual rollback

No routing toggle or automatic fallback is installed. If rollback is needed:

1. In the existing M04 Vercel project, restore baseline deployment `dpl_DTWHqfbfRrveYDpL1CGs6MB5SNet` using deployment rollback. Check canonical alias ownership afterward. Retain manual deployments and set Production tracking back to `codex/m04-event-poc` during rollback. If the deployment is unavailable, manually redeploy the immutable tag above using the same M04 Production environment, Node/build/output settings and canonical origin.
2. Add temporary project-level frontend redirects with status **302**: `/submissions/:path*` → `/` and `/admin/:path*` → `/`. Use project routing settings so they also cover the restored immutable deployment. Keep API routes outside these rules. If project-level rules are unavailable, redeploy the baseline tag with only these temporary Vercel redirect rules (do not alter application source).
3. Verify both route families return 302 to `/`; check sign-in, dashboard loading, opening a submission and authorized data access. Check an asset and API route. Do not write PP039 during rehearsal.
4. Remove the temporary redirects before releasing URL routing again and restore Production tracking to the verified routing branch. Verify deep links after removal.

`node scripts/m04-routing-rollback.mjs` builds the exact baseline frontend in ignored `.local/m04-routing-baseline` and rehearses temporary 302 redirects, root loading, API preservation, existing assets and missing assets locally. It does not change live routes, deploy or retain data backups. Its generated redirect JSON is an operator reference, not active deployment configuration.
