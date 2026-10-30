# M04 ten-file Drive comparison

Generated 2026-10-30T03:42:26.752Z. Each row is one independent uploader workflow, not a population p95. The earlier sequential baseline was measured on a different day.

Earlier sequential observed create/edit: **15.50s / 5.25s**.

| File workers | Trial | Prepare API | Transfer total | Final create | Retained edit | Create acknowledgment | Publish wall | Active Drive peak |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 1 | 6.65s | 16.76s | 6.30s | 2.38s | 29.84s | 5.61s | 3 |
| 3 | 2 | 6.25s | 16.49s | 6.34s | 2.33s | 29.20s | 5.60s | 3 |
| 3 | 3 | 6.03s | 15.16s | 6.45s | 2.31s | 27.77s | 5.78s | 3 |
| 5 | 1 | 3.80s | 15.39s | 3.93s | 1.71s | 23.22s | 3.15s | 5 |
| 5 | 2 | 3.89s | 15.43s | 4.49s | 1.56s | 23.99s | 3.67s | 5 |
| 5 | 3 | 3.90s | 15.99s | 3.52s | 2.01s | 23.58s | 2.82s | 5 |

Three-trial five-worker final-save gate: **failed** (every create/edit must be ≤3 seconds, with successful integrity/anonymous checks).

Each trial retained ten 1,000,000-byte files, serial direct transfers, the browser observer and create/edit/lock/remark/unlock workflow. Instance-wide permits stayed at six. Prepare and acknowledgment include multiple phases; they must not be added again to their component timings. Per-file metadata/sharing/publication work overlaps; use publication wall time for elapsed phase comparison.

UTC/IST timestamps, full source hashes, API counts and per-file work totals are in the companion JSON. Production and higher-load acceptance remain separate.
