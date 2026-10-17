# Seoul_rent_api Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Track progress below.

**Goal:** Configure a secure Cloudflare Pages static frontend and Pages Functions in Assignment02, usable without an API key.

**Architecture:** Only public/ is a static asset directory. Functions use runtime bindings; Wrangler alone loads the existing local .env. A private R2 binding supplies completed summary snapshots; missing snapshots return a safe not-ready response. An authenticated source check exercises the server-only Seoul adapter without exposing rows, URLs, or secrets.

**Tech Stack:** Node.js 22+, native ESM, node:test, HTML/CSS/browser JavaScript, Wrangler 4, Pages Functions, optional private R2.

**Spec:** The agreed design in this conversation: receipt years 2024–2026, contract dates 2024-01-01 through the previous KST day (capped at 2026-12-31), jeonse only, mean deposit and transaction-mean deposit per square metre, same-period comparisons, server-only API credentials.

## Global Constraints

- Never read, print, rewrite, copy, or inspect the existing .env during agent work.
- No Git initialization, staging, commit, push, Cloudflare account changes, deployment, or bulk API calls.
- Build and verification must never load .env. Only local runtime may load it.
- No frontend environment substitution; an explicit allowlist controls published static files.
- Production credentials must be provisioned separately as encrypted runtime Secrets, never copied from .env into configuration.
- This step supplies project foundations, not the 75-partition bulk ingestion/reduction workflow. Describe the remaining workflow honestly.

## Review Focus

- Missing API key must leave the UI and metadata endpoint usable.
- Upstream exceptions, malicious response strings and unknown routes must not disclose secrets.
- Neither static serving nor build output may include project-root files or Functions source.
- Invalid dates, deposits, area values and small samples must not produce misleading averages.
- An absent/incomplete snapshot must never appear as completed real data.

### Task 1: Security and analysis boundary

Files: tests/server.test.mjs, tests/analysis.test.mjs, src/server/{http,seoul,summary}.js, src/analysis.js, functions/{_middleware,api/meta,api/summary,api/admin/source-check}.js.

- [x] Write tests for missing-key operation, sanitized failures, authenticated source checks, query validation, allowlisted snapshot projection, calendar boundaries and aggregation denominators.
- [x] Run node --test and verify the expected failures before implementation.
- [x] Implement server-only source adapter, safe response boundary, summary projection and analysis utilities.
- [x] Run the complete Node test suite.

Interfaces: fetchSeoulPage(env, options, fetchImpl) returns validated records and count; aggregate(records, period) returns groups plus exclusions; GET /api/meta returns public configuration; GET /api/summary returns only completed allowlisted summaries; POST /api/admin/source-check returns field presence only.

### Task 2: Static app and safe development/build

Files: public/{index.html,app.js,styles.css,_headers,_routes.json}, scripts/{build,dev}.mjs, package.json, package-lock.json, wrangler.jsonc, .gitignore, .env.example, README.md.

- [x] Write build/development tests using a synthetic sentinel, without reading real local secrets.
- [x] Observe expected failures, then implement an allowlisted static build and quiet Wrangler launcher.
- [x] Add keyless responsive UI, config, empty env example and Korean setup documentation.
- [x] Install locked tooling locally, run tests, build static assets, compile Functions, then smoke-test static and Function routes with dotenv loading disabled.
- [x] Verify root sensitive paths cannot be served; review the project without reading .env.

## Execution ledger

- Initial inspection: Assignment02 contains only .env; no Git repository. Work directly in the explicitly authorized Assignment02 directory. No worktree or commit is applicable.
- Scope ruling: project setup includes a functional empty-state UI and server/API boundaries. Bulk collection, R2 provisioning, complete snapshot publication and deployment remain future work; no source data is fabricated.
- Secrets ruling: test and smoke environments disable dotenv discovery and use synthetic credentials only. Development launcher suppresses child diagnostics rather than risking output of secret-bearing bindings or exception URLs.
- Verification: 19 Node tests pass; static build publishes 6 allowlisted files; Pages Functions compile keylessly. Nine HTTP smoke routes pass, including metadata 200, summary 503, sensitive paths 404 and disabled administrator endpoint 503. Chrome confirms the keyless UI and 25-district selection.
- Review: fresh security reviewer found inconsistent summary periods; a failing regression test was added and validation now rejects annual/monthly period mismatches. Official HTTP transport remains a documented pre-deployment limitation; public sample probes did not establish an HTTPS endpoint. No actual credential was used.
- Runtime ruling: Wrangler 4.140.0's bundled workerd supports compatibility dates through 2026-09-30. Pin that supported date rather than the task date; keyless local startup now succeeds.
