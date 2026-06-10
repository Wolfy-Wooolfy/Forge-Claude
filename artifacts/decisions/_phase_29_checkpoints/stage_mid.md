# PHASE-29 MID-CHECKPOINT — stage_mid.md

**Date:** 2026-06-10  
**Phase:** PHASE-29 (RUN_TESTS Bridge)  
**Status:** MID-CHECKPOINT PASS — all 5 mock scenarios GREEN

---

## Files Modified (§1 scope)

### 1. `code/src/runtime/tools/orchestration_tools.js`
- Added `orchestration.loop_back` as L2 tool #80 (thin wrapper over `tryAdvanceForLoopBack`)
- Tool has `preview()` method (required by _contract.js for WORKSPACE_WRITE mode)
- **Bug fixed:** original `execute` returned `escalation_path: null` which failed output_schema
  validation (`type: "string"` rejects null). Fixed to conditionally include `escalation_path`
  only when truthy.

**Diff (execute method):**
```
--- before
+++ after
-      return ok({
-        advanced:        result.advanced,
-        escalated:       result.escalated,
-        escalation_path: result.escalation_path || null
-      });
+      const output = { advanced: result.advanced, escalated: result.escalated };
+      if (result.escalation_path) output.escalation_path = result.escalation_path;
+      return ok(output);
```

### 2. `code/src/runtime/orchestration/iteration_controller.js` (RULING-2 one-liner)
```
--- before (line ~140)
+  from_state:      "QUALITY_JUDGE",
+++ after
+  from_state:      graph.current_state,
```
`graph.current_state` holds the pre-transition state (e.g., "RUN_TESTS") at the time of appending
the LOOP_BACK audit row — before `setCurrentState("BUILDER")` is called.

### 3. `code/src/ai_os/conversationEngine.js`
- Added `runTests()` function (RUN_TESTS bridge, deterministic, no LLM)
- Added `runTests` to module.exports

### 4. `code/src/testing/helpers/run_tests_test_helper.js` (NEW)
- 5 helper functions: `runS288HappyPath`, `runS289WrongState`, `runS290InputNotFound`,
  `runS291FailReportLoopBack`, `runS292DepsInstallFailed`
- `_seedLoopAtRunTests` seeds loop through all states to RUN_TESTS
- S291 verifies RULING-2: `audit_row.from_state === "RUN_TESTS"`

### 5. Scenarios (NEW — 5 files):
- `S288_run_tests_happy_path.json`
- `S289_run_tests_wrong_state.json`
- `S290_run_tests_input_not_found.json`
- `S291_run_tests_fail_report_loop_back.json`
- `S292_run_tests_deps_install_failed.json`

---

## Scenario Results

```
✓  S288   happy-path (PASS report → REVIEWER_CODE_AND_SECURITY)
✓  S289   wrong-state guard (BUILDER state → WRONG_STATE, no advance)
✓  S290   input-missing (no test_plan.json → INPUT_NOT_FOUND, no advance)
✓  S291   FAIL report → BUILDER loop-back, from_state=RUN_TESTS, iteration_count+1
✓  S292   deps-install-failure → DEPS_INSTALL_FAILED, no advance, state stays RUN_TESTS

ALL PASS — 5 passed, 0 failed, 0 skipped (5 total)
duration: 2364ms
```

---

## RULING-2 Compliance

S291 asserts:
- `advanced_to_builder: true` (advanced to BUILDER) ✓
- `iteration_count_incremented: true` (iteration_count went from 0 → 1) ✓
- `audit_loop_back_from_state_run_tests: true` (LOOP_BACK row has `from_state === "RUN_TESTS"`) ✓

The one-line fix in `iteration_controller.js` (`from_state: graph.current_state`) is proven by S291.

---

## Track A Compliance

- All orchestration state mutations via `reg.invoke(...)` only
- No `fs.*Sync`, `child_process`, or `new OpenAI()` in new code
- §ARC=8 (L2 count: 79 → 80)

---

## Open Finding

**Finding #4** (from RULING-3, deferred): Test plan fixture fields (`fixture`, `metadata`) are
preserved as passthrough in the bridge — but the `builtproject.run_scenarios` runner ignores them.
Not a bug, but the harness doesn't test fixture-based scenarios. Deferred to Gate #10 observation.

---

## Next: STEP A (awaiting CTO GO)

- Wire `/api/ai-os/project/run-tests` endpoint in `apiServer.js`
- Run full suite (expect ~285+5 = 290 scenarios, all pass)
- Track A verification (hash/diff proof)
- Write `stage_final.md` → STOP

**WAITING FOR CTO GO.**
