# PHASE-9 STAGE 9.4 — CLOSURE CHECKPOINT

**Date:** 2026-05-12  
**Status:** CLOSED — All 7 steps completed + full test suite GREEN

---

## Deliverables Summary

| Step | File | Type | Status |
|---|---|---|---|
| 1 | `code/src/runtime/tools/http_tools.js` | Modified | DONE |
| 2 | `code/src/runtime/kb/source_acquisition.js` | New | DONE |
| 3a+3b | `code/src/runtime/tools/research_tools.js` | New | DONE |
| 4 | `code/src/runtime/permission/rules/research_host_rule.js` | New | DONE |
| 4 | `code/src/runtime/permission/permissionPolicy.js` | Modified | DONE |
| 5 | `code/src/testing/scenarios/staging/SU08_source_acquisition.js` | New | DONE |
| 5 | `code/src/testing/scenarios/staging/SU09_research_tools.js` | New | DONE |
| 6 | `code/src/testing/scenarios/S133_research_fetch_url_dedup_by_src_id.json` | New | DONE |

---

## Track A Compliance — Final Verification

| Check | Result |
|---|---|
| No `new OpenAI()` in source_acquisition.js or research_tools.js | ✓ PASS |
| No direct `fetch()` in source_acquisition.js or research_tools.js | ✓ PASS |
| No direct `fs.*Sync` in source_acquisition.js or research_tools.js | ✓ PASS |
| HTTP via `reg.invoke("http.get/post", ...)` | ✓ PASS |
| Individual source JSON via `reg.invoke("fs.write_file", ...)` | ✓ PASS |
| JSONL export via `manifests.appendSource()` (§ARC-4) | ✓ PASS |
| `api.search.brave.com` + `api.tavily.com` in `DEFAULT_ALLOW_HOSTS` | ✓ PASS |
| `research.search_web` has `preview()` | ✓ PASS (added during SU09 debug) |

**Zero new §ARC exceptions introduced.**

---

## Test Results

### SU08 — source_acquisition.js (16 assertions)

| Test | Assertions | Result |
|---|---|---|
| T1: new URL fetch → OK | status, deduped, content_type, manifest entry | PASS |
| T2: same URL → DUPLICATE | status, deduped, manifest unchanged | PASS |
| T3: blocked host → REJECTED | status, reason HOST_NOT_ALLOWED | PASS |
| T4: HTML extraction | title extracted, script content stripped | PASS |
| T5: Markdown extraction | content_type, raw text preserved | PASS |
| T6: Arabic language detection | language = ar | PASS |
| T7: HTTP 500 → REJECTED | status, reason HTTP_500 | PASS |

**16/16 PASS**

### SU09 — research_tools.js (12 assertions)

| Test | Assertions | Result |
|---|---|---|
| T1: fetch_url happy path | envelope SUCCESS, output OK, src_id format | PASS |
| T2: search_web Brave mock | status, provider_used, results count, ledger | PASS |
| T3: Brave absent → Tavily fallback | provider_used tavily, results count | PASS |
| T4: both providers absent → FAILED | status FAILED | PASS |
| T5: READ_ONLY → search_web denied | allow false, reason named | PASS |

**12/12 PASS**

### S133 — research.fetch_url dedup (4 assertions)

| Assertion | Expected | Result |
|---|---|---|
| status_equals | SUCCESS | PASS |
| state.deduped | true | PASS |
| state.status | DUPLICATE | PASS |
| state.src_id | src_b9fa7c13b595 | PASS |

**4/4 PASS**

### Full Baseline Suite

```
forge-test.js — 124 passed, 0 failed, 5 skipped (129 total)
```
Zero regressions.

---

## Architectural Deviations

None introduced in Stage 9.4. All §ARC-4 usages (manifests.js, cost_ledger.js) were pre-authorized in Stage 9.2. The `_reg` test injection seam added to `source_acquisition.js` and `research_tools.js` is non-behavioral (no-op in production — falls back to `getDefaultRegistry()`).

## STOP-AND-REPORT Instances

**STOP #1 — `research.search_web` missing `preview()`**  
Caught by `defineTool` contract validation on first SU09 run. Fixed by adding `preview()` returning `{ would_search, would_use_max_results }`.

**STOP #2 — `cheerio` not in `node_modules`**  
Resolved by running `npm install`. `cheerio` was already declared in `package.json` from Stage 9.3 — a fresh node_modules state triggered the issue.

## PDF Binary Limitation (deferred to Stage 9.5)

`http_tools.js` `_request()` collects response bytes as UTF-8 string, corrupting 0x80–0xFF bytes in binary PDFs to 0xFD (U+FFFD). Formally documented in `stage_9_4_mid.md`. Fix plan: add `binary_response: true` option to `http_tools.js` (Stage 9.5 §ARC-free amendment).

`acquireSource()` currently rejects PDF content early with `reason: "PDF_DEFERRED_TO_STAGE_9_5"`.

---

## Next Phase Prerequisites (Stage 9.5)

1. **`http_tools.js` binary response support** — add `binary_response: true` option, return base64-encoded body instead of UTF-8 string. Required for PDF ingestion.
2. **`source_acquisition.js` PDF path** — re-enable `_extractText()` PDF branch using `Buffer.from(base64, "base64")` → `pdf-parse`.
3. **SU08 T-PDF** — add a test case for successful PDF extraction (currently skipped due to Stage 9.4 limitation).
4. **KB Contract §3 `application/pdf`** — schema promises PDF support; Stage 9.5 unblocks it.

---

**Stage 9.4 is CLOSED.**
