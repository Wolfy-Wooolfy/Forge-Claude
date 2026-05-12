# PHASE-9 STAGE 9.7 — CLOSURE CHECKPOINT

**Date:** 2026-05-12  
**Status:** CLOSED — All steps completed + full test suite GREEN

---

## Deliverables Summary

| Step | File | Type | Status |
|---|---|---|---|
| Demo | `bin/demo_phase9_kb.js` | New | DONE |
| Demo log | `artifacts/projects/_reference_todo_api/kb/demo_run.md` | New | DONE |
| Item 2 | `code/src/runtime/kb/retrieval.js` | Modified | DONE |
| Item 4 | `code/src/runtime/kb/citation_validator.js` | Modified | DONE |
| Item 6 | `code/src/runtime/kb/retrieval.js` | Modified | DONE |
| Item 6 | `code/src/runtime/tools/kb_tools.js` | Modified | DONE |
| Item 8 | `code/src/runtime/agents/roles/research_role.js` | Modified | DONE |
| Item 9 | `code/src/runtime/agents/roles/research_role.js` | Modified | DONE |
| SU15 T6 | `code/src/testing/scenarios/staging/SU15_research_role.js` | Modified | DONE |
| SU10 | `code/src/testing/scenarios/staging/SU10_retrieval.js` | Modified | DONE |
| SU13 | Verified unbroken by kb_tools.js change | — | PASS |
| S137 | `code/src/testing/scenarios/S137_kb_retrieve_empty_kb.json` | New | DONE |
| Mock svc | `code/src/testing/mock_openai_service.js` | Modified | DONE |
| Status | `progress/status.json` | Modified | DONE |
| Decision | `artifacts/decisions/DECISION-20260512-phase-9-closure.md` | New | DONE |
| (mid) | `artifacts/decisions/_phase_9_checkpoints/stage_9_7_mid.md` | New | DONE |

---

## STOP Instances

**STOP #1 — `require()` path resolution in `demo_phase9_kb.js`**  
Relative `require("./code/src/...")` calls from `bin/` resolved to `bin/code/src/` which doesn't exist. Fixed by replacing all affected `require()` calls with `require(path.resolve(ROOT, "code/src/..."))`. Three calls affected: `_registry.js`, `permissionPolicy.js`, `research_role.js`.

---

## Demo Run Results (Step 1–3)

| Step | Tool | Result |
|---|---|---|
| 2 | kb.list_sources | SUCCESS — 3 sources (REPUTABLE×2 + AUTHORITATIVE×1) |
| 3 | kb.validate_citations | SUCCESS — FAIL_UNCITED (2 cited, 1 uncited — correct behavior) |
| 4.1 | research_role Q1 (HTTP methods) | SUCCESS — HIGH confidence, 2 KNOWN findings |
| 4.2 | research_role Q2 (JWT auth) | SUCCESS — HIGH confidence, 2 KNOWN findings, 1 knowledge gap |
| 5 | JSONL integrity | CLEAN — 3 sources, 6 chunks, 2 citations, 0 orphans |

Demo duration: 320ms, API cost: $0.00.

---

## Cleanup Pass — Final Disposition

| # | Item | Resolution | Files Changed |
|---|---|---|---|
| 1 | `retrieval.js` withRetry/withTimeout | DEFER → PHASE-10 | — |
| 2 | Embedding cost not in KB ledger | FIX | `retrieval.js` |
| 3 | `kb.ingest_url` per-chunk budget | DEFER → PHASE-10 | — |
| 4 | `citation_validator` Pattern 4 `/i` | FIX | `citation_validator.js` |
| 5 | `kb.retrieve` baseline gap | FIX | S137 + mock_openai_service.js |
| 6 | `kb.retrieve rejected_low_credibility` | FIX (CTO upgrade) | `retrieval.js` + `kb_tools.js` |
| 7 | `total_cost_usd` always 0 | ACCEPT | — |
| 8 | Research role evidence cap | FIX | `research_role.js` |
| 9 | Confidence_level not recomputed | FIX | `research_role.js` + SU15 T6 |

**Item 9 implementation detail:** `_recomputeConfidence(findings)` ALWAYS overrides LLM's `confidence_level` — not just after downgrades. Algorithm: all KNOWN → HIGH, any ESTIMATED → MEDIUM, any UNCERTAIN → LOW, empty → LOW. Deterministic, contract-tied, validated by T6.

**Item 6 (CTO upgrade decision):**  
`retrieval.js` already computed `rawResults.length - filtered.length` internally. Exposing it required 5 lines: (1) return `{ results, rejected_low_credibility: rejectedCount }` instead of plain array; (2) update `kb_tools.js` to pass `rejected_low_credibility` in tool output metadata via `ok({ results: ret.results }, { rejected_low_credibility: ret.rejected_low_credibility })`. `research_role.js` line 128-129 already reads from `retrieveEnv.metadata.rejected_low_credibility` — this now returns the real count.

---

## SU15 T6 — confidence_level recompute validation

New test case verifying Item 9 fix:

- **Setup:** LLM emits 2 KNOWN findings with empty `supporting_citations` + `confidence_level: "HIGH"`
- **KNOWN-gate:** Both downgraded to ESTIMATED
- **_recomputeConfidence:** returns "MEDIUM" (any ESTIMATED → MEDIUM)
- **Assert:** `confidence_level === "MEDIUM"` — overrides LLM's "HIGH"

T6 **passes**: the recomputation correctly overrides the LLM's inflated confidence. T1 still passes: all KNOWN with citations → recompute returns HIGH → matches LLM's HIGH.

---

## Unit Test Results

| Suite | Assertions | Result |
|---|---|---|
| SU10 — retrieval.js | 12 | 12/12 PASS (was 9 — +3 for rejected_low_credibility) |
| SU13 — kb_tools.js | 17 | 17/17 PASS (unbroken) |
| SU15 — research_role.js | 22 | 22/22 PASS (was 19 — +3 for T6) |

---

## Full Baseline Suite

```
forge-test.js — 132 passed, 0 failed, 5 skipped (137 total)
duration: 123272ms
```

Previous baseline (Stage 9.6): 131 passed, 0 failed, 5 skipped (136 total).  
Net new (Stage 9.7): +1 baseline scenario (S137). Zero regressions.

---

## Track A Compliance — Final Verification

| Check | Result |
|---|---|
| No `new OpenAI()` in Stage 9.7 changes | ✓ PASS |
| No direct `fetch()` in Stage 9.7 changes | ✓ PASS |
| No direct `fs.*Sync` outside §ARC-4 scope | ✓ PASS |
| retrieval.js cost ledger via `appendEntry()` — §ARC-4 applies | ✓ PASS |
| `mock_openai_service.js` additions are test-only | ✓ PASS |

**Zero new §ARC exceptions introduced in Stage 9.7.**

---

## PHASE-9 Cumulative Stats (FINAL)

| Metric | Stage 9.6 | Stage 9.7 | Total |
|---|---|---|---|
| SU assertion suites | SU10–SU15 (base) | SU10 +3, SU15 +3 | SU10–SU15 |
| Baseline scenarios | 136 (S1–S136) | +1 (S137) | 137 |
| New roles | research (12th) | — | 12 roles |
| Doctor checks | 24 | — | 24 |
| §ARC exceptions | 1 (§ARC-4) | 0 | 1 |
| API cost to date | $0.00 | $0.00 | $0.00 |
| STOP instances (PHASE-9) | 2 | 1 | 3 |

---

## Deferred to PHASE-10

1. `retrieval.js` withRetry/withTimeout (Item 1) — resilience pattern
2. `kb.ingest_url` per-chunk budget check (Item 3) — optional defense in depth

---

**Stage 9.7 is CLOSED. PHASE-9 is CLOSED.**
