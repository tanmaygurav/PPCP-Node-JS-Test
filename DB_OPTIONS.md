# Database replacement evaluation — 2026-10-25

Recommendation: pilot **Firestore Standard on Spark, with the existing Firebase Authentication and private Google Drive attachments**. Compare Neon Postgres if SQL reporting and portability matter more than keeping one Google project. This is a recommendation for the next test, not a production capacity guarantee. No replacement database or paid storage has been provisioned.

M03 demonstrated a Sheets quota bottleneck. Five-user submission-only bursts passed; higher baseline bursts and even the five-user editing flow encountered quota errors. Real Drive transfer/boundary tests passed. A failed attachment route can reflect its preceding Sheets profile/ownership lookup, so replacing Drive at the same time would obscure the cause. See [M03_RESULTS.md](M03_RESULTS.md).

## Shortlist

| Option | Published no-cost allowance checked today | Fit and trade-off |
|---|---|---|
| Firestore Standard / Spark | 1 GiB stored; 50,000 document reads, 20,000 writes and 20,000 deletes per day; 10 GiB monthly outbound transfer | Most direct fit with current Firebase identity. Indexed owner queries and atomic transactions replace full Sheet scans and external save locks. Document-read budgeting matters. |
| Neon Postgres Free | 1 GB database storage and 100 CU-hours monthly per project; free compute scales to zero after inactivity | SQL constraints, joins and transactions suit profiles, submissions and remarks. Requires a separate provider and serverless-compatible connections. Benchmark wake-up latency and compute usage. |
| Supabase Free | 500 MB database, 1 GB file storage, 5 GB ordinary egress plus a separate cached-egress allowance; two active projects | Integrated Postgres/storage is convenient, but free projects pause after a week of inactivity. That is a poor default for seasonal classes unless someone manages resumption. |
| AWS DynamoDB | Published Standard free allowances include 25 GB and 25 provisioned read/write capacity units | Conditional writes are suitable, but access-pattern design, item-size capacity and account/region billing need more care. Existing AWS ownership may help later; it is not automatically a zero-cost deployment. |

Sources: [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Neon pricing](https://neon.com/pricing), [Supabase pricing](https://supabase.com/pricing), [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/). Provider allowances can change; recheck before provisioning.

## Why Firestore is the first pilot candidate

This is an architectural inference from the current app and M03 findings. Keep the React interface and Node API, and replace the storage adapter. Store profiles/roles, active domains, submissions, remarks, operation receipts and cleanup jobs in Firestore. Registration still defaults to student; the API still verifies the organizational address, session and ownership.

Save the current record, operation receipt and pending file-cleanup metadata in one transaction. Do not upload, send email or trash Drive files inside a transaction callback: it can run again. After commit, process the cleanup job with ownership checks. This can remove the special Redis reservation layer. Firestore documents atomic writes and transaction retry behavior in its [transaction guide](https://firebase.google.com/docs/firestore/manage-data/transactions).

Free quotas are not a workload estimate. Reading a page of 20 documents uses roughly 20 document reads, rather than one read simply because it is one API request. For an illustrative 60-student class with ten such page loads each, browsing alone is about 12,000 document reads; profile/detail checks, transaction retries, remarks and backups add more. This is a planning model, not a measured result. Use indexed, paginated queries and measure the actual usage before promising Spark will cover all classes. See [Firestore pricing](https://firebase.google.com/docs/firestore/pricing).

Spark does not include managed backup/PITR/TTL operations. Plan an explicit export/restore procedure instead of assuming production recovery is free. Keep production in a separate organization-owned project; the current personal project remains a test environment.

## File storage decision

Keep private Drive attachments for the next pilot. This retains the existing Workspace capacity and the tested upload/download behavior. Retest storage with the new database supplying permissions and metadata, so Sheets is no longer in the path.

Firebase Authentication, Firestore and Firebase file storage are separate products. **Cloud Storage for Firebase currently requires Blaze**, even where some usage is free. It does not satisfy the present no-paid-upgrade constraint. See [Firebase's storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

S3 remains a suitable later candidate for private attachments using short-lived authorized upload/download URLs. Charges depend on region, stored volume, requests and transfer; the organization's existing account does not establish free eligibility. Obtain its region and applicable allowances before giving a monthly estimate. At 500 submissions per year, one 1 MB attachment per submission adds about 0.5 GB/year; the current maximum 20 MB per submission permits 10 GB/year. These are illustrative growth bounds, not measured averages. See [S3 pricing](https://aws.amazon.com/s3/pricing/).

## Proposed next milestone

1. Create a separate Firestore pilot with billing upgrades disabled; preserve the M03 source, resources and URLs.
2. Replace every synchronous Sheets dependency, including profiles/roles, domains and download authorization. Keep an optional Sheet export for reporting.
3. Port the passing editing, conflicts, operation retry, ownership, file-boundary and cleanup tests. Keep current-content-only editing.
4. Run independently preserved 1,200/3,000-record fixtures through 5/10/20 users, then the guarded 60-user burst and ten-minute classroom scenario.
5. Measure Firestore document operations, quota/headroom and transfer separately. Select latency targets after reviewing those results.
6. Change file storage only if the isolated Drive tests or organization requirements justify it.

No existing accounts/data are migrated in this evaluation. The pilot must pass before a production migration is designed.
