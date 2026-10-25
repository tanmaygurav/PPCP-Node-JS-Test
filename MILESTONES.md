# Runnable milestones

Start here when something breaks. Use a preserved version to separate application regressions from expired credentials, Google permissions, or deployment configuration.

| Milestone | App source | Runnable target | Evidence | Status |
| --- | --- | --- | --- | --- |
| M01 — Google integration | Tag `m01-google-integration-v0.1.0`; branch `milestone/m01-google-integration`; commit `7f1e82ef11edcc7b4e36c1e193035951b79e2d21` | [Vercel baseline](https://ppcp-node-js-test.vercel.app), or a local checkout | [Run log](TEST_RUN_LOG.md) | Production verified on milestone source; main observed as a separate Preview |
| M02 — Accounts and permissions | Tag `m02-firebase-auth-v0.1.0`; branch `milestone/m02-firebase-auth`; app commit `c1c2731` | [Separate Vercel pilot](https://ppcp-m02-auth-test.vercel.app); local port 3002 | [Setup and acceptance](M02_SETUP.md), `test-evidence/m02`; tooling tag `m02-regression-tools-v1.0.1` | Frozen functional milestone; automated/API/browser tests and user-reported live acceptance passed; production branch/source verified |

The M01 code has not changed. Tests, fixtures, workflows and this registry live on `main`; the latest tooling tag is `m01-regression-tools-v1.0.1`. The original `m01-regression-tools-v1` tag remains available; v1.0.1 switches live CI to repository secrets so private repositories do not require paid GitHub Environments. The frozen app tag retains its original scripts, while the current harness can test its unchanged API remotely. Tags are never moved; a fix becomes a new version.

## Preserve the public baseline URL

The existing Vercel project is `ppcp-node-js-test`, in `tanmays-projects-8434e035`. Keep its Production environment tracking `milestone/m01-google-integration`, **not main**. Vercel: Project Settings → Environments → Production → Branch Tracking. Confirm Production's Source commit is `7f1e82e`. If Vercel reports **No deployments found** for the branch, first use Deployments → Create Deployment to deploy `milestone/m01-google-integration`, then retry saving Branch Tracking. Selecting a branch with an error toast does not confirm it was saved. No APP_ORIGIN change is needed for the existing stable domain. Never promote main/M02 previews onto this baseline domain.

The tag and branch preserve code independently of Vercel's deployment retention. The URL alone does not prove a deployment's source version. Reports record the expected commit and leave actual deployment commit unknown unless independently verified. [Vercel branch configuration](https://vercel.com/docs/git).

**Verified 2026-10-24:** authenticated Vercel metadata resolves the stable alias to READY Production deployment `dpl_6XDdWjrDhGTa7Jr7w3Bk74fFtjV3`, branch `milestone/m01-google-integration`, commit `7f1e82e`. The subsequent `main` commit `920ef91` produced a separate Preview, not the stable Production alias. Read-only Google smoke checks passed after this verification. The API does not expose the saved Branch Tracking field; this evidence confirms the deployed source and observed main/Production separation. See `test-evidence/m01/vercel-production-verification.json`.

## Recreate M01 locally without disturbing current work

```powershell
git fetch origin --tags
git worktree add ..\PPCP-M01 m01-google-integration-v0.1.0
cd ..\PPCP-M01
node scripts/setup.mjs
```

Install Node 22.x. Edit that checkout's ignored `.env.local`; credentials are not in Git. Use the M01 test Sheet/folder from `milestones.json`, or recreate them from `fixtures/m01/schema.json` on main. To export copy/paste TSV headers and tiny images from main, run `npm run fixtures:export`. Use plain ID columns; maintain an active domain in Calculations!C2. Authorize a Google test account with Editor access to both resources, as described in the baseline README. Then:

```powershell
node --test
node scripts/authorize.mjs
node server.mjs
```

On the **main/tooling checkout**, run the new harness against that local server:

```powershell
npm ci
node scripts/smoke.mjs --target http://localhost:3000
node scripts/smoke.mjs --target http://localhost:3000 --write
```

Supply the baseline server's key via TEST_LOCAL_ACCESS_KEY in the tooling checkout's `.env.test.local`, or use that checkout's local TEST_ACCESS_KEY. The remote TEST_TARGET_ACCESS_KEY is never sent to a local server. Default port 3000 must be free; if changing it, update PORT and APP_ORIGIN together and use that exact origin. Do not run two copies on the same port.

## Recreate a deployment

Import the milestone branch into Vercel: Other framework, repository root, Node 22.x, build `npm run check:deploy`, output `public`. Populate the server-only variables listed in the README. APP_ORIGIN must match the deployment's stable origin without a trailing slash. Configure test automation separately; it needs the deployed access key, not Google OAuth credentials. An external OAuth app in Testing may need fresh consent after seven days; replace the deployed refresh token and redeploy the same frozen source. Do not put secret values in this registry or reports.

The existing Sheet and Media folder are dedicated to M01. New incompatible schemas get new test resources. They are not immutable backups: export a backup before manual cleanup. Google resource deletion, revoked permissions, expired tokens, and Vercel retention can require reconstruction even though source is preserved.

## Adding a milestone

1. Pass the catalog's required offline, live API, browser, and manual cases. Record failures and unverified cases honestly.
2. Record the exact commit, schema/fixture versions, runtime/dependency lockfile, deployment URL and resource IDs in `milestones.json` and this table. Keep secret **names** and renewal steps, not values.
3. Create a new annotated app tag and milestone branch. Never rewrite old refs. Provision its own stable deployment and schema-specific test resources.
4. Add test IDs without recycling previous IDs; document changed assertions or interface versions in TEST_CATALOG.md. Tag the compatible harness.
5. Append dated results to TEST_RUN_LOG.md and retain sanitized run manifests. GitHub artifacts expire after 90 days; archive important reports to your own storage before expiry.
# M03 — preserved editing and reliability; Sheets capacity limited

A: `m03-a-submission-baseline-v0.1.0`, branch `milestone/m03-a-submission-baseline`, source `748ff21`, [stable baseline](https://ppcp-m03-a-test.vercel.app).

B: `m03-b-editing-v0.1.0`, branch `milestone/m03-b-editing`, source `04fab82`, [stable editing test](https://ppcp-m03-b-test.vercel.app).

Both saved Production branch pins and deployed source were verified. M01 and M02 remain unchanged. The owner narrowed B after A exposed Sheets quotas: reliability and one/five-user comparison completed; B's larger matrix deferred. These are preserved functional checkpoints, not a classroom capacity certification. Final harness/docs tag: `m03-reliability-tools-v0.1.0`. See M03_RESULTS.md, M03_SETUP.md and DB_OPTIONS.md.
