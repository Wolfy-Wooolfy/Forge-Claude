# DECISION-2026-05-15T13-35 — PHASE-10 Live Ratification Demo (Pre-PHASE-11)

| Field | Value |
|---|---|
| Date | 2026-05-15 |
| Owner | KhElmasry |
| Status | OWNER_DECISION_PENDING |
| Scope | PHASE-10 live ratification — S152 fast-path, _reference_todo_api, real OpenAI calls |
| Related | `DECISION-20260514-1500-phase-10-closure.md` (OWNER_APPROVED — 2026-05-15) |

---

## 1. Header

Live ratification of the PHASE-10 orchestration loop. S152 fast-path attempted against
`_reference_todo_api` with REAL LLM calls across all 12 roles.
FORGE_OWNER_AUTO_APPROVE=1 auto-approved owner gates where reached.

Run terminated at exit code 2 — INVALID_ROLE_OUTPUT from `test_designer` (transition 7).
The loop completed 6 of 14 planned transitions before the failure.

**This artifact is written manually** (the CLI's `_writeClosureArtifact` was not reached because
the runner threw before returning a result object).

---

## 2. Demo Parameters

| Parameter | Value |
|---|---|
| Project | `_reference_todo_api` |
| Budget cap | $5.00 |
| Kill switch threshold | $4.00 |
| loop_id | `d493a566-7b48-4b84-9525-b2922f2963a9` |
| Output dir | `artifacts/projects/_reference_todo_api/orchestration/d493a566-7b48-4b84-9525-b2922f2963a9/` |
| Models: architect / spec_writer / reviewer / cost_estimator / environment / test_designer / builder / documentation | openai / gpt-4o-mini |
| Models: security_auditor / quality_judge | openai / gpt-4o |
| Exit code | 2 (unhandled error — INVALID_ROLE_OUTPUT) |

---

## 3. Mock Baseline (S152)

| Metric | Value |
|---|---|
| Final state | COMPLETE |
| Transition count | 14 |
| Duration | ~50ms (mock) |
| Cost | $0.00 |

---

## 4. Live Result

| Metric | Value |
|---|---|
| Final state | TEST_DESIGN (stalled — never advanced to BUILDER) |
| Transition count | 6 (of 14) |
| Duration | ~52s |
| Total cost | $0.08576 |
| Kill switch fired | No |
| Exit code | 2 (INVALID_ROLE_OUTPUT at test_designer) |

### Per-Role Cost Breakdown

| Role | Model | Cost | Result |
|---|---|---|---|
| architect | gpt-4o-mini | $0.00953 | SUCCESS |
| spec_writer | gpt-4o-mini | $0.01254 | SUCCESS |
| reviewer (Phase A) | gpt-4o-mini | $0.01261 | SUCCESS |
| cost_estimator | gpt-4o-mini | $0.01667 | SUCCESS |
| environment | gpt-4o-mini | $0.01450 | SUCCESS |
| test_designer | gpt-4o-mini | $0.01991 | **FAILED — INVALID_ROLE_OUTPUT** |
| builder | gpt-4o-mini | — | Not reached |
| reviewer (Phase B) | gpt-4o-mini | — | Not reached |
| security_auditor | gpt-4o | — | Not reached |
| documentation | gpt-4o-mini | — | Not reached |
| quality_judge | gpt-4o | — | Not reached |
| **TOTAL** | — | **$0.08576** | — |

**Note on projection vs. actual:** Mid-checkpoint projected ~$0.026 (upper estimate $0.08).
Actual $0.08576 — at the upper bound. Cause: system prompts are longer than the 2500-token
assumption used in the projection (actual input tokens ranged from 463 to 1762 per role call).

### Transition Log (from conversation_log.jsonl)

| # | From | To | Type | Role | Cost |
|---|---|---|---|---|---|
| 1 | OWNER_INTENT | ARCHITECT_DESIGN | NORMAL | — | $0.00 |
| 2 | ARCHITECT_DESIGN | SPEC_WRITER_FORMALIZE | NORMAL | architect | $0.00953 |
| 3 | SPEC_WRITER_FORMALIZE | REVIEWER_SPEC | NORMAL | spec_writer | $0.01254 |
| 4 | REVIEWER_SPEC | COST_ESTIMATE | NORMAL | reviewer | $0.01261 |
| 5 | COST_ESTIMATE | ENV_REPORT | NORMAL | cost_estimator | $0.01667 |
| 6 | ENV_REPORT | TEST_DESIGN | GATE_APPROVE | — (Gate 1) | $0.01450* |
| — | TEST_DESIGN | BUILDER | *never reached* | test_designer | $0.01991† |

*environment cost attributed to Gate 1 advance (invoked before gate; same §OQ-4 pattern noted in mid-checkpoint).
†test_designer cost incurred; output failed schema validation; no transition logged.

---

## 5. Failure Analysis

### Root Cause — test_designer INVALID_ROLE_OUTPUT

The `test_designer_role.js` OUTPUT_SCHEMA requires each scenario object to include 9 fields:
`id`, `name`, `description`, `category`, `setup`, `execution`, `assertions`, `teardown`, `metadata`.

gpt-4o-mini produced scenario objects with only `id`, `name`, `description`, and `steps` — a simplified
structure. The `category`, `setup`, `execution`, `assertions`, `teardown`, and `metadata` fields were
absent. Schema validation in `role.run()` returned `INVALID_ROLE_OUTPUT`. With `consecutive_fails = 1`
(below `MAX_CONSECUTIVE_FAILURES = 3`), the runner threw and the CLI exited code 2.

**This is a schema drift finding, not a runtime infrastructure failure.** The LLM was not
briefed adequately about the exact schema shape required. The system prompt for test_designer
does not include the full JSON schema — the model inferred a simplified structure.

### Pre-Run Fixes Applied (this session)

| Fix | Issue | Resolution |
|---|---|---|
| `role_invoked: null` schema rejection | `orchestration.advance_state` rejects null for string field | Build `advInput` without `role_invoked` key when falsy |
| `vision.md` missing YAML frontmatter | `parseFrontmatter()` returned null → `agent_budget_rule` denied `agent.invoke` | Prepended YAML `---` block to `vision.md` (owner-authorized) |

### Mid-Checkpoint Inaccuracy (recorded per owner instruction)

The mid-checkpoint (§3 "Note on L3 vision gate") claimed:
> "getDefaultRegistry() uses permitAll authorization (no permission policy installed in standalone scripts)"

This is **incorrect**. `getDefaultRegistry()` in `code/src/runtime/tools/_registry.js` lines 232–247
calls `installDefaultPolicy(_defaultRegistry)` on first call — the full permission policy IS active
in all standalone scripts, not just the API server. The vision check (`agent_budget_rule`) does
fire for `agent.invoke` calls (which `role.invoke` delegates to internally). This is WHY Error 2
occurred and required the `vision.md` frontmatter fix.

---

## 6. Drift Analysis

### 6a. Semantic Drift

**Verdict: CONCERN**

Roles 1–5 (architect, spec_writer, reviewer_phase_a, cost_estimator, environment) produced coherent
outputs that passed schema validation and were accepted by `orchestration.advance_state`. The
conversation graph progressed normally through Gate 1.

Role 6 (test_designer) failed INVALID_ROLE_OUTPUT — semantically, the model understood the task
but produced a structurally non-compliant response. The issue is prompt engineering, not semantic
coherence at the task level.

The loop never reached COMPLETE, so end-to-end semantic coherence cannot be assessed.

### 6b. Structural Drift

**Verdict: FAIL**

Mock baseline: 14 transitions. Live result: **6 transitions**.

The loop stalled at TEST_DESIGN and never advanced. The runner did not reach BUILDER, 
RUN_TESTS, REVIEWER_CODE_AND_SECURITY, DOCUMENTATION, QUALITY_JUDGE, DEPLOYMENT_OR_END, or COMPLETE.

### 6c. Schema Drift

**Verdict: FAIL**

`test_designer_role.js` OUTPUT_SCHEMA validation failed. The LLM output was not schema-compliant.
Required fields absent: `category`, `setup`, `execution`, `assertions`, `teardown`, `metadata`.

Infrastructure schema validation (INPUT_SCHEMA for `orchestration.advance_state`, `role.invoke`)
worked correctly — both fixes above were confirmed by successful runs of transitions 1–6.

---

## 7. GO/NO-GO Recommendation

**Recommendation: NO-GO**

Rationale:
- Structural drift: FAIL (6/14 transitions)
- Schema drift: FAIL (test_designer INVALID_ROLE_OUTPUT)
- The loop did not reach COMPLETE under live conditions

**Remediation required before GO:**

| # | Item | Action |
|---|---|---|
| R-1 | test_designer schema non-compliance | Include full OUTPUT_SCHEMA JSON in the test_designer system prompt, OR simplify the schema to match what gpt-4o-mini naturally produces |
| R-2 | Roles not yet tested live | builder, reviewer_phase_b, security_auditor, documentation, quality_judge — schema compliance unknown |
| R-3 | Runner prompt adequacy | Review system prompts for all 12 roles; ensure schema shape is explicitly communicated |

**GO path options:**
- **GO-with-fixes** — Apply R-1, re-run, verify full 14-transition completion, then proceed to PHASE-11
- **NO-GO / defer** — Accept live ratification as incomplete; proceed to PHASE-11 knowing the live demo is partial; revisit post-PHASE-11

---

## 8. Owner Approval

> To ratify this demo (even partial), the owner (KhElmasry) must post:
>
> "LIVE-RAT PARTIAL RATIFIED. Proceed with [GO-with-fixes / NO-GO-defer]."
>
> Or to reject and require full re-run:
>
> "LIVE-RAT REJECTED. Apply remediation before PHASE-11."

Until owner posts a ratification decision, PHASE-11 does NOT begin.
