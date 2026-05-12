# PHASE-9 STAGE 9.4 — MID-STAGE CHECKPOINT

**Date:** 2026-05-12  
**Status:** AWAITING CTO ADVISOR SIGN-OFF before Step 3b (research.search_web)

---

## Files Created So Far (Steps 1–3a)

| File | Type | Notes |
|---|---|---|
| `code/src/runtime/tools/http_tools.js` | Modified | `DEFAULT_ALLOW_HOSTS` += `api.search.brave.com`, `api.tavily.com` |
| `code/src/runtime/kb/source_acquisition.js` | New | L-KB-1 acquireSource() — fetch, extract, dedup, score, persist |
| `code/src/runtime/tools/research_tools.js` | New | `research.fetch_url` tool only — `research.search_web` NOT yet added |

## Track A Compliance Check

All checks run manually before this checkpoint:

| Check | Result | Evidence |
|---|---|---|
| No `new OpenAI()` in source_acquisition.js | ✓ PASS | grep: no match |
| No direct `fetch()` in source_acquisition.js or research_tools.js | ✓ PASS | grep: no match |
| No direct `fs.*(Sync)` in source_acquisition.js | ✓ PASS | grep: no match — uses `reg.invoke("fs.write_file", ...)` |
| No direct `fs.*(Sync)` in research_tools.js | ✓ PASS | grep: no match |
| No `child_process` in either file | ✓ PASS | grep: no match |
| HTTP via registry (`reg.invoke("http.get", ...)`) | ✓ PASS | line 112 of source_acquisition.js |
| Individual JSON via registry (`reg.invoke("fs.write_file", ...)`) | ✓ PASS | line 155 of source_acquisition.js |
| JSONL export via `manifests.appendSource()` (§ARC-4) | ✓ PASS | line 150 of source_acquisition.js |
| Brave + Tavily in `DEFAULT_ALLOW_HOSTS` | ✓ PASS | lines 17–18 of http_tools.js |

**Zero new §ARC exceptions introduced.** source_acquisition.js is fully Track-A-clean.

## Preflight Finding (resolved before coding)

`fs.write_file` (line 98–99 of fs_tools.js) does `mkdirSync({ recursive: true })` before writing. The `sources/` directory is created automatically — no STOP-AND-REPORT needed. Confirmed before Step 2 began.

## STOP-AND-REPORT instances this half-stage

None. All §4 triggers from PROMPT-STAGE-9-4.md were checked:
1. `fetch()` — not used ✓
2. `fs.*Sync` outside §ARC-4 modules — not used ✓
3. `child_process` — not used ✓
4. `new OpenAI()` — not used ✓
5. `http.get` headers support — confirmed before coding (input_schema line 136 of http_tools.js has `headers: { type: "object" }`) ✓
6. PDF parsing network — `pdf-parse` is local-only ✓
7. HTML parsing — `cheerio` is local-only ✓
8. Brave/Tavily POST shape — not yet verified (pending Step 3b) ✓

## Provider Contract v2 for HTTP

Confirmed: all HTTP in source_acquisition.js goes through `reg.invoke("http.get", ...)` which calls `http_tools.js` which uses Node's built-in `https`/`http` modules (NOT `fetch()`, NOT `new OpenAI()`). This is Provider Contract v2 compliant — external HTTP is routed through the L2 tool registry with allow-list enforcement and permission policy.

## source_acquisition.js Design Summary

Key behaviors:
- `srcId(url)` → deterministic dedup key (sha256 prefix)
- `manifests.readSources()` → dedup check before any HTTP call
- `reg.invoke("http.get", ...)` → fetch content (allow-list enforced)
- `_detectContentType()` → content-type from header, extension fallback
- `_extractText()` → cheerio for HTML, pdf-parse for PDF, raw for MD/TXT
- `_extractTitle()` → `<title>` or first H1 for HTML; first non-empty line for others
- `_detectLanguage()` → Arabic Unicode U+0600–U+06FF > 10 chars → "ar", else "en"
- `scoreSource(record, { use_llm: false })` → heuristic-only credibility
- `validateSourceRecord()` → fail-closed schema validation (throws)
- `manifests.appendSource()` → §ARC-4 JSONL export append
- `reg.invoke("fs.write_file", ...)` → individual `<src_id>.json` (auto-mkdir)

Limitation documented inline: `http.get` returns body as UTF-8 string; PDF parsing uses `Buffer.from(body, "binary")` — acceptable for Stage 9.4 (binary content via HTTP is an existing constraint of http_tools.js MAX_BODY_BYTES=4MB).

## research_tools.js Design Summary (fetch_url only)

`research.fetch_url`:
- `required_mode: "WORKSPACE_WRITE"`
- Calls `acquireSource()` from source_acquisition
- Returns `{ status, src_id, deduped, content_type, extracted_text_size, reason? }`
- `preview()` returns `{ would_fetch: url, would_dedup_if_exists: src_id }` without side effects
- On REJECTED → `failed(reason, null, output_obj)` so error is surfaced

## Cost Actuals

$0.00 — all implementations are mock-testable. No real API calls made.

---

## PDF Binary Limitation (deferred to Stage 9.5)

**Root cause:** `http_tools.js` `_request()` collects raw response bytes, then calls `Buffer.concat(chunks).toString("utf8")`. UTF-8 encoding replaces any non-UTF-8-safe byte with the replacement character `0xFD`. Real PDFs (binary format) contain 0x80–0xFF bytes extensively — the round-trip `string → Buffer.from(body, "binary")` cannot recover bytes that were already corrupted to 0xFD.

**Empirical test (CTO, 2026-05-12):** All 0x80–0xFF bytes become 0xFD after the utf8 round-trip. 99%+ of real PDFs are broken by this.

**Why it matters:** KB Contract §3 lists `application/pdf` in `content_type` enum, so the schema promises PDF support.

**Fix applied (Stage 9.4):**
- `_extractText()` PDF branch replaced with an explicit `throw new Error("PDF support deferred to Stage 9.5")` (unreachable, but fails loudly if somehow reached)
- `acquireSource()` rejects PDF-detected content BEFORE extraction with `reason: "PDF_DEFERRED_TO_STAGE_9_5"`

**Stage 9.5 fix plan:** Add `binary_response: true` option to `http_tools.js` that skips the `.toString("utf8")` step and returns base64-encoded body instead. `source_acquisition.js` will decode the base64 to a Buffer and pass directly to `pdf-parse`. This requires a Track-A-clean amendment to `http_tools.js` only — no new §ARC needed.

**Files amended (mid-stage fix):**
- `code/src/runtime/kb/source_acquisition.js` — PDF gate added + `_extractText` PDF branch replaced + global scope early rejection added

## Awaiting Sign-off For

Step 3b: `research.search_web` (Brave primary + Tavily fallback + cost ledger integration)

Two items I want CTO confirmation on before Step 3b:

1. **Brave API request shape:** `GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<N>` with header `X-Subscription-Token: <key>` — confirmed in PROMPT §2 Step 3. All good; `http.get` supports headers param.

2. **Tavily API request shape:** `POST https://api.tavily.com/search` with JSON body `{ api_key, query, max_results }` — `http.post` supports `body: string` and `headers: object`. I'll pass `JSON.stringify({ api_key, query, max_results })` as body. All good.

No blockers. Awaiting CTO confirmation to proceed to Step 3b.

---

**Next step after sign-off:** Step 3b → `research.search_web` in research_tools.js
