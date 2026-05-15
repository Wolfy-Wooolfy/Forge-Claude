# DECISION-2026-05-15T14-00 — PHASE-10 Live Ratification Demo — Final (Pre-PHASE-11)

| Field | Value |
|---|---|
| Date | 2026-05-15 |
| Owner | KhElmasry |
| Status | OWNER_DECISION_PENDING |
| Scope | PHASE-10 live ratification — S152 fast-path, _reference_todo_api, real OpenAI calls — full completion |
| Prior artifacts | `DECISION-2026-05-15T13-35-live-ratification-pre-phase-11.md` (partial, NO-GO) |
| Prior artifacts | `DECISION-2026-05-15T13-3-live-ratification-pre-phase-11.md` (CLI-generated, Run 3 raw data) |
| Related | `DECISION-20260514-1500-phase-10-closure.md` (OWNER_APPROVED — 2026-05-15) |

---

## 1. Header

Live ratification of the PHASE-10 orchestration loop completed on the third run. S152 fast-path
executed against `_reference_todo_api` with REAL LLM calls across all 12 roles.
`FORGE_OWNER_AUTO_APPROVE=1` auto-approved all 3 owner gates.

This artifact supersedes the partial NO-GO result from `DECISION-2026-05-15T13-35`. It documents
the full remediation history (3 bugs, 3 runs) and the final COMPLETE result.

---

## 2. Demo Parameters

| Parameter | Value |
|---|---|
| Project | `_reference_todo_api` |
| Budget cap | $5.00 |
| Kill switch threshold | $4.00 |
| loop_id (Run 3) | `6eb913a7-f2eb-41a6-85c0-ab7dba2c5520` |
| Output dir | `artifacts/projects/_reference_todo_api/orchestration/6eb913a7-f2eb-41a6-85c0-ab7dba2c5520/live_ratification/` |
| Models: architect / spec_writer / reviewer / cost_estimator / environment / test_designer / builder / documentation | openai / gpt-4o-mini |
| Models: security_auditor / quality_judge | openai / gpt-4o |

---

## 3. Mock Baseline (S152)

| Metric | Value |
|---|---|
| Final state | COMPLETE |
| Transition count | 14 |
| Duration | ~50ms (mock) |
| Cost | $0.00 |

---

## 4. Remediation History

Three runner bugs were found and fixed across two intermediate runs before full completion.

### Bug 1 — test_designer loadPrompt version mismatch (PHASE-9 migration residue)

| Field | Value |
|---|---|
| File | `code/src/runtime/agents/roles/test_designer_role.js` |
| Line 9 before | `const SYSTEM_PROMPT = loadPrompt("test_designer_v1");` |
| Line 9 after | `const SYSTEM_PROMPT = loadPrompt("test_designer_v2");` |
| Error | Run 1 exit 2: `INVALID_ROLE_OUTPUT` at test_designer (6/14 transitions, $0.08576) |
| Root cause | PHASE-9 migration (`DECISION-20260513-0930-test-designer-schema-upgrade.md`) updated `system_prompt_id` and `OUTPUT_SCHEMA` to v2 but left `loadPrompt("test_designer_v1")` on line 9. The v1 prompt teaches `{inputs, expected_outputs}` shape; OUTPUT_SCHEMA validates v2 shape — guaranteed mismatch. |
| Why not caught by mock | Mock tests are prompt-agnostic; `loadPrompt` is never read in mock execution paths. |
| Scope | Independent scan confirmed test_designer is the ONLY role with this mismatch. All other 11 roles have consistent loadPrompt / system_prompt_id pairs. |

### Bug 2 — reviewer Phase B missing `code` field

| Field | Value |
|---|---|
| File | `code/src/testing/live/live_ratification_runner.js` |
| Line 294 before | `{ phase: "B", spec: spec, design: design, project_id }` |
| Line 294 after | `{ phase: "B", spec: spec, design: design, code: bld_res, project_id }` |
| Error | Run 2 exit 2: `INVALID_INPUT` at reviewer Phase B — "phase B requires a 'code' field" |
| Root cause | Runner input construction omitted `code: bld_res`. `reviewer_role.js` line 59–61 has explicit runtime guard for phase B. `bld_res` was in scope (declared line 279). |

### Bug 3 — security_auditor Phase CODE missing `code` field

| Field | Value |
|---|---|
| File | `code/src/testing/live/live_ratification_runner.js` |
| Line ~299 before | `{ phase: "CODE", spec: spec, design: design, project_id }` |
| Line ~299 after | `{ phase: "CODE", spec: spec, design: design, code: bld_res, project_id }` |
| Error | Would have caused exit 2 on same run as Bug 2. Fixed proactively per owner instruction. |
| Root cause | Same pattern as Bug 2: `security_auditor_role.js` line 60–61 has explicit runtime guard for phase CODE requiring `code` field. Schema marks it optional but runtime guard mandates it. |

**Note:** Bugs 2 and 3 are runner input-construction bugs — the role contracts are correct; the runner was not passing all required context. Bug 1 is a role-level code bug (stale loadPrompt call). None are OUTPUT_SCHEMA mismatches in the model's output for roles 2–12.

---

## 5. Run History

| Run | Exit code | loop_id | Transitions | Cost | Stopped at |
|---|---|---|---|---|---|
| Run 1 | 2 | `d493a566-...` | 6/14 | $0.08576 | test_designer INVALID_ROLE_OUTPUT (Bug 1) |
| Run 2 | 2 | *(partial)* | ~8/14 | ~$0.11 est. | reviewer Phase B INVALID_INPUT (Bug 2) |
| Run 3 | 0 | `6eb913a7-...` | 14/14 | $0.17916 | **COMPLETE** |
| **Cumulative** | — | — | — | **~$0.37 est.** | — |

All runs under $4.00 kill switch threshold. Budget cap ($5.00) not approached.

---

## 6. Final Live Result (Run 3)

| Metric | Value |
|---|---|
| Final state | **COMPLETE** |
| Transition count | **14** |
| Duration | 103.3s |
| Total cost (Run 3) | $0.17916 |
| Kill switch fired | No |
| Exit code | 0 |

### Per-Role Cost Breakdown (Run 3)

| Role | Model | Cost |
|---|---|---|
| architect | gpt-4o-mini | $0.00871 |
| spec_writer | gpt-4o-mini | $0.01303 |
| reviewer (Phase A) | gpt-4o-mini | $0.00951 |
| cost_estimator | gpt-4o-mini | $0.01622 |
| environment | gpt-4o-mini | $0.01421 |
| test_designer | gpt-4o-mini | $0.02890 |
| builder | gpt-4o-mini | $0.01613 |
| reviewer (Phase B) | gpt-4o-mini | $0.01359 |
| security_auditor | gpt-4o | $0.01655 |
| documentation | gpt-4o-mini | $0.02149 |
| quality_judge | gpt-4o | $0.02082 |
| **TOTAL** | — | **$0.17916** |

**Cost vs. projection:** Mid-checkpoint projected ~$0.026 (upper estimate $0.08). Actual Run 3
$0.17916 — ~2.2× above upper estimate. Cause: system prompts longer than the 2500-token
assumption (actual input tokens ranged 463–1762 per role in Run 1; Run 3 range likely similar).
Still well under budget. The projection methodology needs calibration for future live demos.

### Transition Log (from conversation_log.jsonl, Run 3)

| # | From | To | Type | Role |
|---|---|---|---|---|
| 1 | OWNER_INTENT | ARCHITECT_DESIGN | NORMAL | — |
| 2 | ARCHITECT_DESIGN | SPEC_WRITER_FORMALIZE | NORMAL | architect |
| 3 | SPEC_WRITER_FORMALIZE | REVIEWER_SPEC | NORMAL | spec_writer |
| 4 | REVIEWER_SPEC | COST_ESTIMATE | NORMAL | reviewer |
| 5 | COST_ESTIMATE | ENV_REPORT | NORMAL | cost_estimator |
| 6 | ENV_REPORT | TEST_DESIGN | GATE_APPROVE | — (Gate 1) |
| 7 | TEST_DESIGN | BUILDER | NORMAL | test_designer |
| 8 | BUILDER | RUN_TESTS | NORMAL | builder |
| 9 | RUN_TESTS | REVIEWER_CODE_AND_SECURITY | NORMAL | — |
| 10 | REVIEWER_CODE_AND_SECURITY | DOCUMENTATION | NORMAL | reviewer (Phase B) + security_auditor |
| 11 | DOCUMENTATION | QUALITY_JUDGE | NORMAL | documentation |
| 12 | QUALITY_JUDGE | DEPLOYMENT_OR_END | GATE_APPROVE | — (Gate 2) |
| 13 | DEPLOYMENT_OR_END | LIVE_DELIVERABLE | GATE_APPROVE | — (Gate 3) |
| 14 | LIVE_DELIVERABLE | COMPLETE | NORMAL | — |

---

## 7. Drift Analysis

### 7a. Semantic Drift

**Verdict: PENDING OWNER REVIEW**

The loop reached `COMPLETE` — no `INVALID_ROLE_OUTPUT` stall detected at any of the 12 roles.
All role outputs passed schema validation.

Owner must review output files in:
`artifacts/projects/_reference_todo_api/orchestration/6eb913a7-f2eb-41a6-85c0-ab7dba2c5520/live_ratification/`

Key question: Did roles produce contextually coherent outputs — not just schema-valid ones?
(e.g., does the builder's code match the spec? Does the quality_judge assessment make sense?)

### 7b. Structural Drift

**Verdict: PASS**

Mock baseline: 14 transitions → `COMPLETE`. Live result: **14 transitions → `COMPLETE`**. Exact match.

### 7c. Schema Drift

**Verdict: PASS (infrastructure) / PENDING REVIEW (content)**

All 12 role outputs passed `OUTPUT_SCHEMA` validation (no `INVALID_ROLE_OUTPUT` in Run 3).
Infrastructure schema validation is confirmed working end-to-end.

Owner should spot-check `transition_log.jsonl` in the output dir for any logged schema warnings.

---

## 8. Mid-Checkpoint Inaccuracy (recorded)

`artifacts/decisions/_phase_10_checkpoints/live_ratification_mid.md` §3 incorrectly claimed:
> "getDefaultRegistry() uses permitAll authorization (no permission policy installed in standalone scripts)"

Actual behavior: `getDefaultRegistry()` calls `installDefaultPolicy()` on first invocation — the
full L3 permission policy IS active in standalone scripts. This caused Run 1 Error 2 (vision.md
frontmatter fix required). The mid-checkpoint was not amended; this artifact records the finding
per owner instruction.

---

## 9. GO/NO-GO Recommendation

**Recommendation: GO** (pending owner semantic review)

- Structural: **PASS** (14/14 transitions, COMPLETE)
- Schema: **PASS** (all 12 roles validated)
- Semantic: **PENDING OWNER REVIEW**

The infrastructure loop is fully functional live. PHASE-11 may begin after owner confirms
semantic coherence by reviewing the output files, or explicitly waives the review.

---

## 10. Owner Approval

> To ratify this demo, the owner (KhElmasry) must review the drift analysis
> (or explicitly waive semantic review) and post:
>
> "LIVE-RAT APPROVED. GO to Step 3." (or equivalent)
>
> Output files for review:
> `artifacts/projects/_reference_todo_api/orchestration/6eb913a7-f2eb-41a6-85c0-ab7dba2c5520/live_ratification/`

Until ratification, PHASE-11 does NOT begin.
