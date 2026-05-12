# PHASE-9 STAGE 9.6 — CLOSURE CHECKPOINT

**Date:** 2026-05-12  
**Status:** CLOSED — All steps completed + full test suite GREEN

---

## Deliverables Summary

| Step | File | Type | Status |
|---|---|---|---|
| A | `code/src/runtime/kb/budget_guard.js` | Modified | DONE |
| B | `docs/10_runtime/18b_ROLE_PROMPTS.md` | Modified | DONE |
| C | `code/src/runtime/agents/roles/research_role.js` | New | DONE |
| D1 | `code/src/runtime/doctor/checks/kb_budget_status.js` | New | DONE |
| D2 | `code/src/runtime/doctor/checks/kb_indexed_sources_count.js` | New | DONE |
| D3 | `code/src/runtime/doctor/checks/research_role_registered.js` | New | DONE |
| D4 | `code/src/runtime/doctor/_registry.js` | Modified | DONE |
| D5 | `code/src/runtime/doctor/checks/roles_runtime.js` | Modified | DONE |
| E | `code/src/runtime/agents/_json_schema_validator.js` | Modified | DONE |
| F | `code/src/testing/scenarios/staging/SU15_research_role.js` | New | DONE |
| G1 | `code/src/testing/scenarios/S134_research_role_happy.json` | New | DONE |
| G2 | `code/src/testing/scenarios/S135_research_role_invalid_input.json` | New | DONE |
| G3 | `code/src/testing/scenarios/S136_research_role_budget_exceeded.json` | New | DONE |
| G4 | `code/src/runtime/agents/adapters/mock_responses.json` | Modified | DONE |
| (mid) | `artifacts/decisions/_phase_9_checkpoints/stage_9_6_mid.md` | New | DONE |

---

## Track A Compliance — Final Verification

| Check | Result |
|---|---|
| No `new OpenAI()` in research_role.js | ✓ PASS |
| No direct `fetch()` in research_role.js | ✓ PASS |
| No direct `fs.*Sync` in research_role.js | ✓ PASS |
| kb.retrieve via `reg.invoke("kb.retrieve", ...)` | ✓ PASS |
| LLM synthesis via `reg.invoke("agent.invoke", ...)` | ✓ PASS |
| budget_guard vision read via `visionEngine.readVisionSync()` | ✓ PASS |
| Doctor checks use lazy `require()` (no top-level side effects) | ✓ PASS |
| `integer` type added to validator — no `new` dependencies | ✓ PASS |

**Zero new §ARC exceptions introduced.**

---

## STOP Instances

**STOP #1 — integer type not supported in _json_schema_validator.js**  
`_checkType()` had no branch for `"integer"` type — returned `false` for all values. Any `{ type: "integer" }` schema field caused validation failure. Found during SU15 T1 first run: `INVALID_ROLE_OUTPUT: 'metadata.searches_performed': expected type integer, got number`. Fixed by adding:
```js
if (typeName === "integer") return typeof value === "number" && !isNaN(value) && Number.isInteger(value);
```

**STOP #2 — doctor SKIP status mapped to FAIL**  
`runDoctor._runOneCheck` only allows `["PASS", "WARN", "FAIL"]`; `"SKIP"` falls through to `"FAIL"`. New doctor checks (`kb_budget_status`, `kb_indexed_sources_count`) returned `"SKIP"` for idle state, causing S10 and S119 to fail. Fixed by returning `"PASS"` for idle state (matching the pattern in `activeProject.js`).

---

## Unit Test Results (SU15)

| Suite | Assertions | Result |
|---|---|---|
| SU15 — research_role.js | 19 | 19/19 PASS |

### SU15 Coverage

- **T1** — Happy path: retrieve returns 1 chunk, LLM returns KNOWN finding → SUCCESS, metadata.sources_consulted=1
- **T2** — KNOWN-gate: LLM returns KNOWN + empty supporting_citations → downgraded to ESTIMATED
- **T3** — BUDGET_EXCEEDED: enforceBudget() throws → FAILED BUDGET_EXCEEDED
- **T4** — INVALID_INPUT: missing required `question` field → FAILED INVALID_INPUT
- **T5** — Empty KB: retrieve returns 0 results, LLM returns UNCERTAIN → knowledge_gaps auto-filled

---

## Baseline Scenarios S134–S136

All 3 designed to run without real OpenAI API keys:

| Scenario | Tool | Path Tested | Expected |
|---|---|---|---|
| S134 | role.invoke research | Happy path — mock LLM → SUCCESS, findings present | SUCCESS, confidence_level=LOW, role_id=research |
| S135 | role.invoke research | Missing `question` field | FAILED, reason=INVALID_INPUT |
| S136 | role.invoke research | Pre-seeded cost_ledger $1.60 > $1.50 | FAILED, reason=BUDGET_EXCEEDED |

---

## Full Baseline Suite

```
forge-test.js — 131 passed, 0 failed, 5 skipped (136 total)
duration: 110804ms
```

Previous baseline: 128 passed, 0 failed, 5 skipped (133 total).  
Net new: +3 baseline scenarios (S134–S136). Zero regressions.

---

## Architectural Decisions

**`_json_schema_validator.js` — `integer` type added:**  
JSON Schema `integer` is a subtype of `number`. The validator now correctly handles both. All existing schemas used only `number` — no regressions.

**`budget_guard.js` — vision-override pattern:**  
Follows the same pattern as `budget_enforcer.js` (agent-layer budget): `createVisionEngine({ root }).readVisionSync(project_id)` → read `fm.budget.kb_lifecycle_usd_max`. Falls back to `BUDGET_DEFAULT_USD` if vision not found or field absent. `opts.budget_usd` takes highest precedence (test injection path).

**`research_role.js` — orchestration vs pure agent:**  
Research role is the first "orchestration" role — it calls a KB tool (`kb.retrieve`) before calling `agent.invoke`. All tool calls go through `getDefaultRegistry()` (Track A). The `system_prompt_id` is still required (for LLM synthesis step) and validated at load time.

**Doctor checks — idle = PASS:**  
All 3 new doctor checks return `"PASS"` when no active project exists (idle state). This matches the established pattern in `activeProject.js`.

---

## PHASE-9 Cumulative Stats (through Stage 9.6)

| Metric | Stage 9.5 | Stage 9.6 | Total |
|---|---|---|---|
| SU assertion suites | SU10–SU14 (83 assertions) | SU15 (19 assertions) | SU10–SU15 |
| Baseline scenarios | 128 total (S1–S132) | +3 (S134–S136) | 131 total |
| New roles | — | research (12th) | 12 roles |
| Doctor checks | 21 | +3 (24 total) | 24 checks |
| API cost to date | $0.00 | $0.00 | $0.00 |

---

## Notes for Stage 9.7

1. `retrieval.js` should use `withRetry`/`withTimeout` from `openAiAdapter` (matching `embedding_engine.js` pattern)
2. `retrieval.js` query embedding cost not recorded in KB cost ledger
3. `kb.retrieve` does not return `rejected_low_credibility` count in metadata — always 0 in research_role metadata
4. `total_cost_usd` in ResearchFindings metadata is always 0 (cost tracking for synthesis not wired)
5. Pattern 4 in `citation_validator.js` has `/i` flag (cosmetic — patterns still fire correctly)

---

**Stage 9.6 is CLOSED.**
