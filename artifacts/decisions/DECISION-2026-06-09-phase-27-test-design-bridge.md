# DECISION-2026-06-09 — PHASE-27: TEST_DESIGN Bridge

**Status:** APPROVED (owner delegated CTO decision authority — see §9)
**Date:** 2026-06-09
**Relates:** continues the pipeline-bridge sequence after PHASE-26 (ENV_REPORT + Gate 1 — closed @ 2e16643).

## 1. Context (verified against code @ 2e16643)
The owner reaches TEST_DESIGN (PHASE-26 advanced ENV_REPORT → TEST_DESIGN on Gate 1 APPROVE). Verified machinery:
- conversation_graph.js: TEST_DESIGN → BUILDER, trigger "role.invoke(test_designer) → SUCCESS", gate_check: null (NO owner gate).
- test_designer role: input {project_id, spec, design}; output {scenarios[], coverage_summary{acs_total, acs_covered, gaps}}; default provider anthropic/claude-opus-4-7 (Gate #10 overrides to openai/gpt-4o; provider is ctx-overridable).
This is the COST_ESTIMATE pattern (single role, no gate) — the simplest bridge shape.

## 2. Decision
Implement one bridge + one endpoint, mirroring estimateCost():
designTests(): guard TEST_DESIGN; read spec+design; role.invoke(test_designer); persist the test plan to disk; advance TEST_DESIGN → BUILDER (no gate); return the test plan.

## 3. Architecture
- designTests() mirrors estimateCost()/reportEnv() setup: resolve project_id+loop_id; get_status guard current_state==="TEST_DESIGN" (else WRONG_STATE, advanced:false); read spec.json + architect_design.json via reg.invoke("fs.read_file") (INPUT_NOT_FOUND if missing); role.invoke("test_designer", {project_id, spec, design}) (provider openai/gpt-4o default + optional scenario_id for mock).
- On SUCCESS: persist the test plan to artifacts/projects/<projectId>/orchestration/<loopId>/test_plan.json via reg.invoke("fs.write_file") (Refinement — consistent with PHASE-26 env_report.json; the plan is needed downstream by RUN_TESTS); then reg.invoke("orchestration.advance_state", {loop_id, to:"BUILDER", transition_type:"NORMAL", role_invoked:"test_designer"}); return {ok:true, loop_id, advanced:true, advanced_to:"BUILDER", test_plan, model_used}.
- Non-SUCCESS → {ok:true, ..., test_error:"TEST_DESIGN_FAILED", advanced:false}.

## 4. Endpoint
One new route in apiServer.js mirroring the existing pattern:
- POST /api/ai-os/project/design-tests → conversationEngine.designTests(body)

## 5. Track A
No new fs.*Sync / child_process / fetch() / new OpenAI(). reg.invoke for side effects; role.invoke for the LLM call. §ARC stays 8 — new exception → STOP. NO new L2 tool. Do not expand conversationEngine.js ~48/~751.

## 6. Scope boundaries
IN: designTests bridge + endpoint + scenarios + decision/checkpoint/status.
OUT (future): buildProject endpoint (PHASE-28). No UI rework beyond the minimal call to drive the endpoint for Gate #10.

## 7. Acceptance gate (deterministic)
- ≥4 mock scenarios: design-tests happy (advances to BUILDER, test_plan present + persisted) / wrong-state (WRONG_STATE) / input-missing (INPUT_NOT_FOUND) / role-failure (TEST_DESIGN_FAILED, no advance).
- Full SU suite green on Windows (exact counts; no new fails).
- Track A clean; §ARC=8.
- This decision CLOSED; stage_final checkpoint; status.json phase_27 block (l2_tools 79, agent_roles 13, arc_ledger_count 8).
- Gate #10 (real owner test, NOT delegated): owner drives design-tests on the real path (real gpt-4o test plan) → loop advances to BUILDER; on-disk evidence (gate result json + ledger entry, role=test_designer) written; CTO independently verifies.

## 8. Cost budget
Mock-only in dev. Gate #10 one real test_designer run (~$0.01–0.02). Kill bar $3.00. No real calls before Gate #10, owner confirmation then.

## 9. Authority
Owner (Khaled) delegated PHASE-27 decision authority to the CTO advisor on 2026-06-09 ("انت CTO المشروع قرر بنفسك ونفّذ بشرط يكون باعلى درجات الاحترافية"). CTO selected this scope. Delegation covers decision/scope only; Gate #10 remains a real owner test.

## 10. Forward path (context, not in scope)
27 (this) → 28 (buildProject endpoint — wire the existing PHASE-24 buildProject). After 28: owner goes idea → real, running, materialized build end-to-end.
