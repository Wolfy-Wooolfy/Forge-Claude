# PHASE-29 STEP A — stage_final.md

**Date:** 2026-06-10  
**Phase:** PHASE-29 (RUN_TESTS Bridge)  
**Status:** FULLY CLOSED — Gate #10 PASS (2026-06-10T14:49:21Z)

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

---

## STEP B — Gate #10 PASS (2026-06-10T14:49:21Z)

**Branch taken:** FAIL_TO_BUILDER (per RULING-3 — report FAIL → loop-back, Gate PASS)

### Report table

| ID  | Name                                   | Status |
|-----|----------------------------------------|--------|
| T-1 | create_todo_returns_201                | FAIL (route /api/todos vs /todos) |
| T-2 | retrieve_todos_returns_array           | FAIL (route /api/todos vs /todos) |
| T-3 | update_todo_with_valid_payload         | FAIL (route + fixture inert) |
| T-4 | delete_todo_returns_204                | FAIL (route + fixture inert) |
| T-5 | create_todo_with_invalid_data          | FAIL (route /api/todos vs /todos) |
| T-6 | retrieve_nonexistent_todo_returns_404  | **PASS** (Express default 404) |

`total:6 / pass:1 / fail:5 / error:0 / overall_status:FAIL`

### First real LOOP_BACK row
```json
{
  "from_state": "RUN_TESTS", "to_state": "BUILDER",
  "transition_type": "LOOP_BACK", "mock": false,
  "ts": "2026-06-10T14:49:21.210Z", "iteration_count": 0→1
}
```
**RULING-2 proven on real data.**

### Root cause (honest)
The BRIDGE behaved correctly. Build defects caught:
- **(a) Plan↔build entry mismatch:** test_plan hardcodes `node src/server.js`; final build entry is `src/index.js` (mounts routes at `/api`). Stale `src/server.js` was booted → 404s. (Finding #5)
- **(b) Inert fixtures:** T-3/T-4 use `fixture:"existing_todo"` but runner ignores fixture → no db seeding. (Finding #4)

Loop-back to BUILDER is the correct designed response. PHASE-29 proves the bridge catches real build defects.

---

## Ops Note: Full-suite runner on Windows

Running `node bin/forge-test.js` directly via piped wrappers (PowerShell `2>&1`, Bash pipe) causes STATUS_STACK_BUFFER_OVERRUN / OOM kills at ~290 scenarios. **Workaround:** use `Start-Process` with `-RedirectStandardOutput` / `-RedirectStandardError` to a temp file, then read the file. This avoids the pipe-buffer interaction that triggers the crash. Document for future sessions.
