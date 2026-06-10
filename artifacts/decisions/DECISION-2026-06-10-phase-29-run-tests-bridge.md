# DECISION-2026-06-10 — PHASE-29: RUN_TESTS Bridge + Dependency Install

**Status:** APPROVED (owner delegated CTO decision authority — see §9)
**Date:** 2026-06-10
**Relates:** first post-milestone phase. Closes PHASE-28 findings 1+2 inside the engine and makes the built project VERIFIED, not just materialized.

## 1. Context (verified against code @ 904ae38)
- conversation_graph.js: RUN_TESTS → REVIEWER_CODE_AND_SECURITY, trigger "builtproject.run_scenarios completes", gate_check: null. Fail path machinery exists: iteration_controller.tryAdvanceForLoopBack → BUILDER (LOOP_BACK row, ITERATION_CAP guard, cap-exceeded → ESCALATED).
- L5b tool EXISTS: builtproject_tools.js — builtproject.run_scenarios reads artifacts/projects/<id>/forge_tests/scenarios/, executes them (server boot + HTTP), writes forge_tests/last_report.json.
- PHASE-27 writes the test plan to orchestration/<loopId>/test_plan.json (test_designer schema: scenarios[{id,name,description,category,setup,execution,assertions,teardown,metadata}], coverage_summary). FORMAT BRIDGE between test_plan and forge_tests/scenarios is required and is a §0 question.
- PHASE-28 findings to resolve here: (1) no package.json emitted; (2) no dependency-install step. Finding (3) native deps: v1 policy = attempt real npm install of ALL detected deps (most ship prebuilds); if install fails, the test run fails with a clear reason → normal fail path. The sqlite3 pure-JS stub remains a gate-script-only device, never engine behavior.

## 2. Decision
Implement runTests() in conversationEngine.js + POST /api/ai-os/project/run-tests. On a loop at RUN_TESTS it: (a) installs the built project's dependencies (dep scan → package.json → npm install via shell.run_in_workspace); (b) bridges test_plan.json into forge_tests/scenarios/ in the format builtproject.run_scenarios consumes; (c) invokes builtproject.run_scenarios; (d) on PASS report → advance RUN_TESTS → REVIEWER_CODE_AND_SECURITY; on FAIL report → loop-back to BUILDER via the iteration controller (cap-aware; cap exceeded → ESCALATED). Returns the test report summary + advanced_to.

## 3. Architecture
- runTests(body) mirrors the established bridge skeleton (resolve ids, get_status guard current_state==="RUN_TESTS" else WRONG_STATE; inputs missing → INPUT_NOT_FOUND).
- Dep-install sub-step (productizes the gate-28 workaround, engine-side now): scan materialized source files for require()/import names via reg.invoke fs.glob+fs.read_file; filter Node builtins + relative paths; write package.json via reg.invoke("fs.write_file") (merge if one exists); shell.run_in_workspace ["npm","install","--no-audit","--no-fund"] (npm.cmd fallback on Windows), timeout 180000; install failure → {ok:true, test_error:"DEPS_INSTALL_FAILED", advanced:false} with stderr captured.
- Plan bridge: translate test_plan.json scenarios into forge_tests/scenarios/*.json in the EXACT consumed schema (confirmed in §0). Translation is mechanical (no LLM).
- Run: reg.invoke("builtproject.run_scenarios", ...) → read last_report.json. PASS (0 failed) → reg.invoke advance_state to REVIEWER_CODE_AND_SECURITY (role_invoked:"builtproject"). FAIL → loop-back via the §0-confirmed mechanism; return {ok:true, advanced:true, advanced_to:"BUILDER", loop_back:true, report_summary} (or ESCALATED on cap).
- All side effects via reg.invoke; NO LLM call in this bridge (deterministic phase).
- TOOL EXPOSURE CLAUSE: if §0 finds no existing reg-invokable path to tryAdvanceForLoopBack, expose it as ONE new L2 tool orchestration.loop_back (thin wrapper, no logic) — L2 count 79→80, recorded in closure. If an existing tool covers it, count stays 79. No other new tools.

## 4. Endpoint
POST /api/ai-os/project/run-tests → conversationEngine.runTests(body), inserted after /build-project, same 4-line mirror.

## 5. Track A
reg.invoke only (fs.*, shell.run_in_workspace, builtproject.run_scenarios, orchestration.*). No new fs.*Sync/child_process/fetch/new OpenAI in the bridge. §ARC stays 8. Engine functions from prior phases untouched.

## 6. Scope boundaries
IN: runTests + endpoint + dep-install sub-step + plan bridge + scenarios + decision/checkpoints/status.
OUT: REVIEWER_CODE_AND_SECURITY onward (30+); deploy tools; UI wiring; provider switch; gate-28 finding (3) beyond the v1 policy above.

## 7. Acceptance gate (deterministic)
- ≥5 mock/deterministic scenarios: happy (plan bridged, deps mocked-or-skipped per harness convention, run_scenarios PASS report → advance REVIEWER_CODE_AND_SECURITY) / wrong-state / inputs-missing / failing-report → loop-back to BUILDER with LOOP_BACK row / deps-install-failure → DEPS_INSTALL_FAILED no advance. (Exact mock strategy for run_scenarios/npm confirmed in §0 against harness conventions.)
- Full SU suite green on Windows (exact counts; no new fails; expect 285→~290).
- Track A clean; §ARC=8; prior engine functions untouched.
- Decision CLOSED; stage_mid + stage_final; status.json phase_29 (l2_tools 79 or 80 per §3 clause, agent_roles 13, arc 8).
- Gate #10 (real owner test): run the REAL /run-tests against the EXISTING phase28_gate10 project (loop genuinely at RUN_TESTS with the real PHASE-28 build + test_plan): real npm install (express, express-validator — note: that plan's scenarios target the real server; sqlite3 handling per v1 policy — if the real plan needs sqlite3 and install fails, that is a legitimate gate outcome to surface, not to mock) → real scenario execution against the running built server → report on disk → loop advances to REVIEWER_CODE_AND_SECURITY (or honest fail surfaced). Evidence artifacts/spikes/gate29_phase29/gate29_result.json + step files. Expected LLM cost: $0 (no LLM in this bridge); loop-back path NOT exercised on the real project (covered by mock scenario).
- CTO independently verifies.

## 8. Cost budget
$0 LLM expected (deterministic bridge). Kill bar $3.00 stands. Any unexpected real LLM need → STOP.

## 9. Authority
Owner delegation of 2026-06-09 stands ("انت CTO المشروع قرر بنفسك ونفّذ بشرط يكون باعلى درجات الاحترافية"). Gate #10 remains a real owner test.

## 10. Forward path (context)
29 (this) → 30 REVIEWER_CODE_AND_SECURITY (debate) → 31 DOCUMENTATION → 32 QUALITY_JUDGE + Gate 2 (incl. REJECT_AND_LOOP) → 33 DEPLOYMENT_OR_END + Gate 3 → LIVE_DELIVERABLE → COMPLETE. Parallel decisions pending: provider switch to Anthropic; UI wiring of bridges; §ARC reconciliation; flake hardening.
