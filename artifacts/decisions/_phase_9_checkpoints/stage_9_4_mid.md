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

## Awaiting Sign-off For

Step 3b: `research.search_web` (Brave primary + Tavily fallback + cost ledger integration)

Two items I want CTO confirmation on before Step 3b:

1. **Brave API request shape:** `GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<N>` with header `X-Subscription-Token: <key>` — confirmed in PROMPT §2 Step 3. All good; `http.get` supports headers param.

2. **Tavily API request shape:** `POST https://api.tavily.com/search` with JSON body `{ api_key, query, max_results }` — `http.post` supports `body: string` and `headers: object`. I'll pass `JSON.stringify({ api_key, query, max_results })` as body. All good.

No blockers. Awaiting CTO confirmation to proceed to Step 3b.

---

**Next step after sign-off:** Step 3b → `research.search_web` in research_tools.js
