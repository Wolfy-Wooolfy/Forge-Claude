# DECISION-2026-06-09 — PHASE-25: COST_ESTIMATE Bridge

**Status:** APPROVED (owner delegated CTO decision authority — see §9)
**Date:** 2026-06-09
**Relates:** continues the pipeline-bridge sequence after PHASE-23 (reviewer spec) and PHASE-24 (BUILDER Materializer, Path A — closed @ 5bf019e).

## 1. Context (verified against code @ HEAD 5bf019e)
Owner-reachable endpoints terminate at REVIEWER_SPEC's output: reviewSpec() advances REVIEWER_SPEC → COST_ESTIMATE and returns; no endpoint advances further. Verified gap (conversation_graph.js):
| Transition | Mechanism | Wired |
|---|---|---|
| REVIEWER_SPEC → COST_ESTIMATE | reviewSpec | ✓ (owner lands here) |
| COST_ESTIMATE → ENV_REPORT | role.invoke(cost_estimator), gate_check:null | ✗ |
| ENV_REPORT → TEST_DESIGN | role.invoke(environment) + Gate 1 (owner) | ✗ |
| TEST_DESIGN → BUILDER | role.invoke(test_designer), gate_check:null | ✗ |
| BUILDER → RUN_TESTS | buildProject() (PHASE-24) | engine ✓ / endpoint ✗ (stranded) |
PHASE-24's buildProject() exists in the engine but is not wired to an endpoint and is unreachable via the current state path. Making the materializer owner-reachable requires PHASE-25/26/27 bridges + the BUILDER endpoint (PHASE-28).

## 2. Decision
Implement exactly one bridge: COST_ESTIMATE. New estimateCost() in conversationEngine.js modeled on reviewSpec(), plus its API endpoint. It calls role.invoke(cost_estimator) and, on SUCCESS, advances COST_ESTIMATE → ENV_REPORT (no owner gate on this edge). The cost/effort estimate is returned to the owner.

## 3. Architecture
- async function estimateCost(body={}) in conversationEngine.js, exported alongside confirmIdea/formalizeSpec/reviewSpec/buildProject.
- Resolve project_id + loop_id (same as reviewSpec/buildProject). Read loop status; guard current_state==="COST_ESTIMATE" else {ok:true, loop_id, current_state, estimate_error:"WRONG_STATE", advanced:false}.
- Read spec + design from the loop's orchestration artifacts via reg.invoke("fs.read_file") (same artifacts buildProject reads). Missing → {ok:true, ..., estimate_error:"INPUT_NOT_FOUND", advanced:false}.
- role.invoke("cost_estimator", {project_id, spec, design}) (mock in dev). Non-SUCCESS → {ok:true, ..., estimate_error:"ESTIMATE_FAILED", advanced:false} (no advance).
- SUCCESS → reg.invoke("orchestration.advance_state", {loop_id, to:"ENV_REPORT", ...}); return {ok:true, loop_id, advanced:true, advanced_to:"ENV_REPORT", estimate, model_used}.
- No disk side effects beyond loop state/artifacts via reg.invoke. No new tool.

## 4. Endpoint
One new route in apiServer.js mirroring the reviewSpec route: sendJson(res, 200, await conversationEngine.estimateCost(body)). Route-path consistent with confirm-idea/formalize-spec/review-spec naming.

## 5. Track A
No new fs.*Sync / child_process / fetch() / new OpenAI(). All side effects via reg.invoke; LLM via role.invoke. §ARC ledger frozen at 8 — if a new exception seems needed, STOP, do not implement. Pre-existing fs.*Sync at conversationEngine.js ~48 and ~751 are out of scope (backlog), do not expand.

## 6. Scope boundaries
IN: estimateCost bridge + endpoint + scenarios + decision/checkpoint/status updates.
OUT (future phases): ENV_REPORT bridge + Gate 1 + orchestration.respond endpoint (26); TEST_DESIGN bridge (27); buildProject endpoint wiring (28). No UI rework beyond the minimal call to drive the endpoint for Gate #10.

## 7. Acceptance gate (deterministic)
- ≥4 mock scenarios: happy-path (advances to ENV_REPORT, estimate present) / wrong-state guard / input-missing (INPUT_NOT_FOUND) / role-failure (ESTIMATE_FAILED, no advance).
- Full SU suite green on Windows (record exact pass/fail/skip; no new fails).
- Track A grep clean; §ARC count = 8.
- This decision closed; checkpoint stage_final written; status.json phase_25 block (l2_tools=79, agent_roles=13, arc_ledger_count=8).
- Gate #10 (real owner test, NOT delegated): owner drives the cost-estimate endpoint on the real path with real gpt-4o → real estimate → loop advances to ENV_REPORT; on-disk evidence (gate result json + ledger entry) written; CTO independently verifies.

## 8. Cost budget
Mock-only in dev. Gate #10 one real run (~$0.01 expected). Kill bar $3.00. No real calls before Gate #10, and only with owner confirmation then.

## 9. Authority
Owner (Khaled) delegated PHASE-25 decision authority to the CTO advisor on 2026-06-09 ("انت CTO المشروع قرر بنفسك ونفّذ بشرط يكون باعلى درجات الاحترافية"). CTO selected the COST_ESTIMATE-bridge scope. Delegation covers decision/scope only; Gate #10 remains a real owner test.

## 10. Forward path (context, not in scope)
25 (this) → 26 (ENV_REPORT + Gate 1) → 27 (TEST_DESIGN) → 28 (buildProject endpoint). After 28: owner goes idea → real, running, materialized build end-to-end.
