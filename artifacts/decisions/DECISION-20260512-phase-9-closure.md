# DECISION-20260512-phase-9-closure.md

**Date:** 2026-05-12  
**Owner:** CTO  
**Status:** OWNER_APPROVED  
**Scope:** PHASE-9 Final Closure — Knowledge Base & Research Runtime

---

## Decision

PHASE-9 is closed. All 7 stages (9.0–9.6 + 9.7) are complete. The Knowledge Base Runtime is production-ready for PHASE-10 integration.

`progress/status.json.current_task` updated to `PHASE-9-CLOSED`.  
`progress/status.json.next_phase` updated to `PHASE-10`.

---

## Stages Completed

| Stage | Name | Closure |
|---|---|---|
| 9.0 | Foundation + Contract | CLOSED |
| 9.1 | Source Acquisition (L-KB-1) | CLOSED |
| 9.2 | KB Core Runtime (L-KB-2 + L-KB-3) | CLOSED |
| 9.3 | Retrieval + Citation (L-KB-4) | CLOSED |
| 9.4 | Research Tools (L-KB-1 ext.) | CLOSED |
| 9.5 | KB Tools + Doctor Checks | CLOSED |
| 9.6 | Research Role (L-KB-5) + Budget Integration | CLOSED |
| 9.7 | End-to-End Demo + Cleanup | CLOSED |

---

## System State at Closure

| Metric | Value |
|---|---|
| Baseline scenarios | 137 (S1–S137) |
| SU assertion suites | SU10–SU15 |
| SU assertions total | ~314 (SU10: 12, SU11: ?, SU12: ?, SU13: 17, SU14: ?, SU15: 22) |
| Agent roles | 12 (architect, spec_writer, reviewer, builder, security_auditor, test_designer, cost_estimator, environment, documentation, deployment, quality_judge, research) |
| Doctor checks | 24 |
| KB tools | 6 (ingest_url, retrieve, cite, list_sources, delete_source, validate_citations) |
| §ARC exceptions | 1 — §ARC-4 (kb/manifests.js + kb/cost_ledger.js) |
| API cost (PHASE-9) | $0.00 |
| Test result | 132 passed / 0 failed / 5 skipped (137 total) |

---

## Deliverables by Stage

### Stage 9.0 — Foundation + Contract
- `docs/12_ai_os/22_KNOWLEDGE_BASE_CONTRACT.md` — KB Contract (§1–§9)
- `code/src/runtime/kb/_constants.js` — shared constants

### Stage 9.1 — Source Acquisition
- `code/src/runtime/kb/source_acquisition.js` — URL fetch + credibility scoring
- `code/src/runtime/kb/cost_ledger.js` — per-project JSONL cost tracking (§ARC-4)

### Stage 9.2 — KB Core Runtime
- `code/src/runtime/kb/chunking_engine.js` — fixed-window text chunker
- `code/src/runtime/kb/embedding_engine.js` — batch embedding via openAiAdapter
- `code/src/runtime/kb/storage_lance.js` — LanceDB vector store adapter
- `code/src/runtime/kb/manifests.js` — JSONL source/chunk manifest I/O (§ARC-4)

### Stage 9.3 — Retrieval + Citation
- `code/src/runtime/kb/retrieval.js` — vector query + credibility post-filter + cost logging (Item 2 fix)
- `code/src/runtime/kb/citation_engine.js` — CitationRecord synthesis
- `code/src/runtime/kb/citation_validator.js` — artifact claim audit (Pattern 4 `/i` fix)
- `code/src/runtime/kb/_id_minting.js` — deterministic KB IDs

### Stage 9.4 — Research Tools
- `code/src/runtime/tools/research_tools.js` — research.fetch_url + research.search_web
- `code/src/runtime/permission/rules/research_host_rule.js` — allowed hosts for research

### Stage 9.5 — KB Tools + Doctor Checks
- `code/src/runtime/tools/kb_tools.js` — 6 KB tools registered (ingest_url, retrieve, cite, list_sources, delete_source, validate_citations)
- `code/src/runtime/doctor/checks/kb_budget_status.js` — doctor check
- `code/src/runtime/doctor/checks/kb_indexed_sources_count.js` — doctor check
- `code/src/runtime/doctor/checks/research_role_registered.js` — doctor check

### Stage 9.6 — Research Role + Budget Integration
- `code/src/runtime/agents/roles/research_role.js` — 12th role, KNOWN-gate, deterministic IDs, confidence recompute (Item 9 fix), evidence cap (Item 8 fix)
- `code/src/runtime/kb/budget_guard.js` — vision-override budget read
- `docs/10_runtime/18b_ROLE_PROMPTS.md` — `research_v1` prompt
- `code/src/runtime/agents/_json_schema_validator.js` — `integer` type fix (STOP #1)
- `code/src/runtime/doctor/_registry.js` — 3 new checks registered
- `code/src/runtime/doctor/checks/roles_runtime.js` — research added to REQUIRED_ROLES

### Stage 9.7 — End-to-End Demo + Cleanup
- `bin/demo_phase9_kb.js` — end-to-end demo script
- `artifacts/projects/_reference_todo_api/kb/demo_run.md` — demo log
- `code/src/runtime/kb/retrieval.js` — embedding cost ledger (Item 2) + rejected count (Item 6)
- `code/src/runtime/tools/kb_tools.js` — pass `rejected_low_credibility` in metadata
- `code/src/testing/mock_openai_service.js` — `/v1/embeddings` endpoint support
- `code/src/testing/scenarios/S137_kb_retrieve_empty_kb.json` — direct kb.retrieve baseline
- `code/src/testing/scenarios/staging/SU15_research_role.js` — +T6 (22 assertions)
- `code/src/testing/scenarios/staging/SU10_retrieval.js` — updated for new API (12 assertions)

---

## Stage 9.7 Cleanup Disposition

| # | Item | Resolution | Rationale |
|---|---|---|---|
| 1 | `retrieval.js` withRetry/withTimeout | DEFER → PHASE-10 | No timeout failure observed. Pattern improvement, not bug. |
| 2 | `retrieval.js` query embedding cost not in ledger | FIX ✓ | Budget underestimation when retrieving. Now logs per-call. |
| 3 | `kb.ingest_url` per-chunk budget check | DEFER → PHASE-10 | Single upfront check is conservative enough. |
| 4 | `citation_validator.js` Pattern 4 `/i` flag | FIX ✓ | 1-line cosmetic removal. No behavior change. |
| 5 | `kb.retrieve` baseline coverage gap | FIX ✓ | S137 added — direct kb.retrieve + mock embeddings server. |
| 6 | `kb.retrieve` `rejected_low_credibility` always 0 | FIX ✓ | (CTO upgrade: DEFER→FIX) 5-line change in retrieval.js + kb_tools.js pass-through. |
| 7 | `total_cost_usd` always 0 in ResearchFindings | ACCEPT | Agent cost tracked in agent ledger — duplication = double-counting. Documented. |
| 8 | research_role evidence chunk truncation | FIX ✓ | MAX_EVIDENCE_CHUNKS=10 cap added. Prevents context overflow for large KBs. |
| 9 | `confidence_level` not recomputed after downgrades | FIX ✓ | `_recomputeConfidence()` always overrides LLM value. Deterministic + contract-tied. |

**Item 9 CTO note:** `_recomputeConfidence()` ALWAYS overrides — not just post-downgrade. Same pattern as metadata override. Validated by SU15 T6: LLM emits HIGH → all KNOWN+empty→ESTIMATED → recomputed MEDIUM.

---

## §ARC Exceptions

| Exception | Scope | Authorization |
|---|---|---|
| §ARC-4 | `code/src/runtime/kb/manifests.js` + `code/src/runtime/kb/cost_ledger.js` — bounded fs.appendFileSync / readFileSync | DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md |

**Zero new §ARC exceptions introduced in Stage 9.6 or 9.7.**

---

## STOP Instances (PHASE-9 total: 3)

| Stage | STOP # | Issue | Fix |
|---|---|---|---|
| 9.6 | #1 | `integer` type not supported in `_json_schema_validator.js` | Added integer branch to `_checkType()` |
| 9.6 | #2 | Doctor `"SKIP"` status mapped to `"FAIL"` | Changed idle-state returns to `"PASS"` in new doctor checks |
| 9.7 | #1 | `require("./code/...")` paths resolved relative to `bin/` not ROOT | Changed to `require(path.resolve(ROOT, "code/..."))` |

---

## Deferred to PHASE-10

1. `retrieval.js` withRetry/withTimeout (Item 1) — resilience improvement
2. `kb.ingest_url` per-chunk budget check (Item 3) — optional defense in depth
3. `kb.retrieve rejected_low_credibility` in research_role metadata (Item 6 is now FIXED in retrieval.js — `research_role.js` already reads it at line 128-129)

---

## Approval

PHASE-9 closure approved by CTO.  
PHASE-10 (Iterative Build Loop) may now begin.

---

**PHASE-9 is CLOSED.**
