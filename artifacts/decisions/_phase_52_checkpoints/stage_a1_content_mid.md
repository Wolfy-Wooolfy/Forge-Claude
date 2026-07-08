# PHASE-52 Amendment A-1 — Mid-Checkpoint: stage_a1_content_mid (after D-A1.1+2+3, per §3)

- Date: 2026-07-08
- Amendment: A-1 (Tavily-returned content ingest — closes the REAL Gate #10 allow-list gap, Approach B)
- Decision: DECISION-2026-07-08-phase-52-amendment-a1-tavily-content-ingest.md (D0 `4d8a247`, +§6 refinement)
- Step 1 GO rulings: R1 (acquireSourceFromContent as a NEW sibling; acquireSource untouched), R2 (content cap 100 000 chars, truncate+truncated:true), R3 (S364–S366; S365 = semantic host-membership invariant).
- Cost so far: **$0** (no real provider calls). §ARC: frozen at **10** · L2 tools: **80 → 81** · roles: 13.
- Base `5e7f759` (== origin/main == tag phase-51-complete). LOCAL only.

---

## 1. State — D-A1.1 + D-A1.2 + D-A1.3 DONE (code only; scenarios = D-A1.4, after Step 2 GO)

5 files changed (`+219 / −19`): 4 live-surface + 1 test-infra.
| File | Δ | What |
|---|---|---|
| `code/src/runtime/tools/research_tools.js` | +13/−3 | D-A1.1: `include_raw_content:true` in the Tavily body; `_normalizeTavily` adds a `content` field (raw_content → snippet fallback). Additive; Brave path untouched. |
| `code/src/runtime/kb/source_acquisition.js` | +92/−1 | D-A1.2a: NEW sibling `acquireSourceFromContent(url, content, {title,project_id,root,scope})`. The ONLY removed line is the `module.exports` line → `acquireSource` is byte-identical. |
| `code/src/runtime/tools/kb_tools.js` | +95/−… | D-A1.2b: NEW L2 tool `kb.ingest_content` + added to `exports.tools`. `kb.ingest_url` body unchanged (only the exports array + a header-comment line changed). |
| `code/src/ai_os/conversationEngine.js` | +33/−… | D-A1.3: `_ingest` default → `reg.invoke("kb.ingest_content")`; `_attemptDiscovery` threads `{url,content,title}` and skips a result with empty content (fail-closed, no fetch). Comment refs updated. |
| `code/src/testing/helpers/citation_pass_test_helper.js` | +5/−2 | (keep-existing-green) `_mockDiscovery` search results now carry `content` so the new ingest contract is exercised — S360/S361/S363 stay green. |

## 2. `kb.ingest_content` — schema + pipeline (reuse)
```
input  : { url*, content*, title?, project_id*, scope? }
output : { status: OK|DUPLICATE|REJECTED, src_id, chunks_created, deduped }   // == kb.ingest_url
required_mode: WORKSPACE_WRITE
pipeline (acquireSourceFromContent → then IDENTICAL to kb.ingest_url's tail):
  srcId(url) persistent dedup → guard(empty/whitespace content → REJECTED "EMPTY_CONTENT")
  → cap 100 000 chars (truncate + truncated:true on the record)
  → build record (content_type "text/plain", extracted_text_size=content.length, title, language)
  → scoreSource(record,{use_llm:false})  [credibility by URL/domain ONLY — no body]
  → validateSourceRecord → manifests.appendSource (§ARC-4) → fs.write_file source JSON (L2)
  → chunkSource → embedChunks → openStore/insertChunks → manifests.appendChunk (§ARC-4)
NO http.get on the discovered host. The ONLY external calls in the discovery path stay:
  api.tavily.com (search, allow-listed) + the existing embeddings provider.
```

## 3. Untouched-surface proofs (the security-critical claims)
- **http_tools.js is BYTE-IDENTICAL** — `git diff --quiet -- http_tools.js` → clean (verified). The DEFAULT_ALLOW_HOSTS allow-list AND the SSRF/private-range guard (`_validateUrl` :43-47) are UNCHANGED. A-1 AVOIDS the arbitrary fetch; it does not relax any control.
- **acquireSource is UNCHANGED** — the only removed line in source_acquisition.js is `-module.exports = { acquireSource };` (→ `{ acquireSource, acquireSourceFromContent }`). The function body is byte-identical, so **kb.ingest_url's runtime behavior is unchanged** (manual explicit ingest still fetches + is allow-list-bound). Confirmed green by the full suite (which exercises the ingest_url path) + SU08/SU13 staging remain valid.
- **kb.ingest_url body UNCHANGED** — kb_tools.js diff touches only the header comment, the new `ingest_content` block, and the exports array; the `ingest_url` defineTool is untouched.

## 4. Track A / §ARC / L2
- **§2 keep-clean grep on ALL added lines** (`fs.*Sync | require('fs') | node-fetch | fetch( | new OpenAI | child_process`) across conversationEngine.js / kb_tools.js / research_tools.js / source_acquisition.js → **NONE — CLEAN**. (One added COMMENT references the EXISTING `§ARC-4` writer — no new exception; that token is not in the §2 pattern.)
- **§ARC = 10** unchanged — `kb.ingest_content` writes via the SAME `manifests.appendSource/appendChunk` (§ARC-4) + `fs.write_file` (L2) paths `kb.ingest_url` uses. No new write path.
- **L2 = 81** (was 80) — `getDefaultRegistry().list().length === 81`, `kb.ingest_content` present, `kb.ingest_url` present (verified). status.json `tools_registered_count` will move 80→81 at closure.
- `node --check` OK on all 5 files.

## 5. Erratum #4 (recorded per the GO)
PROMPT-STAGE-52-A1 §0.3 cited sed-window-relative numbers as absolute. Corrected + accepted by the CTO: the `kb.ingest_url` fetch is `source_acquisition.js:152` (not :33-37 = `_detectContentType`); the record build is `:205-234` (not :33-95). Logged in A-1 decision §6.2.

## 6. Gates (this stage)
- Existing citation scenarios **S354–S363: 10/10 PASS** under the new ingest contract (discovery loop → `kb.ingest_content`; mock carries `content`).
- **Full SU suite: 356 pass / 0 fail / 5 skip (361 total)**, exit 0, duration 436324ms — IDENTICAL to the pre-A-1 baseline (A-1 code is additive; no new scenarios yet).
- No active scenario asserts a total tool count (`backup_tools_registered_ok` checks the 4 backup tool NAMES only; doctor check-count 35 unaffected).

## 7. Next (after CTO fresh-zip verify → "A-1 Step 2 GO")
D-A1.4 mock scenarios S364–S366 (target SU 359/0/5 (364)): S364 ingest_content direct (+empty→REJECTED); S365 no-arbitrary-fetch invariant (spy http.get/http.post → every contacted host ∈ DEFAULT_ALLOW_HOSTS); S366 E2E content-path lift. Then D-A1.5 REAL Gate #10 re-run per §6.1 PRIMARY/SECONDARY — HARD STOP pending a SEPARATE owner spend "yes" + estimate.

## STOP
D-A1.1+2+3 complete and gate-proven (full suite 356/0/5 unchanged, 10/10 citation scenarios green, Track A clean, §ARC=10, L2=81, http_tools + acquireSource + kb.ingest_url untouched, $0). Awaiting CTO independent verification on a FRESH LOCAL zip before **A-1 Step 2 GO** (D-A1.4). Do NOT run D-A1.5.
