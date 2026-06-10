# PHASE-29 STEP A — stage_final.md

**Date:** 2026-06-10  
**Phase:** PHASE-29 (RUN_TESTS Bridge)  
**Status:** STEP A complete — Gate #10 pending

---

## STEP A Deliverables

### 1. Endpoint wired — `code/src/workspace/apiServer.js`

4-line block added after `/build-project` block (lines 1925–1931):

```js
      if (req.method === "POST" && pathname === "/api/ai-os/project/run-tests") {
        const body = await readBody(req);
        sendJson(res, 200, await conversationEngine.runTests(body));
        return;
      }
```

Mirror pattern of `/build-project` — exact 4-line structure.

---

### 2. Full SU Suite — FOREGROUND

```
ALL PASS — 285 passed, 0 failed, 5 skipped (290 total)
duration: 957705ms
```

**Zero regressions.** Prior baseline 280/0/5 (285) fully preserved.  
5 new S288–S292 scenarios included and GREEN.

---

### 3. Track A Verification

**apiServer.js new block:**
```
grep -n "run-tests|runTests" apiServer.js
1925: if (req.method === "POST" && pathname === "/api/ai-os/project/run-tests") {
1927: sendJson(res, 200, await conversationEngine.runTests(body));
```

**orchestration_tools.js forbidden patterns:** CLEAN  
(only comment reference, no direct `fs.*`, no `new OpenAI()`, no `child_process`)

**conversationEngine.js `runTests()` forbidden patterns:** CLEAN  
(lines 48 and 751 have pre-existing `fs.readFileSync` in `loadState`/`verifyContent` helpers — not in `runTests`; line 1354 is the `NODE_BUILTINS` string literal for dep scan)

**§ARC=8 — L2 count: 79 → 80** (orchestration.loop_back added)

---

### 4. iteration_controller.js one-liner diff (RULING-2)

```
--- before
+      from_state:      "QUALITY_JUDGE",
+++ after
+      from_state:      graph.current_state,
```

`graph.current_state` holds pre-transition state (e.g., "RUN_TESTS") because `setCurrentState` has not yet been called at the point of `appendAuditRow`. Proven by S291 assertion `audit_loop_back_from_state_run_tests === true`.

---

### 5. Scope Summary — all files modified in PHASE-29 §1

| File | Change |
|------|--------|
| `code/src/runtime/tools/orchestration_tools.js` | +52 lines: `orchestration.loop_back` L2 #80 |
| `code/src/runtime/orchestration/iteration_controller.js` | 1-line: `"QUALITY_JUDGE"` → `graph.current_state` |
| `code/src/ai_os/conversationEngine.js` | +runTests() function + export |
| `code/src/workspace/apiServer.js` | +4 lines: POST /api/ai-os/project/run-tests endpoint |
| `code/src/testing/helpers/run_tests_test_helper.js` | NEW: 5 helper functions |
| `code/src/testing/scenarios/S288–S292 (5 files)` | NEW: mock scenarios |

**No other files changed.** Prior bridges and buildProject proven untouched (suite green).

---

## Next: STEP B — Gate #10

Real `/run-tests` call on `phase28_gate10` project, loop_id `98eae33f-105c-4dbc-8f96-71efbb4827b7`:
- Real npm install (express, express-validator; sqlite3 per v1 policy)
- Plan bridged to forge_tests/scenarios
- builtproject.run_scenarios against real built server
- Either PASS→REVIEWER_CODE_AND_SECURITY or FAIL→BUILDER with LOOP_BACK row (from_state=RUN_TESTS)
- Evidence in `artifacts/spikes/gate29_phase29/gate29_result.json`

**WAITING FOR CTO VERIFY → STEP B**
