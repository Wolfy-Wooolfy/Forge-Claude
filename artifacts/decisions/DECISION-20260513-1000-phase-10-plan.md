# DECISION-20260513-1000 — PHASE-10 Binding Plan: Multi-Agent Orchestration Loop

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | **CLOSED** — 2026-05-14 (all 6 stages complete, 151 scenarios PASS) |
| Authority | Layer-0 peer (additive to `DECISION-20260510-vision-shift-multi-agent-conductor.md`) |
| Authored by | Claude (CTO advisor) — Stage 10.0 |
| Prerequisite closed | `DECISION-20260513-0830-phase-10-prereq-CLOSED.md` |
| State count resolution | Step 0 chat — 2026-05-13: 17 state IDs (14 forward + 3 terminal) |

---

## 1. Purpose

This artifact is the binding implementation plan for PHASE-10 — Multi-Agent
Orchestration Loop. It subdivides PHASE-10 into 6 sub-stages, specifies exact
deliverable files, deterministic closure gates, and cost discipline for each.

Authority chain: `DECISION-20260510-vision-shift-multi-agent-conductor.md §5`
→ this plan → `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` (Stage 10.0)
→ conversation_graph.js and peer modules (Stages 10.1–10.5).

Acceptance condition: Owner must reply approval in chat before Stage 10.1 begins.
Until then, this artifact is OWNER_APPROVAL_PENDING and Stage 10.1 is blocked.

---

## 2. The 6 Sub-Stages

### Stage 10.0 — Foundation + Contract (1.5 days) — CURRENT

**Goal.** Establish the authoritative contract document and binding plan before
any implementation code is written. No `.js` files.

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `artifacts/decisions/DECISION-20260513-1000-phase-10-plan.md` | This file |
| 2 | `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md` | New authoritative contract |
| 3 | `artifacts/decisions/_phase_10_checkpoints/stage_10_0_mid.md` | Mid-stage checkpoint |
| 4 | `artifacts/decisions/_phase_10_checkpoints/stage_10_0.md` | Stage closure checkpoint |
| 5 | `progress/status.json` | Patched (additive only — §4 patch) |

**Closure gate (all must pass):**

```
[ ] 1  Decision plan artifact exists at exact path above
[ ] 2  Contract doc exists: ls docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md
[ ] 3  Contract has ≥14 sections: grep -cE "^## " ... ≥ 14
[ ] 4  All 17 state IDs present in contract (14 forward + 3 terminal)
[ ] 5  All JSON schemas use draft-07: grep -c "draft-07" ... ≥ 5
[ ] 6  3 owner gate envelopes defined: grep "gate_id.*[123]" ≥ 3 hits
[ ] 7  Debate protocol section present: grep "## .*[Dd]ebate" ≥ 1 hit
[ ] 8  ITERATION_CAP = 5 encoded: grep "ITERATION_CAP.*5\|cap.*=.*5" ≥ 1 hit
[ ] 9  Stage checkpoint written at exact path above
[ ] 10 progress/status.json current_task = PHASE-10-STAGE-10-0-CLOSED
[ ] 11 orchestration/ dir does NOT exist: ls code/src/runtime/orchestration/ → error
[ ] 12 Baseline: node bin/forge-test.js → 133 PASS / 5 SKIP / 0 FAIL
[ ] 13 Doctor: node bin/forge-doctor.js → 22 PASS / 2 WARN / 0 FAIL
[ ] 14 Cost actuals = $0.00
```

**Depends on:** `DECISION-20260513-0830-phase-10-prereq-CLOSED.md` (CLOSED ✓)

---

### Stage 10.1 — Conversation Graph + Loop State (3 days)

**Goal.** Implement the conversation graph state machine and per-loop state
persistence. First `.js` files for the orchestration module.

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `code/src/runtime/orchestration/conversation_graph.js` | New — state machine |
| 2 | `code/src/runtime/orchestration/loop_state.js` | New — per-loop state persistence |
| 3 | `code/src/runtime/orchestration/_registry.js` | New — module registry + boot validation |
| 4 | `code/src/testing/scenarios/S139_orchestration_state_transitions.json` | New scenario |
| 5 | `code/src/testing/scenarios/S140_loop_state_persists_across_steps.json` | New scenario |
| 6 | `code/src/testing/scenarios/S141_orchestration_boot_validates_17_states.json` | New scenario |
| 7 | `artifacts/decisions/_phase_10_checkpoints/stage_10_1.md` | Stage checkpoint |
| 8 | `progress/status.json` | Patched |

**Closure gate (all must pass):**

```
[ ] 1  conversation_graph.js exports: createLoop, advanceState, getCurrentState, getGraph
[ ] 2  loop_state.js uses tools.fs.write_file (no direct fs.*Sync)
[ ] 3  _registry.js validates 17 state IDs at boot; fails boot on mismatch
[ ] 4  S139: state machine transitions OWNER_INTENT → ... → LIVE_DELIVERABLE (mock, no loop)
[ ] 5  S140: loop state serializes and re-loads correctly across 3 simulated steps
[ ] 6  S141: removing one state ID from _registry causes boot failure (FAIL_CLOSED)
[ ] 7  All 141 scenarios PASS (138 baseline + 3 new) / 5 SKIP / 0 FAIL
[ ] 8  Doctor: 22 PASS / 2 WARN / 0 FAIL (no new checks in this stage)
[ ] 9  Track A grep: grep -rn "fs\.writeFileSync\|fs\.readFileSync" code/src/runtime/orchestration/ → 0
[ ] 10 Cost actuals = $0.00
```

**Depends on:** Stage 10.0 CLOSED + Owner approval of this plan.

---

### Stage 10.2 — Debate Protocol (2 days)

**Goal.** Implement the debate-to-consensus protocol invoked when
Reviewer and Security Auditor disagree. States: PROPOSE → COUNTER →
ARBITRATE → RESOLVED.

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `code/src/runtime/orchestration/debate_protocol.js` | New — debate state machine |
| 2 | `code/src/testing/scenarios/S142_debate_agree_first_round.json` | New scenario |
| 3 | `code/src/testing/scenarios/S143_debate_arbitrate_after_3_rounds.json` | New scenario |
| 4 | `code/src/testing/scenarios/S144_debate_verdict_schema_valid.json` | New scenario |
| 5 | `artifacts/decisions/_phase_10_checkpoints/stage_10_2.md` | Stage checkpoint |
| 6 | `progress/status.json` | Patched |

**Closure gate (all must pass):**

```
[ ] 1  debate_protocol.js exports: runDebate(reviewerOutput, securityOutput, ctx) → DebateVerdict
[ ] 2  DebateVerdict schema: { verdict: AGREE|DISAGREE|ARBITRATED, winning_position, basis, debate_log[] }
[ ] 3  S142: reviewer + security agree on first round → verdict AGREE, 1 round logged
[ ] 4  S143: 3 disagreement rounds → quality_judge arbitrates → verdict ARBITRATED
[ ] 5  S144: DebateVerdict output validates against draft-07 schema defined in contract §5
[ ] 6  All 144 scenarios PASS / 5 SKIP / 0 FAIL
[ ] 7  Doctor: 22 PASS / 2 WARN / 0 FAIL
[ ] 8  Cost actuals = $0.00
```

**Depends on:** Stage 10.1 CLOSED.

---

### Stage 10.3 — Iteration Controller + Approval Gates (2 days)

**Goal.** Implement the iteration controller (cap enforcement + escalation) and
the 3 owner approval gates (blocking, envelope-validated, resumable).

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `code/src/runtime/orchestration/iteration_controller.js` | New — cap + escalation |
| 2 | `code/src/runtime/orchestration/approval_gates.js` | New — 3 owner gates |
| 3 | `code/src/testing/scenarios/S145_iteration_cap_triggers_escalated.json` | New scenario |
| 4 | `code/src/testing/scenarios/S146_owner_gate_1_blocks_until_approve.json` | New scenario |
| 5 | `code/src/testing/scenarios/S147_gate_2_reject_loops_back_to_builder.json` | New scenario |
| 6 | `code/src/testing/scenarios/S148_gate_3_skipped_when_deployment_disabled.json` | New scenario |
| 7 | `artifacts/decisions/_phase_10_checkpoints/stage_10_3.md` | Stage checkpoint |
| 8 | `progress/status.json` | Patched |

**Closure gate (all must pass):**

```
[ ] 1  iteration_controller.js: ITERATION_CAP constant = 5 (literal, not computed)
[ ] 2  On iteration_count > 5: state transitions to ESCALATED, escalation artifact written
[ ] 3  Escalation artifact path: artifacts/projects/<id>/orchestration/escalation_<ts>.md
[ ] 4  approval_gates.js: Gate 1 blocks in ENV_REPORT; Gate 2 blocks in QUALITY_JUDGE;
       Gate 3 skipped when deployment_enabled=false
[ ] 5  OwnerGateEnvelope schema validated against contract §7 draft-07 schema
[ ] 6  S145: 6th iteration triggers ESCALATED (not infinite loop)
[ ] 7  S146: loop halts in ENV_REPORT; FORGE_OWNER_AUTO_APPROVE=1 advances to TEST_DESIGN
[ ] 8  S147: Gate 2 REJECT_AND_LOOP increments iteration_count, returns to BUILDER
[ ] 9  S148: DEPLOYMENT_OR_END with deployment_enabled=false → LIVE_DELIVERABLE (no Gate 3)
[ ] 10 All 148 scenarios PASS / 5 SKIP / 0 FAIL
[ ] 11 Doctor: 22 PASS / 2 WARN / 0 FAIL
[ ] 12 Cost actuals = $0.00
```

**Depends on:** Stage 10.2 CLOSED.

---

### Stage 10.4 — L2 Tools + Doctor Check + PHASE-9 Item 1 (1.5 days)

**Goal.** Register orchestration L2 tools, add doctor check for orchestration
module, and resolve PHASE-9 deferred item 1 (retrieval.js withRetry/withTimeout).

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `code/src/runtime/tools/orchestration_tools.js` | New — L2 tools |
| 2 | `code/src/runtime/doctor/checks/orchestration_runtime.js` | New — doctor check |
| 3 | `code/src/runtime/kb/retrieval.js` | Modified — add withRetry + withTimeout |
| 4 | `code/src/testing/scenarios/S149_orchestration_tools_registered.json` | New scenario |
| 5 | `code/src/testing/scenarios/S150_orchestration_abort_tool_transitions_state.json` | New scenario |
| 6 | `code/src/testing/scenarios/S151_retrieval_withtimeout_honors_budget.json` | New scenario |
| 7 | `artifacts/decisions/_phase_10_checkpoints/stage_10_4.md` | Stage checkpoint |
| 8 | `progress/status.json` | Patched |

**L2 tools registered (orchestration namespace):**

| Tool name | required_mode | Description |
|---|---|---|
| `orchestration.start_loop` | WORKSPACE_WRITE | Initialize a new orchestration loop for a project |
| `orchestration.advance_state` | WORKSPACE_WRITE | Transition to next state (internal, loop-called) |
| `orchestration.respond` | WORKSPACE_WRITE | Owner response to an approval gate |
| `orchestration.abort` | WORKSPACE_WRITE | Owner-initiated loop abort → ABORTED_BY_OWNER |
| `orchestration.get_status` | READ_ONLY | Read current loop state + graph |
| `orchestration.read_log` | READ_ONLY | Read conversation_log.jsonl for a loop |

**Closure gate (all must pass):**

```
[ ] 1  6 orchestration tools registered; boot validation passes
[ ] 2  doctor check orchestration_runtime: PASS when module loaded, FAIL when missing
[ ] 3  retrieval.js: withRetry wraps retrieve() (max 2 attempts, 500ms backoff)
[ ] 4  retrieval.js: withTimeout wraps retrieve() (configurable ms, default 8000)
[ ] 5  retrieval.js: withRetry + withTimeout compose correctly (timeout per attempt)
[ ] 6  tools count: 66 → 72 (6 new orchestration tools; doctor shows 72)
[ ] 7  doctor checks: 24 → 25 (1 new orchestration_runtime check)
[ ] 8  S149: orchestration.start_loop + orchestration.get_status registered in TEST mode
[ ] 9  S150: orchestration.abort transitions loop to ABORTED_BY_OWNER, log preserved
[ ] 10 S151: retrieve() with 50ms timeout fires TimeoutError; withRetry does NOT retry on timeout
[ ] 11 All 151 scenarios PASS / 5 SKIP / 0 FAIL
[ ] 12 Doctor: 23 PASS / 2 WARN / 0 FAIL (orchestration_runtime added)
[ ] 13 Cost actuals = $0.00
```

**PHASE-9 Item 1 scope (exact, no more):**
- `code/src/runtime/kb/retrieval.js`: add `withRetry(fn, maxAttempts=2, backoffMs=500)` and
  `withTimeout(fn, timeoutMs=8000)` helper wrappers. Apply to `retrieve()` call site.
- No other retrieval.js changes. No schema changes. No new scenarios beyond S151.

**Depends on:** Stage 10.3 CLOSED.

---

### Stage 10.5 — End-to-End Demo + Closure (2.5 days)

**Goal.** Run the full 14-step orchestration loop end-to-end on the
`_reference_todo_api` demo project using mock providers. Verify all 3 owner
gates fire, debate protocol resolves, iteration cap enforces, audit trail
is complete.

**Demo project:** `_reference_todo_api` (vision_locked: true, already exists).
The loop operates on this project. No code is generated (Builder mock returns
pre-scripted output). The purpose is to prove the orchestration infrastructure
is correct, not to produce a production build.

**Deliverable files (exact paths):**

| # | Path | Type |
|---|---|---|
| 1 | `code/src/testing/scenarios/S152_full_loop_mock_no_owner_gates.json` | New — fast path |
| 2 | `code/src/testing/scenarios/S153_full_loop_gate1_approve.json` | New — Gate 1 path |
| 3 | `code/src/testing/scenarios/S154_full_loop_gate2_reject_and_loop.json` | New — reject+loop |
| 4 | `code/src/testing/scenarios/S155_full_loop_debate_arbitration.json` | New — debate path |
| 5 | `code/src/testing/scenarios/S156_full_loop_deployment_disabled.json` | New — no Gate 3 |
| 6 | `artifacts/projects/_reference_todo_api/orchestration/` | New directory (via tool) |
| 7 | `artifacts/decisions/_phase_10_checkpoints/stage_10_5.md` | Stage checkpoint |
| 8 | `artifacts/decisions/DECISION-20260513-1000-phase-10-plan.md` | Update status → CLOSED |
| 9 | `progress/status.json` | Patched — phase_10.status: CLOSED |

**Closure gate (all must pass):**

```
[ ] 1  S152: fast-path loop (no gate blocks, FORGE_OWNER_AUTO_APPROVE=1) completes
         OWNER_INTENT → LIVE_DELIVERABLE → COMPLETE in 14 state transitions
[ ] 2  S153: Gate 1 fires in ENV_REPORT, auto-approve via env, proceeds to TEST_DESIGN
[ ] 3  S154: Gate 2 REJECT_AND_LOOP increments iteration count, loop returns to BUILDER,
         second iteration completes and reaches COMPLETE
[ ] 4  S155: Reviewer + Security disagree → debate runs → Quality Judge arbitrates →
         verdict ARBITRATED in conversation_log
[ ] 5  S156: deployment_enabled=false → Gate 3 skipped → COMPLETE without deploy step
[ ] 6  conversation_log.jsonl present at artifacts/projects/_reference_todo_api/orchestration/
[ ] 7  orchestration_summary.md present in same directory after S152 completes
[ ] 8  All 156 scenarios PASS / 5 SKIP / 0 FAIL
[ ] 9  Doctor: 23 PASS / 2 WARN / 0 FAIL
[ ] 10 Cost actuals = $0.00 (all mock — no real API calls)
[ ] 11 plan status field updated to CLOSED
```

**NOTE (live ratification):** If Khaled wishes to run the loop against a real API
after Stage 10.5 mock closure, a separate decision artifact is required before any
live call is made. Stage 10.5 closure is mock-only. Live ratification does NOT
block PHASE-10 closure.

**Depends on:** Stage 10.4 CLOSED.

---

## 3. Cost Discipline

| Metric | Value |
|---|---|
| Kill-bar (PHASE-10 total) | $3.00 |
| Default mode | Mock-only (`FORGE_MOCK_PROVIDER=1`) |
| Real API calls in Stages 10.0–10.5 | $0.00 (zero, by contract) |
| Live ratification budget (post-closure, separate decision) | TBD at that time |
| Per-stage expected cost | $0.00 |

**Rule:** Any live API call in Stages 10.0–10.5 is a §4 STOP-AND-REPORT trigger.
No scenario in these stages requires a live call. If a scenario produces non-zero
cost, halt and report before continuing.

---

## 4. Demo Project

**Project:** `_reference_todo_api`
**Location:** `artifacts/projects/_reference_todo_api/`
**Vision status:** `vision_locked: true` (already set)
**Role in Stage 10.5:** The loop's `project_id` target. All orchestration
artifacts (conversation_log.jsonl, orchestration_summary.md, escalation files
if triggered) land in `artifacts/projects/_reference_todo_api/orchestration/`.

No modifications to `_reference_todo_api`'s vision.md or code are permitted
during Stage 10.5. The demo project is a read-only execution target.

---

## 5. PHASE-9 Deferred Items — Disposition

Numbering follows `status.json.phase_9.deferred_to_phase_10` exactly (Items 1, 3, 6).

| Item (status.json) | Description | Disposition |
|---|---|---|
| **Item 1** | `retrieval.js` withRetry/withTimeout | **Absorbed into Stage 10.4.** Exact scope: add `withRetry` + `withTimeout` wrappers to `retrieve()` call site only. No other changes. Stage 10.4 closure removes Item 1 from `deferred_to_phase_10` in status.json. |
| **Item 3** | `kb.ingest_url` per-chunk budget check | **Deferred to PHASE-12.** NOT in PHASE-10 scope. Per-chunk budget enforcement at ingestion is a production-hardening concern appropriate for Personal Production Setup. Stays in `deferred_to_phase_10` until PHASE-12. |
| **Item 6** | `kb.retrieve` rejected_low_credibility metadata in research_role | **FIXED in PHASE-9 stage 9.7.** `retrieval.js` now exposes count. No PHASE-10 action required. Stage 10.4 status.json patch will remove Item 6 from `deferred_to_phase_10` to clean up the ledger. |

---

## 6. Track A Discipline (binding for all PHASE-10 stages)

The following rules apply to every file created or modified in Stages 10.1–10.5.
Stage 10.0 is doc-only and cannot violate them. Each stage checkpoint includes
a grep verification that these rules hold.

| Rule | Enforcement |
|---|---|
| No `new OpenAI()` outside `openAiAdapter.js` | `grep -rn "new OpenAI(" code/src/runtime/orchestration/` → 0 |
| No direct `fs.*Sync` outside §ARC modules | `grep -rn "fs\.\(write\|read\|unlink\|rm\)Sync" code/src/runtime/orchestration/` → 0 |
| No direct `fetch()` in orchestration runtime | `grep -rn "^[^/]*fetch(" code/src/runtime/orchestration/` → 0 |
| No `child_process` outside §ARC-3 | `grep -rn "child_process" code/src/runtime/orchestration/` → 0 |
| All side effects via L2 tools | Every persistence path in orchestration code names an L2 tool |
| No new §ARC exceptions | Current 4 §ARC entries stay 4. Any new §ARC needs a dedicated decision artifact + owner approval |

**Current §ARC exceptions (4, unchanged for PHASE-10 — CTO-canonical ledger):**

1. §ARC-1: `code/src/runtime/agents/cost_ledger.js`, `agents/_activity_emitter.js`,
           `agents/_prompt_loader.js`, `agents/_role_registry.js`
           — direct `fs.*` for append-only log writes and role loading infrastructure
2. §ARC-2: `bin/forge-live-smoke.js` (`live_smoke_runner`)
           — direct process/IO for smoke test harness entry point
3. §ARC-3: `code/src/runtime/builtproject/harness_runner.js`
           — direct `child_process.spawn` for subprocess test execution
4. §ARC-4: `code/src/runtime/kb/manifests.js` + `code/src/runtime/kb/cost_ledger.js`
           — direct `fs.*Sync` for atomic KB manifest + ledger operations

> **Drift-detection rule:** If the in-code `§ARC-N Exception` tags in the files above
> drift from this list (files added/removed, new patterns introduced), that drift is itself
> a STOP-AND-REPORT trigger. A reconciliation decision artifact is required before
> PHASE-10 continues past the stage where the drift was detected.

---

## 7. Per-Stage Cost Summary

| Stage | Budget | Expected actual |
|---|---|---|
| 10.0 — Foundation + Contract | $3.00 kill-bar (PHASE-10 envelope) | $0.00 |
| 10.1 — Conversation Graph | $3.00 kill-bar (shared) | $0.00 |
| 10.2 — Debate Protocol | $3.00 kill-bar (shared) | $0.00 |
| 10.3 — Iteration Controller | $3.00 kill-bar (shared) | $0.00 |
| 10.4 — L2 Tools + Doctor + Item 1 | $3.00 kill-bar (shared) | $0.00 |
| 10.5 — End-to-End Demo | $3.00 kill-bar (shared) | $0.00 |
| **PHASE-10 total** | **$3.00 kill-bar** | **$0.00** |

The kill-bar is a shared envelope across all stages. If cumulative cost reaches
$3.00 at any point, halt immediately and report to Khaled.

---

## 8. Acceptance

This plan becomes binding when:

1. Owner replies approval in chat (Khaled in this session).
2. `progress/status.json.phase_10.status` is updated to `IN_PROGRESS` (Stage 10.0 close).
3. Stage 10.1 prompt is delivered and implementation begins.

Until owner approval: this artifact is `OWNER_APPROVAL_PENDING`. Stage 10.1 is
blocked. Stage 10.0 can close (the plan artifact existing is Stage 10.0 criterion 1).

**Closure vs. approval clarification:** Stage 10.0 closes when all 5 deliverables
in §2 Stage 10.0 are written and the 14 closure-gate criteria pass. Owner approval
of THIS plan is a separate gate that blocks Stage 10.1 specifically, not Stage 10.0's
closure. The CTO will confirm both: (a) Stage 10.0 is technically CLOSED, and (b)
Owner has approved this plan, before issuing the Stage 10.1 PROMPT.

---

## 9. Forward Reference

Full contract authority: `docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md`
(written in Stage 10.0, authoritative from Stage 10.0 close onward).

Loop implementation code: `code/src/runtime/orchestration/` (created in Stage 10.1,
does NOT exist in Stage 10.0 — confirmed by Stage 10.0 closure criterion 11).

---

*Authored by Claude (CTO advisor), Stage 10.0 implementation, 2026-05-13.*
*Owner: KhElmasry. Status: OWNER_APPROVAL_PENDING.*
