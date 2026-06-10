# DECISION-2026-06-10 — PHASE-28: buildProject Endpoint (final bridge)

**Status:** APPROVED (owner delegated CTO decision authority — see §9)
**Date:** 2026-06-10
**Relates:** final phase of the bridge sequence (24→25→26→27). Closes the owner path: idea → real materialized build.

## 1. Context (verified against code @ f0cbd51)
- buildProject() (PHASE-24) exists in conversationEngine.js, exported, fully scenario-covered (S267–S272): guards current_state==="BUILDER"; reads spec.json + architect_design.json; role.invoke(builder) → builder.materialize (real sha256 files) → advance BUILDER → RUN_TESTS. Body params: project_id, loop_id, build_provider/build_model/build_scenario_id, mat_provider/mat_model/mat_scenario_id — defaults openai/gpt-4o. Error shapes: WRONG_STATE / SPEC_NOT_FOUND / DESIGN_NOT_FOUND / BUILDER_* / etc.
- conversation_graph.js: BUILDER → RUN_TESTS, trigger role.invoke(builder) → SUCCESS, gate_check: null.
- NO /build-project endpoint exists. PHASE-27 left the loop at BUILDER — exactly the state buildProject guards.

## 2. Decision
Wire ONE endpoint — POST /api/ai-os/project/build-project → conversationEngine.buildProject(body) — mirroring the established pattern. NO changes to buildProject() itself (frozen since PHASE-24; S92–S95 + S267–S272 must stay green untouched).

## 3. Scenarios policy (explicit)
No new SU scenarios. Rationale: the engine function is already deterministically covered by S267–S272 (happy/path-safety/parse-fail/wiring/smoke-fail/multi-file); the endpoint is a 4-line mirror block identical in shape to the five existing verified bridge endpoints; and server-boot scenario types (S120-class) are the known flaky family — adding more increases flake risk for zero new engine coverage. The endpoint is proven by Gate #10 on the real path. The deterministic acceptance is: full suite stays exactly green with zero regressions.

## 4. Gate #10 — FULL-CHAIN owner test (the milestone)
PRIMARY: one script walks the ENTIRE wired owner path with REAL gpt-4o at every LLM hop (no scenario_id anywhere), single canonical project phase28_gate10, locked vision.md first:
  earliest wired entry (confirmed in §0) → … → formalize-spec → review-spec → estimate-cost → report-env → respond-gate APPROVE → design-tests → build-project → materialized files on disk (real sha256) → shell.run_in_workspace executes the build's entry file → expected stdout.
Assertions: state advances correctly at every hop (independent get_status reads); final loop state RUN_TESTS; materialized files exist with sha256 ≠ "pending"; run output matches; ledger contains one real openai/gpt-4o entry per role invoked (spec_writer/reviewer/cost_estimator/environment/test_designer/builder/materializer as applicable); total_usd ≤ $1.00.
FALLBACK (only if §0 proves the pre-COST_ESTIMATE chain cannot produce spec.json + architect_design.json via wired endpoints): seed spec+design at COST_ESTIMATE, then run the real chain estimate-cost → report-env → respond-gate → design-tests → build-project → run output. The fallback choice and its reason must be recorded in the decision before STEP B.
Evidence: artifacts/spikes/gate28_phase28/gate28_result.json + per-hop step files (state reads, ledger, run output).

## 5. Track A
No new fs.*Sync / child_process / fetch() / new OpenAI(). §ARC stays 8. NO new L2 tool. No engine edits.

## 6. Scope boundaries
IN: the endpoint + decision/checkpoint/status + Gate #10 full-chain script.
OUT: RUN_TESTS bridge and anything beyond (future phases); UI rework; provider switch to Anthropic (separate decision).

## 7. Acceptance gate (deterministic)
- Full SU suite green on Windows, zero regressions (exact counts recorded; expected 280/0/5, 285).
- Track A clean; §ARC=8; no engine diffs (buildProject untouched — verified by diff).
- Decision CLOSED; stage_final checkpoint; status.json phase_28 block (l2_tools 79, agent_roles 13, arc_ledger_count 8).
- Gate #10 FULL-CHAIN PASS per §4, evidence on disk, CTO independently verifies.

## 8. Cost budget
Mock-only in dev. Gate #10 is multi-call real gpt-4o (~6–8 calls, ~$0.10–$0.20 expected). Kill bar $3.00. No real calls before Gate #10, owner confirmation then.

## 9. Authority
Owner (Khaled) delegated decision authority on 2026-06-09 ("انت CTO المشروع قرر بنفسك ونفّذ بشرط يكون باعلى درجات الاحترافية"). CTO selected this scope. Gate #10 remains a real owner test.

## 10. After this phase
Owner reaches: idea → spec → review → cost → env + approval → test plan → REAL materialized running build. Remaining future work (separate decisions): RUN_TESTS onward, provider switch to Anthropic, §ARC ledger/code-marks reconciliation, S17/S28-class flake hardening.
