# Seoul district choropleth plan

> **For agentic workers:** Execute inline with test-first data/security behavior, browser checks and an independent final review. Never read .env/.dev.vars or display credential values.

**Goal:** Add an interactive OSM-based district choropleth like the supplied reference, with yellow–orange–red mean-deposit colors and existing housing filters/A/B context.

**Architecture:** Use locally served Leaflet, local public district geometry derived from the course's SGIS2025Q2 shapefile, and the existing same-origin 25-gu summary Function. Geometry and analysis never depend on CARTO credentials. Keep raw property records and keys out of build output.

**Credential decision:** User chose “키를 공개하지 않고 OpenStreetMap 배경지도 사용”. CARTO_API_KEY is never read or used. Direct keyless HTTPS OSM image tiles use visible attribution, normal browser caching, no bulk/prefetch and an image-specific origin referrer. The existing document no-referrer policy stays in place. Seoul/admin secrets remain private. No CARTO proxy is implemented (its Basemap Terms9.c.iii prohibit that architecture).

## Design decisions

- Map colors use current selected housing type, full stored period, and the exact same 25-gu arithmetic means as the district chart. Add a map-only housing selector synchronized to the existing main housing selection; this remains explicit when four-type chart comparison is enabled because one map cannot use four different fill values simultaneously.
- Color scale interpolates yellow #ffffb2 → orange #fd8d3c → red #bd0026 over eligible25-gu min/max (linear, no quantile/rank implication). Show numeric min/mid/max만원 and grey for n<10/no data. Recompute the scale when type changes and state it. Equal values share midpoint color.
- Tooltip/popup show district, mean만원, count건, period and small-sample status. Permanent district labels, zoom/reset, visible CARTO/OSM attribution as applicable, exact scope text and summary table accessibility.
- A/B gu outlines are distinguished from fill colors. Dong selection only highlights its containing gu; map prices remain gu-wide and UI states that limitation. No invented dong geometry or interpolated prices.
- Basemap errors must leave valid gu geometry/summaries available and show a fixed retry message. Data/geometry errors hide old fills rather than claiming zeros. Missing key must not break other charts.
- Boundary source: existing lecture04_spatial_data_analysis/bnd_all_00_2025_2Q/bnd_sigungu_00_2025_2Q shapefile. Validate Seoul source codes, map gu names to the existing5-digit source API codes, reproject EPSG5179 WKT→EPSG4326, preserve polygons/holes and round coordinates. Ship only25 validated public features with source attribution/hash; do not modify source files. Build does not require original sibling input or read secrets.

## Tasks

- [x] 1. Reproducible geometry preparation and tests for25 unique official codes, valid Seoul coordinates/rings and source metadata. Tests for color endpoints/null/suppression/single-type joins/legend consistency.
- [x] 2. Implement map section/model/Leaflet rendering, update from existing cached district summaries/type and A/B selections, local asset allowlist/licenses/CSP. Implement chosen permitted tile connection only after user's answer, with safe config/error handling and no actual key output.
- [x] 3. Full tests/build/Functions compile, real summaries, desktop/mobile fills/popup/filter/selection/error states and independent review. Record evidence and docs; no Git/upload/deployment.

## Progress

Reference page visually checked in Chrome: Leaflet/CARTO/OSM with administrative fill layers. No source scripts, tile URLs or API keys inspected. Existing official SGIS boundary input found locally. Python geospatial modules absent, so prepare using pinned Node shapefile/proj4 tools; Leaflet1.9.4 verified against official docs/npm. User selected keyless OSM.

Task1 complete: map-model/boundary tests observed RED then GREEN. Derived25-feature geometry1182260bytes, preserves rings/holes and6decimal coordinates. No input source edits or secret access.
Task2 complete: Leaflet assets test observed RED(ENOENT) then GREEN; allowlist27assets, only OSM img-src exception. Public comparison cache shared with map. API/geometry failures remove old layers; tile failure keeps25boundaries and data. Numeric legend, full period, count, A/B, table, keyboard popup and synchronized housing selector implemented.
Task3 evidence so far:57/57 tests and build pass; keyless Functions compile passes. Real2022-01-01~2026-10-16 comparison125rows/25gu: all1594642trades, apartment851841. Map displayed25interactive polygons/25labels and successful OSM tiles with image referrer. Verified popupunits, matching exact min/mid/max, housing sync and A/B27total paths. Isolated keyless UI fixture verified n5suppressiongrey, n15reference, n0absence, invalid geometryhidden/retryrecovery, sanitized summaryfailurehidden, tilefailurespreserving25shapes and periodmismatchhidden. Mobile390px no horizontal overflow. Lower minZoom9 and quarter zoomSnap allow full city fitting on narrow screens. Final review/verification pending.

Final review completed by fresh read-only reviewer district_map_review. Important finding: cached global results could reappear after regional period mismatch; fixed with explicit pending/ready/mismatch/failed period state and shared local+comparison retry. Regression test observed RED (update instead of fail:not-ready) then GREEN across good→mismatched pair, filter/type toggle while pending/failed, incompatible single response and compatible recovery. Reviewer retry finding was treated as required behavior because a visible retry must fetch corrected summaries; invalid summary cache is now discarded while geometry-only retry can still reuse valid summaries. Its regression test observed RED (0reloads instead of1) then GREEN. No deferred code findings.
Final verification:59/59 tests pass,27public assets build, keyless Pages Functions compile. Browser confirmed mismatch remains hidden after type/filter changes and normal-period recovery works. At390px all25district paths fit inside the map after reset, with no horizontal overflow. Reviewer's declined live UI, source reproduction, secret inspection, production deployment and legacy audit are bounded: root performed actual local UI and source preparation; credentials are intentionally never inspected; no production deployment or unrelated legacy rewrite is authorized. No Git repository initialization, commits or upload.
