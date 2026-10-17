# Plotly analysis implementation plan

> **For agentic workers:** Execute inline using executing-plans, test-driven behavior changes, and one fresh final review. Do not read credential files, collect sources, commit or deploy.

**Goal:** Add two Plotly charts for monthly mean deposit and all-25-district mean comparison, with housing comparison, explicit periods/definitions/counts and quantitative observations without causal claims.

**Architecture:** Continue same-origin Pages Functions. Extend compact district summaries with exact monthly sum/count rollups, and add a validated comparison Function reading private completed snapshots for all districts. All districts must have the same cutoff; missing/invalid partitions fail honestly. No new Seoul API collection. Serve pinned Plotly locally and preserve same-origin script/connect policy.

**Tech stack:** Existing native ESM frontend/Node tests/Pages Functions/R2; official pinned Plotly basic browser bundle.

## Decisions and constraints

- Monthly scope follows district/dong/housing; district comparison always uses all dongs of all 25 districts and the selected housing. State that dong filter does not apply to this chart.
- Add a housing-comparison checkbox: show four housing traces instead of one selected aggregate. All-type totals are separate from four type totals and must never be added twice.
- Full-period monthly overview is 2022-01-01 to snapshot cutoff; do not confuse it with existing annual same-period chart. Fill missing months with zero count/null mean and never connect gaps. Label partial final month and exclude it from monthly observations.
- Each chart has a visible period, arithmetic mean definition (만원), total included transaction count (건), per-point count/units in hover, accessible expandable summary table and fixed explanations for suppression (<10) and reference-only samples (<30).
- Observations derive from current plotted summaries: complete months and districts with >=30 trades only. Report exact dates/regions, means/counts and ranges/differences; interpretations describe possible sample composition differences without asserting a cause. No interest-rate, policy, supply-demand or causal explanations.
- The comparison endpoint returns only period, public district/type mean/count/reliability. Browser never receives private sums, raw rows, runtime keys or errors.
- Keep all existing filters/cards/year table and light/orange theme. Independent chart states survive empty local selections; abort stale loads and expose retry.
- No .env/.dev.vars reads, key output, environment-dependent build, upstream API calls, R2 writes, Git or deployment.

## Tasks

- [x] 1. Tests first: exact monthly means including suppressed components, missing-month gaps/partial cutoff, all25 comparison/type selection, unavailable/mismatched snapshots, safe query/error projection. Implement server rollups and comparison route.
- [x] 2. Tests first: Plotly trace values/counts/units, null gaps, type mode and observations excluding partial/small samples. Implement chart model/rendering and integrate two sections with local Plotly asset/build allowlist and summary-only client requests.
- [x] 3. Verify full tests/build/Function compile, actual local all25 summaries, desktop/mobile Plotly/type comparison, loading/empty/error paths and independent review. Update public response docs and record evidence.

## Review focus

Missing gu must not become zero; different cutoff must not compare; absent/small months must not become zero prices; partial months must not drive trend commentary; type comparison must not double-count totals or average means.

## Progress

Planning complete. Existing local runtime :8789 and completed 25 snapshots will be reused. Ruling: user's detailed request and existing architecture provide enough design context to proceed without another approval round.

Task 1 complete: exact rollups, 58-month grid with null gaps/partial month, 25-gu comparison and unavailable/mismatched partition cases pass. Live comparison HTTP200, 125 public rows, same cutoff 2026-10-16, 1,594,642 total trades. No upstream collection or storage mutation.

Task 2 complete: Plotly Basic 4.1.2 pinned locally, 13 allowlisted build assets including derived stylesheet and license. Native Plotly no-inline-styles link plus external stylesheet preserves strict script/style/connect CSP; no CDN, browser eval or relaxed inline permission. Monthly figure/observation and gu/type count tests pass. Small/absent mean remains null. Initial and type-comparison views match exact transaction totals.

Task 3 verification: full suite 46/46; static build 13 assets; Functions compile keyless. Chrome actual data: both Plotly SVGs render, four housing legends appear, type selection updates scopes/counts, expandable tables keep units, 390px layout has no horizontal overflow. Synthetic isolated server: gu error/retry independent of monthly chart, monthly empty/error/retry/not-ready, aria-busy/loading and hiding stale plot, aborted delayed response do not overwrite newer selection. Tooltip template values/counts/units are unit-tested; browser automation exposes no hover method, so native pointer hover was not asserted. Independent read-only review found no blockers and requested response-doc updates, now included.

Observed example, 종로구 전체 유형: 2022-01 33,528.1만원/331건 versus 2026-09 42,161.8만원/93건 (+25.8%). Across all25, 서초구 70,975.7만원/84,305건 and 강북구 22,566.2만원/27,309건. UI observations are recalculated from the selected summaries and do not generalize endpoint differences into continuous trends or causes.
