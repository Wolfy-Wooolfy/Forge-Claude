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

---

## 11. CLOSURE (PHASE-29 CLOSED)

**Status:** CLOSED  
**Gate #10 run ts:** 2026-06-10T14:49:21Z  
**Verdict:** PASS — branch FAIL_TO_BUILDER (per RULING-3)

### §7 Refinement (RULING-3 verbatim)
> Gate PASS = deps actually installed (real npm, exit 0) + plan bridged to forge_tests/scenarios + builtproject.run_scenarios executed against the real built server + last_report.json on disk + the bridge behaved correctly per the report: if report PASS → loop at REVIEWER_CODE_AND_SECURITY; if report FAIL → loop at BUILDER with a LOOP_BACK audit row (from_state RUN_TESTS) and iteration_count incremented. EITHER branch satisfies the gate when behavior matches the report. Likely reality: T-3/T-4 rely on fixture (inert in the runner) → expect a FAIL report → loop-back branch — that is a bonus real-path exercise of the fail path, not a gate failure. Record "harness fixture support" as Finding #4 (deferred). sqlite3: real npm install per v1 policy; if DEPS_INSTALL_FAILED on the real machine, surface it and STOP (decision point).

### Gate #10 execution summary
- **npm_install_exit:** 0 (express + express-validator + sqlite3 ALL installed with real native build — v1 policy validated, sqlite3 native build succeeded on owner Windows 10)
- **bridged_count:** 6/6 scenarios bridged, all required-fields valid
- **last_report (verbatim):** `{ "total": 6, "pass": 1, "fail": 5, "error": 0, "overall_status": "FAIL" }`
- **per-scenario table:**

| ID  | Name                             | Status | Root cause |
|-----|----------------------------------|--------|------------|
| T-1 | create_todo_returns_201          | FAIL   | Route at /api/todos; test hits /todos → 404 |
| T-2 | retrieve_todos_returns_array     | FAIL   | Route at /api/todos; test hits /todos → 404 |
| T-3 | update_todo_with_valid_payload   | FAIL   | Route at /api/todos/1; test hits /todos/1 → 404; also fixture `existing_todo` inert |
| T-4 | delete_todo_returns_204          | FAIL   | Route at /api/todos/1; test hits /todos/1 → 404; also fixture `existing_todo` inert |
| T-5 | create_todo_with_invalid_data    | FAIL   | Route at /api/todos; test hits /todos → 404 (expected 400) |
| T-6 | retrieve_nonexistent_todo_returns_404 | **PASS** | /todos/999 not defined → Express default 404; assertion satisfied |

- **branch taken:** FAIL_TO_BUILDER

### First real LOOP_BACK row (verbatim)
```json
{
  "ts": "2026-06-10T14:49:21.210Z",
  "loop_id": "98eae33f-105c-4dbc-8f96-71efbb4827b7",
  "from_state": "RUN_TESTS",
  "to_state": "BUILDER",
  "transition_type": "LOOP_BACK",
  "role_invoked": null,
  "mock": false,
  "cost_usd": 0,
  "owner_gate_id": 2
}
```
**`from_state: "RUN_TESTS"` — RULING-2 proven on real production data.**  
**iteration_count: 0 → 1**

### Root-cause analysis of the FAIL report

**(a) Plan ↔ build entry mismatch:**  
The test_plan was generated against an earlier build attempt (`node src/server.js`). The final PHASE-28 build's entry is `src/index.js` which mounts routes under `/api`. The harness boots `src/server.js` (the stale attempt-2 artefact), which is still present in the workspace and uses the `/api` prefix. The test scenarios target `/todos` (no prefix) → all route lookups return Express default 404. This is a BUILD/plan coherence defect, not a bridge defect.

**(b) Inert fixtures (Finding #4):**  
T-3 and T-4 use `fixture: "existing_todo"`. The `builtproject.run_scenarios` runner ignores `fixture` fields (no database seeding). Even with correct routes, T-3/T-4 would fail because no pre-existing todo with id=1 exists. This is a harness capability gap, not a bridge defect.

**(c) Stale prior-attempt files:**  
`src/server.js` (attempt-2 file) coexists with `src/index.js` (final entry). The plan hardcoded `node src/server.js` rather than deriving the entry from the actual build output. Multiple attempt files in the workspace without cleanup between attempts cause coherence drift.

**The BRIDGE behaved correctly.** It correctly: read test_plan.json; installed deps (npm exit 0, sqlite3 native); bridged 6/6 scenarios; ran builtproject.run_scenarios; received FAIL report; invoked orchestration.loop_back; emitted LOOP_BACK audit row (from_state=RUN_TESTS, mock=false); incremented iteration_count. This is exactly what RUN_TESTS is designed to do — catch build defects and loop-back to BUILDER for correction.

### Findings

**Finding #4 (deferred):** Harness fixture support — `builtproject.run_scenarios` runner ignores `fixture` field. No database seeding for `existing_todo` scenarios. Deferred to PHASE-30+ / iterative-loop work.

**Finding #5 (deferred):** Plan ↔ build entry coherence + workspace hygiene between build attempts. The test plan should derive its server entry from the actual build output (e.g., from `package.json.main` or a canonical `src/index.js` convention). Stale files from earlier build attempts should be cleaned on rebuild (or isolated to attempt subdirectories). Deferred to PHASE-30+ / iterative-loop work.

**Observation (cosmetic, deferred):** The LOOP_BACK audit row hardcodes `owner_gate_id: 2` even for RUN_TESTS-origin loop-backs (Gate 2 = Quality Judge gate). The value is informational and non-blocking. Deferred.

**PHASE-28 Findings #1 + #2 — RESOLVED by this phase:**
- Finding #1: "materializer emits no package.json" → **RESOLVED in PHASE-29** (dep scan + package.json merge in runTests engine path)
- Finding #2: "no dependency-install step in pipeline between BUILDER→RUN_TESTS" → **RESOLVED in PHASE-29** (shell.run_in_workspace npm install in runTests; sqlite3 native install validated, exit 0)

### Evidence
- `artifacts/spikes/gate29_phase29/gate29_result.json` — verdict PASS
- `artifacts/spikes/gate29_phase29/step0_pre_state.json` — current_state=RUN_TESTS, iteration_count=0
- `artifacts/spikes/gate29_phase29/step1_run_tests_result.json` — runTests return shape
- `artifacts/spikes/gate29_phase29/step1a_npm_install.json` — npm install exit 0
- `artifacts/spikes/gate29_phase29/step2_bridged_scenarios.json` — 6/6 bridged, loader-valid
- `artifacts/spikes/gate29_phase29/step3_last_report.json` — last_report verbatim (1/5/0)
- `artifacts/spikes/gate29_phase29/step4_post_state.json` — post_state=BUILDER, iteration_count=1
- `artifacts/spikes/gate29_phase29/step4b_loop_back_row.json` — LOOP_BACK row verbatim

### Closure checklist
- [x] `node bin/forge-test.js` → 285/0/5 (290 total), all PASS
- [x] Decision CLOSED, §11 appended
- [x] Checkpoints: stage_mid.md + stage_final.md (with Gate #10 section)
- [x] `progress/status.json` phase_29 block: CLOSED
- [x] `progress/status.json` top-level: next_phase = PHASE-30-PENDING-DECISION
- [x] `progress/status.json` phase_28.findings_open: #1 and #2 annotated RESOLVED
- [x] Git commit + tag phase-29-complete
