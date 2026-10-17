# Seoul-wide and two-region comparison plan

> **For agentic workers:** Execute inline with test-first behavior changes and one independent final review. No credential reads, source collection, Git or deployment.

**Goal:** Add 서울 전체 to the district selector and compare two independently selected gu/legal-dong scopes using a shared housing type and identical period.

**Architecture:** Extend the summary Function with `gu=all&dong=all`, aggregating private additive data across all 25 completed same-cutoff snapshots. Browser requests one or two existing same-origin summary routes, deduplicates identical queries and refuses mismatched periods. Preserve the all-gu Plotly comparison; monthly and annual charts compare A/B and optional housing types.

**Decisions:** 서울 전체 is the initial selection and disables dong. A two-region checkbox reveals independent B gu/dong selectors (default 강남구, or 종로구 if A is 강남구). Each region can be 서울 전체, a whole gu or one legal dong, including two dongs in the same gu. Housing and cutoff are shared. Identical scopes are allowed with an explicit notice. Overlapping scopes retain separate counts; never add A/B counts or claim independence. All results and graphs clear while requests load; one failed scope or different periods blocks pair comparison honestly. Existing thresholds (<10 suppress; <30 reference) and null monthly gaps remain.

## Tasks

- [x] 1. Test city request validation, exact weighted aggregation including small component groups, same-period annual totals, missing/mismatched gu fail-closed and compact projection. Implement server city reader reusing existing validated snapshot and rollup functions.
- [x] 2. Test paired same-origin requests, deduplication/failures/cutoff mismatch, paired chart traces/counts/gaps and mean differences. Add region model and refactor frontend filters/cards/annual table/monthly Plotly integration.
- [x] 3. Full tests/build/keyless compile; live Seoul total versus existing all25 count; browser all-city/dong disabling, same-gu and different-gu comparisons, housing/type traces, empty/error/stale states and mobile. Independent review, docs and evidence.

## Constraints and review focus

Never read .env/.dev.vars, output keys or use Seoul API from the UI. No source API collection or R2 mutations. Read all25 with at most3 gu concurrently; never average gu means or treat a missing gu as 0. City output stays compact, without dong-level source groups or private sums. Two scopes may overlap or be identical: no combined total, causal story or unsupported ranking. Dynamic strings use textContent/validated fixed choices. Keep strict CSP and pinned local Plotly.

## Progress

Planning complete. Ruling: existing architecture and explicit user scope are sufficient to execute without a new approval round. No Git repository/worktree operations are needed; changes stay in the named Assignment02 workspace.

Task 1 complete: city contract and aggregation tests pass; actual city summary HTTP200, 1,594,642 trades, mean 40,329.03128664615만원, matching existing all25 trade count. Period 2022-01-01 through 2026-10-16. Monthly public rows290, no private sums. A first live check during watcher rebuild returned503; diagnostic stage check and exact original-code restoration both returned200. No production arithmetic fix or diagnostic endpoint retained; this was a transient multi-file development reload.

Task 2 complete: independent A/B selectors, same-region dedup, date mismatch rejection, separate cards/counts/difference/annual table and three Plotly charts. Shared housing and four-type view work with8 region/type curves, distinct labels/solid-dashed lines. Annual table keeps5 aligned years, nulls and units. Same/overlapping scopes never add counts. City disables dong. Empty average hides its numeric unit.

Task 3 evidence: tests53 pass; build15 assets; keyless Functions compile. Chrome actual scope examples: 청운동 49,745만원/138건 versus 역삼동52,252.5만원/16,268건; same-gu 청운동138 versus 가회동36. City/강남 count1,594,642 versus103,894. 390px mobile has no horizontal page overflow; resized Plotly SVG parent was initially height0 (responsive100% child of auto-height parent), fixed with explicit layout height on the chart parent; mobile8-legend layout reserves header space. Independent review found no blockers and one default-B plan drift, corrected so first B defaults종로 when A=강남. Synthetic isolated fixture verifies B503/error/retry/period mismatch hide stale results, emptyB0 preservesA, delayedB abort on comparison-off. No credential reads, source collection, R2 writes, commits or deployment.
