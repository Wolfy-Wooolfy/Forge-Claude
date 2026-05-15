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

**AMENDMENT (2026-05-15, owner-verified):** The original root cause analysis below was incorrect
and has been superseded. The accurate root cause is a one-line code bug, not a prompt engineering gap.

#### Actual Root Cause: PHASE-9 migration left a stale `loadPrompt` call

```
code/src/runtime/agents/roles/test_designer_role.js

  Line  9: const SYSTEM_PROMPT = loadPrompt("test_designer_v1");  ← loads deprecated v1 prompt
  Line 59:   system_prompt_id: "test_designer_v2",                ← declares v2
```

The role loads `test_designer_v1` (the deprecated prompt that teaches the simplified
`{inputs, expected_outputs}` schema) but declares `system_prompt_id: "test_designer_v2"` and
validates output against the v2 `OUTPUT_SCHEMA` (which requires `category`, `setup`, `execution`,
`assertions`, `teardown`, `metadata`). This is a guaranteed mismatch: the model follows the v1
prompt, produces v1-shaped output, and schema validation (which uses the v2 OUTPUT_SCHEMA) rejects it.

The bug originates in `DECISION-20260513-0930-test-designer-schema-upgrade.md` (PHASE-9 migration):
the `OUTPUT_SCHEMA` and `system_prompt_id` were updated to v2 but the `loadPrompt()` call on line 9
was not changed.

**Why mock tests did not catch this:** Mock tests are prompt-agnostic — they bypass the LLM call
entirely. The `loadPrompt` value is never read in mock execution paths, so no mock scenario
could detect the stale v1 load. Only a live run (with a real LLM call) surfaces the mismatch.

**Scope:** Owner independently verified this is the ONLY role with this mismatch. All other 11
roles have consistent `loadPrompt()` / `system_prompt_id` pairs (confirmed by scan of
`code/src/runtime/agents/roles/*.js`).

**Fix applied:** Line 9 changed to `loadPrompt("test_designer_v2")` per Task 3 (2026-05-15).

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
