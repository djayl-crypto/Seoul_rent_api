# Orange dashboard implementation plan

> **For agentic workers:** Execute inline with test-driven changes to behavior and one final independent review. No credential file access, collection, Git changes or deployment.

**Goal:** A simple bright orange dashboard with district, legal dong and housing filters, mean jeonse deposit/count, explicit loading/empty/error states and visible units/periods.

**Architecture:** The browser calls only same-origin Pages `/api/meta` and `/api/summary`. Server validates dong/view parameters, derives the full unfiltered legal-dong list, and rolls up private additive aggregates for exact selected-period metrics and annual comparisons. A compact dashboard response excludes unused monthly/group payloads. Existing data/snapshots are reused without recollection.

**Decisions:** Main cards describe the full actual contract period (2022-01-01 through the stored cutoff). Annual chart/table keep same month/day comparisons across five years and label the distinction. Suppress each mean below 10 valid observations, retaining counts. Default dong/type are all. Changing district resets dong, and filters automatically load. Abort stale requests; failure never leaves previous totals visible as new results. A retry action works even when initial metadata loading fails.

## Tasks

1. Write failing tests for legal-dong request validation, unknown dong rejection, full-period sum/count rollup including small component groups, exact annual weighted values and compact projection; implement in server selection/summary.
2. Write failing tests for same-origin frontend request construction and safe API-error/not-ready handling. Implement minimal client helper; replace static HTML/JS/CSS and update the static allowlist.
3. Run the full test suite, build and Functions compile. Verify live data and filters in browser, plus mobile layout and explicit loading/empty/error/retry states using an isolated local test server with synthetic fixtures. Review with a fresh agent, correct material findings and record verification.

## Security and scope

- Never read .env/.dev.vars or keys. No upstream source call or R2 collection changes are needed for this task.
- No client access to Seoul API, secrets, server modules or build environment variables.
- UI errors use fixed messages; original response text/errors are discarded.
- Preserve existing snapshot/analysis method; only selected-filter rollups and UI behavior change.

## Verification completed

- `npm.cmd test`: 39/39 passing; `npm.cmd run build`: 7 allowlisted assets; `npm.cmd run check:functions`: keyless compile successful.
- Existing local completed R2: 종로구 full-period 16,951 trades, 38,345.3374만원; 청운동·연립다세대 76 trades, 57,051.7105만원. Browser rounded display matches the Function response. No source collection was run.
- Chrome: district/dong/type changes, district resets dong, 5-row comparison table, small-sample suppression, desktop and 390px responsive layout; page does not overflow horizontally.
- Isolated synthetic local server (no key): initial metadata failure/retry, empty result, summary failure/retry, DATA_NOT_READY, delayed loading/aria-busy, and stale delayed response after filter change all visibly verified. Original synthetic error text was not displayed. Fixture process stopped after use.
- Independent read-only review found no blocking issue. A malformed stored snapshot marked complete with annual groups but no monthly groups is an existing consistency limitation; production snapshots are generated together by the collector and current completed data was verified.
- Credential files were not read, changed or copied. No Git, upload or deployment action was performed.
