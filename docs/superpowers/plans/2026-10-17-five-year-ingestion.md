# Five-year ingestion implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, test-first; request one fresh final review. Do not read secret files.

**Goal:** Combine official local 2022/2023 CSVs with Function-only 2024/2025/2026 API collection and serve validated five-year chart summaries.

**Architecture:** A streaming, secret-free Node preparation command reduces the local CSVs into private per-district accumulators. A protected Pages Function imports these aggregates, retrieves one API page per step, checkpoints aggregate-only state with R2 conditional writes, verifies each source year's count and publishes a completed per-district snapshot. A CLI drives/resumes the steps; browser GET requests never drive collection. Keys exist only in Function runtime bindings.

**Stack:** Existing native ESM, Node tests, Wrangler Pages Functions, private R2; no new dependencies.

**Spec:** User's five-year change and previously agreed deposit indicators/filtering. Analysis contract dates start 2022-01-01; end is previous KST day capped at 2026-12-31. Same month/day comparisons across 2022–2026, with all-contract-month time series separately identified. The local filenames describe exports, not guaranteed receipt years. Verified source ownership: 2022 file owns 2022 contracts, 2023 file excludes its 2022 contract range, and API receipt years 2024–2026 add disjoint later receipts. No natural-key deduplication is attempted.

## Constraints and rulings

- Do not read, change, print or copy .env. Wrangler alone may load it at local runtime. No keys in static build, response, exceptions, logs or CLI arguments.
- Raw data/ and private generated aggregates never enter public/ or dist/. Retain raw files unchanged and ignore them in Git.
- Runtime source calls are authorized; tests use synthetic secrets and source fixtures. Do not launch an unbounded multi-thousand-call collection automatically.
- Local admin access is enabled only by an explicit local-runtime binding and requires a loopback URL plus same-origin/no-Origin JSON request. Production requires the existing separate ADMIN_TOKEN; no administrator token is required to view summaries.
- Publish atomically per district after both archive receipt years and all three API receipt years complete. This allows useful per-district progress; never claim all Seoul is complete based on one district.
- CSV preprocessing is recomputed for the run's comparison cutoff and stores provenance, source fingerprints and rejected counts. A stale cutoff or missing archive year prevents mixed publication.
- R2 checkpoints are CAS-updated. The same page cannot be merged twice on retries/races. A count drift aborts a run; previous completed snapshots remain accessible.
- Snapshot schema v2 rejects old three-year snapshots rather than mislabelling them five-year results.

## Tasks

1. Tests first: source response types/counts/projection, bounded pagination, transient retry versus fatal errors, INFO-200, no secret disclosure; streaming CP949/UTF8 CSV and header mapping; five-year accumulators, monthly output and cutoff handling.
2. Implement analysis accumulator/merger/finalizer and secret-free CSV preparation into .generated/archives/*.json.
3. Tests first: real sync state machine with in-memory CAS R2, all three API years, archive validation, resume, concurrent-step conflict, count drift, no partial publication, safe routes.
4. Implement administrator authorization, sync route and driver; validate import/query/request sizes; cap outbound calls per step and sanitize all errors.
5. Update summary/meta schema, five-year frontend plus annual chart, protected data paths, scripts and docs. Test keyless builds/Functions; prepare real archives; verify via local runtime and final review.

## Review focus

- API may return successful HTTP with authentication, quota, malformed or no-data payloads.
- Pagination totals/short pages and receipt years must match, including the last-page boundary.
- CSV quoting, chunk boundaries, BOM, encoding differences and exact receipt year matter.
- Large-area averages, small samples, invalid dates and source-boundary late contracts must preserve separate denominators and additive counts.
- Crashes and repeated admin requests cannot expose partial/mismatched five-year data or duplicate aggregates.

## Ledger

- Existing secrets untouched. Source CSV sizes: 91,847,201 and 101,238,757 bytes; encodings CP949 and UTF-8 BOM. Raw row counts 560,665 and 545,813. Header metadata only was displayed.
- This is an already authorized extension; proceed without a new design approval pause. No Git initialization, upload, resource provisioning or deployment.
- Completed all five tasks. Archive streaming preparation processed 1,106,478 raw rows without modifying the originals; the 2023 file has 15,831 overlapping 2022 contracts excluded by source ownership. The 2022 file has receipt years 2021/2022/2023, so the initial receipt-year assumption was corrected before ingestion.
- Regression verification: 32 tests pass, static build publishes six allowlisted assets, Functions compile keylessly. Source validation, transient/fatal errors, CSV boundaries, CAS page conflicts, publication restart fencing and completed-district reuse are tested.
- Actual local verification: Wrangler alone loaded the existing .env; source-check returned eight required fields present. Cloudflare rejects redirect:error (confirmed with a separate credential-free public sample Worker probe); redirect:manual plus 3xx rejection now preserves no-follow behavior.
- Jongno (11110) completed API collection: 39,260 API rows / 45 page+verification calls, joined with 13,962 raw archive rows (234 overlap exclusions). Public summary returns HTTP 200 with all five contract years, 613 annual groups and 3,710 monthly groups. Re-running sync reuses this completed run. Other districts were not automatically collected.
- UI verified in Chrome: five real annual chart bars and 613 table rows. Invalid query returns 400; .env, data and .generated URLs return 404. No key or raw upstream error was printed.
- Fresh reviewer confirmed both Important findings fixed and no remaining Critical/Important in reviewed scope. Deployment and all-district collection remain unperformed; the CLI supports both a chosen district and all districts.
