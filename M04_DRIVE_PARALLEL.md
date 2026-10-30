# M04 bounded Drive processing — October 30, 2026 IST

## Implementation and isolation

Existing M04 resources and diagnostics branch only. Production rollback remains source `bf54d8c05897ba831f6affa1cdc3603b7ff9bc3f`, deployment `dpl_3SjEVbv6XDh3vLrH16xFLig6J9be`. Do not promote until Preview acceptance and a new agreed Production quiet session. October 29's quiet window does not authorize October 30 Production load.

Ordered workers process three files per request during upload preparation and publication, including retained-file verification. A module-shared FIFO limiter permits six M04 Drive operations in this process across all Drive objects/requests. Each file's steps remain sequential. Failure stops scheduling files and drains all started work before rejecting; Firestore commit occurs only after successful publication. Existing validation, upload ownership, operation receipts/reconciliation, lock/version checks and shared OAuth refresh remain. No legacy runtime modules, API schema, browser transfer concurrency, file limits or backing resources change.

`drive-prepare-wall` and `drive-publish-wall` are elapsed phase timings. Per-file metadata/sharing/publish spans are overlapping work totals under concurrency; do not sum them as critical-path latency. `drive-queue` records cumulative permit wait. `driveActivePeak` is the maximum instance-active count observed by the request, not a global Google-account limit. Slots release in `finally`, including transport failures and timeouts. Existing request retry behavior remains.

## Tests and quota authorization

Offline: 36 passed, one emulator-dependent skip, zero failed. Full Auth/Firestore emulator/API/browser rehearsal: successful, 37 test cases and zero browser errors. New tests exercise out-of-order completion, first/middle worker failure and draining, shared six-request limits across Drive objects, slot release after transport failure, unchanged saved content after publication failure, retained files and concurrent exact retry. Existing lock-race, closed-run and cleanup acceptance also passed.

Timestamped owner figures and fixed-baseline grants are in `test-evidence/m04/drive-parallel-budget-20261030.json`. Approved plan permits up to 8,000 additional reads and 3,000 additional combined writes/deletes at this snapshot, with prior ledger charges preserved. Original byte/rate ceilings remain. A whole-stage forecast precedes fixture creation; cleanup allowance is reserved. Preflight retains existing grants without extending freshness. Hosted testing requires snapshots under one hour old; no automatic test schedule or automatic grant replenishment.

## Hosted acceptance procedure

On protected Preview, run `scripts/m04-capacity-diagnostics.mjs` with `--write --preview-access --target=<M04 Preview origin> --users=1 --scenario=ten-files`. Keep the original ten 1,000,000-byte PDF files, serial direct transfers, browser observer, 10–20-second think times and create/edit/lock/remark/unlock workflow. Record complete acknowledgment and preparation/transfer/final-save separately. An anonymous browser checks the published Drive view after measurement; per-workload PP039 comparisons remain read-only.

Run three independent one-uploader trials (first run, then two matching-source `--repeat-of=<first report>` windows). Require integrity and every final create/edit at most 3 seconds. Report startup/list misses separately; do not discard them from overall capacity evidence. Stop on existing hard rules. If three workers miss only latency and no hard error occurs, change only `DRIVE_FILE_CONCURRENCY` to five, leave the six-request limit, deploy another Preview candidate and repeat three trials. If five also misses, stop attachment/higher-load escalation and report measured remaining bottlenecks; do not weaken targets or replace providers.

Only after boundary acceptance, establish new-source baselines and continue the approved 1/5/10/20/40/60/90/120 ladder per scenario (optional 160/200 gated). Ten-file uploaders use 1/5/20 separately. Budget forecasts may defer entire stages. Previous-source evidence does not certify this candidate. Every batch ends with explicit marked-run cleanup, zero-leftover verification and sanitized result publication. Release remains conditional on all required Preview checks and a scheduled quiet Production session.

## Hosted observations

Three-worker source `87788bf201f0fbf0295621dc931bbbb947eac599`, protected Preview deployment `dpl_3GA8xP5u2yn6bg1dmnohMgDs8k7a`, completed three independent boundary workflows. Create times: 6,298 / 6,337 / 6,450 ms. Retained-file edit times: 2,380 / 2,325 / 2,311 ms. All HTTP requests/integrity checks passed, anonymous Drive viewing passed once per trial, and PP039 comparisons passed. No quota/server errors or ten-second hard failures occurred. These are latency misses, not capacity acceptance.

First-trial elapsed preparation was 6,648 ms, including `drive-prepare-wall` 5,419 ms. Publication elapsed `drive-publish-wall` was 5,610 ms while cumulative per-file publication work was 14,541 ms; retained-file publication elapsed was 1,721 ms versus 4,693 ms of cumulative work. Peak active Drive operations observed was three. The external request counts were unchanged (21 preparation including ten expected pre-upload 404 probes, 20 create, ten retained-file edit). No overlapping spans are added to infer elapsed time.

The approved second candidate changes only the runtime per-request file pool from three to five, retaining six instance-wide Drive permits. It is pending three identical hosted trials. Production remains unchanged. No higher-load escalation is allowed unless the boundary gate passes.
