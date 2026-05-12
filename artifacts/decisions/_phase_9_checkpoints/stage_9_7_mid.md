# PHASE-9 STAGE 9.7 — MID-STAGE CHECKPOINT

**Date:** 2026-05-12  
**Status:** MID — PAUSED for CTO review  
**Scope:** End-to-End Demo + JSONL Verification (Steps 1–3)

---

## Completed Deliverables (mid-stage)

| Step | File | Type | Status |
|---|---|---|---|
| Demo seed | `artifacts/projects/_reference_todo_api/kb/exports/sources.jsonl` | New | DONE |
| Demo seed | `artifacts/projects/_reference_todo_api/kb/exports/chunks.jsonl` | New | DONE |
| Demo seed | `artifacts/projects/_reference_todo_api/kb/exports/citations.jsonl` | New | DONE |
| Demo seed | `artifacts/projects/_reference_todo_api/spec.md` | New | DONE |
| Demo script | `bin/demo_phase9_kb.js` | New | DONE |
| Demo log | `artifacts/projects/_reference_todo_api/kb/demo_run.md` | New | DONE |

---

## STOP Instances

**STOP #1 — `require()` path resolution in `demo_phase9_kb.js`**  
Relative `require("./code/src/...")` paths resolve from the `bin/` directory, not from `ROOT`. Calls to `_registry.js`, `permissionPolicy.js`, and `research_role.js` all failed with `Cannot find module`. Fixed by replacing all `require("./code/...")` calls with `require(path.resolve(ROOT, "code/..."))`.

---

## Demo Run Results

**Script:** `node bin/demo_phase9_kb.js` (MOCK mode, $0.00 cost)  
**Duration:** 320ms

### Step 1 — KB Fixture Seeding

| Source ID | Title | Credibility Tier |
|---|---|---|
| `src_restful01http` | HTTP Methods — RESTful API Design Guide | REPUTABLE (0.72) |
| `src_jwtio0intro0` | Introduction to JSON Web Tokens | REPUTABLE (0.75) |
| `src_openapi310sp` | OpenAPI Specification 3.1.0 | AUTHORITATIVE (0.92) |

- **Chunks:** 6 (2 per source, zero-vector embeddings)
- **Citations:** 2 (JWT auth + POST 201 claims)

### Step 2 — kb.list_sources

```
status=SUCCESS  count=3
```

All 3 sources returned with full schema (credibility tier, metadata). Tool correctly reads `sources.jsonl` via `manifests.readSources()`.

### Step 3 — kb.validate_citations on spec.md

```
status=SUCCESS  audit_status=FAIL_UNCITED  cited=2  uncited=1
```

- **Cited (2):** JWT authentication claim (line 5), POST /tasks 201 claim (line 7)
- **Uncited (1):** "The API must support OpenAPI 3.1 specification documentation." (line 9)

`FAIL_UNCITED` is **expected and correct** — the spec.md has 3 claims but only 2 citations were seeded. This demonstrates citation validation working as designed: it correctly identifies the gap.

### Step 4 — research_role (2 questions, mock LLM)

| Question | Status | Confidence | Findings | Knowledge Gaps |
|---|---|---|---|---|
| HTTP methods for TODO API | SUCCESS | HIGH | 2 KNOWN | none |
| JWT implementation for REST API | SUCCESS | HIGH | 2 KNOWN | token storage for browser clients |

- All 4 findings have `certainty=KNOWN` with valid `supporting_citations` (KNOWN-gate: no downgrade triggered)
- Finding IDs regenerated deterministically via `findId()` — LLM-generated IDs overridden
- `metadata.searches_performed` and `sources_consulted` overridden with server-computed values
- Q2 correctly surfaced 1 knowledge gap (token storage) not covered by indexed sources

### Step 5 — JSONL Export Integrity

| File | Records | Status |
|---|---|---|
| sources.jsonl | 3 | ✓ OK |
| chunks.jsonl | 6 | ✓ OK |
| citations.jsonl | 2 | ✓ OK |

- **Orphan chunks** (chunks with no matching source): 0
- **Orphan citations** (citations referencing missing chunks): 0
- **Referential integrity:** CLEAN

---

## Demo Run Summary

```
kb.list_sources:       SUCCESS  (3 sources)
kb.validate_citations: SUCCESS  (FAIL_UNCITED — 1 uncited claim, correct behavior)
research_role Q1:      SUCCESS  (confidence=HIGH, 2 KNOWN findings)
research_role Q2:      SUCCESS  (confidence=HIGH, 2 KNOWN findings, 1 knowledge gap)
JSONL integrity:       CLEAN
API cost:              $0.00
Duration:              320ms
```

Full demo log: `artifacts/projects/_reference_todo_api/kb/demo_run.md`

---

## Cleanup Pass — Proposed Resolutions

9 deferred items from Stage 9.6. Awaiting CTO approval before implementing.

| # | Item | File | Proposed Resolution | Rationale |
|---|---|---|---|---|
| 1 | `retrieval.js` should use `withRetry`/`withTimeout` from `openAiAdapter` | `code/src/runtime/kb/retrieval.js` | **DEFER** | No timeout failure observed. Pattern improvement, not correctness bug. PHASE-10 scope. |
| 2 | `retrieval.js` query embedding cost not recorded in KB cost ledger | `code/src/runtime/kb/retrieval.js` | **FIX** | Budget underestimation: embedding calls consume real tokens but `cost_ledger.jsonl` never records them. Fix: append embedding cost entry after each `queryVector()` call. |
| 3 | `kb.ingest_url` per-chunk budget check (currently checked once at start only) | `code/src/runtime/kb/ingest_url_tool.js` | **DEFER** | Single upfront check is conservative enough for bounded ingestion. Re-check mid-run adds complexity without clear benefit. |
| 4 | `citation_validator.js` Pattern 4 has `/i` flag (cosmetic) | `code/src/runtime/kb/citation_validator.js` | **FIX** | 1-line change: remove unnecessary `/i` flag from Pattern 4 regex. No behavioral impact — all patterns still fire correctly. |
| 5 | `kb.retrieve` has no dedicated baseline scenario | `code/src/testing/scenarios/` | **FIX** | Correctness gap: `kb.retrieve` is covered by integration only via research_role (S134). Needs S137 direct scenario with fixture chunks + mock vector search. |
| 6 | `kb.retrieve` does not return `rejected_low_credibility` count in metadata | `code/src/runtime/kb/retrieval.js` | **DEFER** | Always 0 currently. Wiring requires LanceDB filter + credibility threshold enforcement. Non-trivial. PHASE-10 scope. |
| 7 | `total_cost_usd` in ResearchFindings always 0 | `code/src/runtime/agents/roles/research_role.js` | **ACCEPT** | Cost of LLM synthesis call is tracked in agent cost ledger (agent-layer). Duplicating it in ResearchFindings metadata would cause double-counting. Current design is correct: set to 0 and document. |
| 8 | research_role evidence block not truncated before sending to LLM | `code/src/runtime/agents/roles/research_role.js` | **FIX** | With large KBs, evidence block could exceed model context window. Fix: truncate evidence to first N chunks (e.g., top 10) with a token-aware cap. |
| 9 | `confidence_level` not recomputed after KNOWN→ESTIMATED downgrades | `code/src/runtime/agents/roles/research_role.js` | **FIX** | Correctness issue: LLM may report `confidence_level=HIGH` but after downgrading KNOWN findings to ESTIMATED, the actual confidence is lower. Fix: recompute based on findings distribution after KNOWN-gate. |

**Proposed scope for Stage 9.7 cleanup:** FIX items 2, 4, 5, 8, 9 (5 fixes). DEFER items 1, 3, 6. ACCEPT item 7.

---

## Notes for CTO Review

1. **`FAIL_UNCITED` in demo** — intentional. 3rd claim in spec.md ("OpenAPI 3.1 support") has no corresponding citation in the seeded data. This correctly demonstrates the validator catching the gap. Should this be noted as a known KB gap in `demo_run.md`? Currently the file is accurate as-is.

2. **KNOWN-gate not triggered in demo** — all 4 mock findings had valid `supporting_citations`, so no downgrade happened. KNOWN-gate was already tested in SU15 T2. Demo validates the happy path (no downgrade needed).

3. **Item 9 (confidence_level recomputation)** — currently `research_role.js` preserves the LLM-returned `confidence_level` without adjustment. If KNOWN→ESTIMATED downgrades occur, the reported confidence may be higher than warranted. The FIX would compute confidence from findings: all KNOWN → HIGH, any ESTIMATED → MEDIUM, any UNCERTAIN → LOW. This is a correctness issue if research_role is ever used for advisory decisions.

4. **Item 2 (embedding cost logging)** — the fix adds a `cost_ledger.append()` call after each `queryVector()` in `retrieval.js`. Needs careful placement to avoid double-logging if `retrieval.js` is called multiple times in one research session. Stage 9.6's budget guard already enforces the cap correctly — this is purely about accurate ledger reporting.

---

**PAUSED — awaiting CTO cleanup approval before implementing items 2, 4, 5, 8, 9.**
