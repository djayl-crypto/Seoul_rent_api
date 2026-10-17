# Precomputed KV Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production Error 1102 by serving bounded, prepared summaries instead of aggregating 28.6 MB during each request.

**Architecture:** Generate versioned, public-field-only regional bundles and one district comparison bundle offline from the existing completed snapshots. A production Function reads one small KV object, validates and projects it, and returns the existing dashboard response. Pin the version in deployment configuration; upload immutable objects before deploying the reader. Keep local R2 collection and legacy local analysis unchanged.

**Tech Stack:** Existing JavaScript, Node test runner, Cloudflare Pages Functions and free Workers KV; no new dependencies.

**Spec:** The user approved the preceding diagnosis and proposed precomputed KV remedy with “응 개선해”. Preserve the UI, data window, weighted/private-sum calculation, suppression rules and server-only credentials. All 25 districts and all available dongs/types remain selectable.

## Global Constraints

- Never read or print `.env`, credentials, auth output, arbitrary provider errors or raw tail events.
- No R2 activation, paid subscription or new billing commitment.
- Dashboard summary objects <=128 KiB; comparisons <=64 KiB; no production fallback to full snapshots.
- Use the existing approved private production KV destination. Only completed aggregate results are uploaded.
- Existing dashboard responses remain equivalent. Production prepared mode accepts `view=dashboard`; the legacy detailed `view=all` remains available only with the local R2/legacy configuration and is rejected with a safe 400 in prepared mode.
- Queries and stored data must be validated; project only documented public fields, preserve sample suppression, and fail closed for missing/malformed/version-mismatched bundles.

## Review Focus

- All five housing selections, both regions and dong selection retain exact statistics and dates.
- A missing prepared object must never initiate expensive full-snapshot reads or source API calls.
- Unknown fields, invalid sums/metrics, and malformed storage never reach responses or logs.
- Invalid dong codes differ from an incomplete valid-region dataset without unbounded reads.
- Immutable version pinning prevents a partially uploaded replacement from affecting the current deployment.

### Task 1: Bounded prepared readers

**Files:** Create `src/server/prepared.js`, `tests/prepared.test.mjs`; modify both public summary/comparison handlers.

**Interfaces:** `readPreparedSummary(env, query)` and `readPreparedComparison(env, type)` consume `RENT_SNAPSHOTS` plus `RENT_QUERY_VERSION`; output the existing dashboard shapes. Export bundle constructors for the offline producer. Existing local R2 readers remain the calculation reference.

- [x] Write fixture-backed parity, single-read/byte-bound, malformed/private-field, suppression, missing-data, invalid-dong and query tests; run and observe failures.
- [x] Implement explicit bounded validation/projection and route configured KV requests to it; run targeted and full tests.

### Task 2: Offline production data preparation

**Files:** Create `scripts/prepare-queries.mjs`, `tests/prepare-queries.test.mjs`; minimally extract the existing snapshot-to-summary helper in `src/server/summary.js`.

**Interfaces:** `prepareQueries({env, version, write})` reads and validates the existing completed snapshots, emits 429 regional bundles plus a comparison bundle, and verifies period consistency and per-object limits. CLI uses a fixed ignored input directory and writes an ignored bulk file/manifest. `write` is awaited and receives only a validated key/value.

- [x] Test expected metrics and exact selected responses, bad periods and safe emitted payloads before implementing.
- [x] Generate real bundles offline; verify all 2,145 region/type selections against the previous calculation and measure object count/size; no source API calls.

### Task 3: Publish and verify

**Files:** Modify `wrangler.jsonc`, `README.md`, `docs/SNAPSHOT.md` and this execution record.

- [x] Configure the immutable non-secret dataset version for Production/Preview and document the new read path, preparation, limits and local detailed mode.
- [x] Complete test suite, build, Functions compilation, upload audit and independent whole-change review; fix material findings with regression tests.
- [x] Upload all validated query bundles into the approved production KV, then deploy the reviewed code using existing auth without reading `.env`; retain old keys for rollback.
- [x] Verify repeated production city/comparison requests and dong/type selections, then commit/push the reviewed change and record measured results.

## Execution record

- Baseline: 70 tests passed; working tree clean at `58bab02`. Reproduced production 503/Error 1102 on city/comparison; geometry remained HTTP 200.
- Work in the requested `Assignment02` directory on `fix/precomputed-kv-queries`; preserve local data and authenticated host tooling in place.
- Pre-flight: Task 2 creates exactly the bundle schema consumed by Task 1; exported constructors plus round-trip tests enforce that interface. Task 3 pins the same version passed to Task 2 and deploys only after upload.
- Tasks 1 and 2 complete: 12 new tests passed after RED/GREEN; full suite 82 passed. Static build: 29 assets. Keyless Functions compiled.
- Real dataset: 429 regional bundles, 430 objects total, 2,145 verified selections, 35,775,705 bytes, max region 91,311 bytes, comparison 37,094 bytes, transaction count 1,594,642. Repeated generation produced the same SHA-256.
- Whole-change reviewer: no unresolved findings. Fixed malformed nested values returning 500 instead of safe 503, and derived yearly changes only after both years meet the 30-transaction minimum; regression tests observed RED then GREEN.
- Production KV upload: 430 validated query objects successfully written into the existing approved namespace. Old keys preserved; no R2 subscription, paid plan or source recollection.
- Production deployment: `2654f350`, code commit `8bbc1e7`, immutable version `prepared-20261016-v1`. All 455 production checks passed: 429 regional dashboards, 5 comparison selections, 20 repeated city/comparison queries, one expected invalid-query 400. Zero resource-limit errors.
- Measured milliseconds: regional median 352, p95 594, max 12,204; repeated city median 36/max45; repeated comparison median30/max83. These include KV/network wait at one test location and are not CPU-budget guarantees.
- Browser verified: initial city map/Plotly charts, district and dong/type selection, two-region comparison and correct suppression for 청운동 apartments (8 transactions). Restored the default city view.
