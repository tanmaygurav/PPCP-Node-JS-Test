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

## Manual rollback

No routing toggle or automatic fallback is installed. If rollback is needed:

1. In the existing M04 Vercel project, restore baseline deployment `dpl_DTWHqfbfRrveYDpL1CGs6MB5SNet` using deployment rollback. Check canonical alias ownership afterward. If the deployment is unavailable, manually redeploy the immutable tag above using the same M04 Production environment, Node/build/output settings and canonical origin.
2. Add temporary project-level frontend redirects with status **302**: `/submissions/:path*` → `/` and `/admin/:path*` → `/`. Use project routing settings so they also cover the restored immutable deployment. Keep API routes outside these rules. If project-level rules are unavailable, redeploy the baseline tag with only these temporary Vercel redirect rules (do not alter application source).
3. Verify both route families return 302 to `/`; check sign-in, dashboard loading, opening a submission and authorized data access. Check an asset and API route. Do not write PP039 during rehearsal.
4. Remove the temporary redirects before releasing URL routing again. Verify deep links after removal.

`node scripts/m04-routing-rollback.mjs` builds the exact baseline frontend in ignored `.local/m04-routing-baseline` and rehearses temporary 302 redirects, root loading, API preservation, existing assets and missing assets locally. It does not change live routes, deploy or retain data backups. Its generated redirect JSON is an operator reference, not active deployment configuration.
