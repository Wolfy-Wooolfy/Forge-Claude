# PHASE-9 STAGE 9.5 — MID-STAGE CHECKPOINT

**Date:** 2026-05-12  
**Status:** IN PROGRESS — Steps A–G complete, awaiting CTO review before Step H

---

## Steps Completed (A–G)

| Step | File | Type | Status |
|---|---|---|---|
| A | `code/src/runtime/tools/http_tools.js` | Modified | DONE |
| B | `code/src/runtime/kb/source_acquisition.js` | Modified | DONE |
| C | `code/src/runtime/kb/budget_guard.js` | New | DONE |
| D | `code/src/runtime/kb/retrieval.js` | New | DONE |
| E | `code/src/runtime/kb/citation_engine.js` | New | DONE |
| F | `code/src/runtime/kb/citation_validator.js` | New | DONE |
| G | `code/src/runtime/tools/kb_tools.js` (first 3 tools) | New | DONE |

---

## Step A — http_tools.js binary_response

### Change
`_request()` signature extended with `binaryResponse` parameter (6th arg).  
In `res.on("end", ...)` — after `tooLarge` check — single `Buffer.concat(chunks)` allocation:

```js
const buf     = Buffer.concat(chunks);
const rawBody = binaryResponse ? buf.toString("base64") : buf.toString("utf8");
```

`http.get` input_schema gains `binary_response: { type: "boolean" }`.  
`http.get.execute()` passes `input.binary_response` as 6th arg to `_request()`.

**CTO Clarification 3 confirmation:** Buffer.concat called once (after tooLarge check, not before). Single allocation, base64 branch added conditionally.

No regression: `binary_response` defaults to `undefined` (falsy), so all existing callers receive utf8 body unchanged.

---

## Step B — source_acquisition.js PDF re-enable

### Change: `_extractText()`
PDF branch re-enabled:
```js
if (contentType === "application/pdf") {
  const pdfParse = require("pdf-parse");
  const buf      = Buffer.from(body, "base64");
  const data     = await pdfParse(buf);
  return data.text || "";
}
```
`body` is base64 at this point (two-pass fetch ensures it).

### Change: `acquireSource()` — two-pass PDF fetch
Removed `PDF_DEFERRED_TO_STAGE_9_5` guard. Replaced with:

```js
let fetchBody = body;  // utf8 first pass (for content-type detection)
if (content_type === "application/pdf") {
  const pdfEnv = await reg.invoke("http.get", {
    url, timeout_ms: 15000, binary_response: true
  }, ctx);
  if (!pdfEnv || pdfEnv.status !== "SUCCESS" || pdfEnv.output.status_code >= 400) {
    return { status: "REJECTED", reason: "PDF_BINARY_FETCH_FAILED", ... };
  }
  fetchBody = pdfEnv.output.body; // base64-encoded binary
}
```

Downstream uses `fetchBody` instead of `body`:
- `_extractText(fetchBody, content_type)` — passes base64 to pdf-parse
- `_extractTitle(extractedText, fetchBody, content_type)` — harmless for PDF (text branch)
- `raw_byte_size`: `Buffer.from(fetchBody, "base64").length` for PDF; `Buffer.byteLength(fetchBody, "utf8")` for others

---

## Step C — budget_guard.js

**New file** (~70 lines).  
Uses `sumCost(project_id, opts)` from `cost_ledger.js` and constants from `_constants.js`.

```
checkBudget(project_id, opts)  → { status, total_usd, budget_usd, ratio }
enforceBudget(project_id, opts) → throws Error (code: BUDGET_EXCEEDED)
logWarnIfNeeded(project_id, opts) → process.stderr.write if WARN_70PCT+
```

Thresholds per §9.3:
- ratio < 0.70 → NORMAL
- ratio >= 0.70 → WARN_70PCT
- ratio >= 1.00 → EXCEEDED

---

## Step D — retrieval.js

**New file** (~85 lines).

`retrieve(queryText, options)` flow:
1. Embed via `getClient().embeddings.create(...)` (Provider Contract v2, `opts._client` injection for tests)
2. `openStore(project_id, scope, { root })`
3. `searchVector(store, queryVec, k*4, {})` — over-fetch for post-filter headroom
4. `readSources()` → `Map<source_id, tier>`
5. `.filter(r => tierRank(tierMap.get(r.source_id)) >= floorRank).slice(0, k)`
6. Return annotated results: `{ chunk_id, source_id, text, relevance_score, credibility_tier, section_heading, ordinal }`

Credibility tier ordering: AUTHORITATIVE(3) > REPUTABLE(2) > COMMUNITY(1) > LOW(0)

---

## Step E — citation_engine.js

**New file** (~90 lines).

`synthesizeCitation(options)` flow:
1. Filter `chunks` where `credibility_tier !== "LOW"` **(CTO Clarification 2 enforcement)**
2. If 0 chunks remain → `{ status: "BLOCKED", reason: "NO_SUPPORTING_CHUNKS"|"ALL_CHUNKS_LOW_CREDIBILITY" }`
3. Build `supporting_chunks` with `excerpt.slice(0, 200)` (§5 cap)
4. Confidence from `max(relevance_score)`: ≥0.75→HIGH, ≥0.45→MEDIUM, else→LOW
5. `citId(claim_text, chunk_ids)` → deterministic `cit_<12hex>`
6. `validateCitationRecord(record)` — fail-closed before persistence
7. `manifests.appendCitation(record, ...)` (§ARC-4)

---

## Step F — citation_validator.js

**New file** (~70 lines).

5 CLAIM_PATTERNS from §7.1 applied per-line.  
`validateCitations(artifactContent, citedLineNumbers)` returns:
```js
{ status, uncited_claims_count, cited_claims_count, uncited_claims: [{line, text}] }
```
`citedLineNumbers` accepts `Set<number>` or `number[]` (1-indexed).

---

## Step G — kb_tools.js (first 3 tools)

**New file** (~230 lines, partial).

| Tool | Mode | Key behaviour |
|---|---|---|
| `kb.ingest_url` | WORKSPACE_WRITE | `enforceBudget` → `acquireSource` → `chunkSource` → `embedChunks` → `insertChunks` → `appendChunk` |
| `kb.retrieve` | READ_ONLY | delegates to `retrieve()` |
| `kb.cite` | WORKSPACE_WRITE | delegates to `synthesizeCitation()` |

All 3 support `ctx._reg` / `ctx._client` injection seams for unit tests.

---

## Track A Compliance — Mid-stage Verification

| Check | Result |
|---|---|
| No `new OpenAI()` in retrieval.js, citation_engine.js, citation_validator.js, budget_guard.js, kb_tools.js | ✓ PASS |
| No direct `fetch()` in any new file | ✓ PASS |
| No direct `fs.*Sync` in any new file | ✓ PASS |
| `binary_response` PDF re-fetch goes through `reg.invoke("http.get", ...)` | ✓ PASS |
| Credibility JSONL reads via `manifests.readSources()` (§ARC-4) | ✓ PASS |
| Citation JSONL writes via `manifests.appendCitation()` (§ARC-4) | ✓ PASS |
| Chunk JSONL writes via `manifests.appendChunk()` (§ARC-4) | ✓ PASS |
| Budget read via `sumCost()` from `cost_ledger.js` (§ARC-4) | ✓ PASS |

**Zero new §ARC exceptions introduced.**

---

## CTO Clarifications Applied

| Clarification | Applied? |
|---|---|
| CLARIFICATION 1: Create `budget_guard.js` (not inline) | ✓ Step C |
| CLARIFICATION 2: LOW-tier filter in `citation_engine.synthesizeCitation()` | ✓ Step E |
| CLARIFICATION 3: `binary_response` branch AFTER size check, `Buffer.concat` once | ✓ Step A |

---

## Pending — Steps H–K

| Step | Deliverable |
|---|---|
| H | `kb_tools.js` — add `kb.list_sources`, `kb.delete_source`, `kb.validate_citations` |
| I | SU10 (retrieval.js), SU11 (citation_engine.js), SU12 (citation_validator.js), SU13 (kb.ingest_url + kb.retrieve), SU14 (kb.cite + kb.validate_citations) |
| J | S129 (kb.ingest_url), S130 (kb.retrieve), S131 (kb.cite), S132 (kb.validate_citations) |
| K | `stage_9_5.md` closure checkpoint |

---

## Known Risks

1. **`pdf-parse` test coverage** — SU08 T-PDF deferred from Stage 9.4 will be added in SU10 (retrieval unit test won't cover PDF path directly; tested end-to-end in S129).
2. **LanceDB not available in unit tests** — `retrieval.js` and `kb.ingest_url` use `storage_lance.js` which requires `@lancedb/lancedb`. Unit tests (SU10, SU13) must mock `openStore` / `searchVector` via injection seam.
3. **`kb.retrieve` is READ_ONLY but calls OpenAI** — embedding creation is a network call. Tests must inject `_client` to avoid real API calls.

---

**Awaiting CTO review. Steps H–K will proceed after approval.**
