# Stage 11.5 Mid-Checkpoint

**Session:** 2026-05-17
**Checkpoint Type:** §4 Mid-Checkpoint — STOP for owner review before GO LIVE

---

## §1 — Runner: Created ✓

**File:** `code/src/testing/live/stage_11_5_live_runner.js`
**Lines:** 557
**Pattern:** Mirrors Stage 11.4 runner with multi-fixture iteration (for-loop, not forEach).

**Fixtures array:**
| Name | Dir | Expected Domain | run_architect |
|------|-----|-----------------|---------------|
| pycli | `artifacts/test_fixtures/intake/fixture_pycli` | `cli_tool` | true |
| nextjs | `artifacts/test_fixtures/intake/fixture_nextjs` | `web_app` | false |
| gocli | `artifacts/test_fixtures/intake/fixture_gocli` | `cli_tool` | false |

**Cost-capture pattern (OBS-1 mitigation):**
```
const costsThisRun = { pycli: {rv:0, architect:0}, nextjs: {rv:0}, gocli: {rv:0} };
// before each LLM call: read ledger
// after each LLM call: read ledger again, store delta in costsThisRun
// NOT re-read from ledger after npm test (ledger gets truncated)
```

**Kill switches:**
- Per-fixture: $0.30 (configurable via `PER_FIXTURE_CAP_USD`)
- Global (all 3 fixtures): $0.90 (configurable via `GLOBAL_CAP_USD`)

---

## §2 — CLI Entry: Created ✓

**File:** `bin/forge-stage-11-5-live-demo.js`
**Lines:** 359
**Pattern:** Mirrors Stage 11.4 CLI (loadDotEnv via direct fs — permitted pattern).

**Functions:**
- `loadDotEnv()`: reads `.env` directly with `fs.readFileSync` (allowed — not production path)
- `_writeClosureArtifact(result)`: uses `reg.invoke("fs.write_file", ...)` — Track A compliant
- `main()`: validates OPENAI_API_KEY, calls `runStage11_5LiveDemo()`, writes closure artifact, exits 0/1/2

**Closure artifact path:** `artifacts/decisions/DECISION-<timestamp>-phase-11-stage-11-5-closure.md`

---

## §3 — Deliverable D: S182 + S183 + Helper Extension ✓

### S182 — Mock E2E Three Fixtures
**File:** `code/src/testing/scenarios/S182_intake_e2e_three_fixtures_mock.json`
**Type:** `module_call` → `intake_test_helper.runS182IntakeE2EThreeFixturesMock`
**Assertions:** pycli_stage_ok, pycli_schema_ok, nextjs_stage_ok, nextjs_schema_ok, nextjs_domain_correct, gocli_stage_ok, gocli_schema_ok, gocli_domain_correct

**Status:** PASSES individually ✓

**Fix applied during session:** Added pre-cleanup step in `_runFixtureMock` helper:
```js
try {
  await reg.invoke("fs.delete_dir",
    { path: "artifacts/projects/" + project_id }, { root: ROOT });
} catch (_e) { /* best-effort */ }
```
Root cause: `project.intake_zip` returns `TARGET_NOT_EMPTY` if artifacts/projects/test_s182_* already exists.

### S183 — PHASE-11 Full Regression
**File:** `code/src/testing/scenarios/S183_phase11_full_regression.json`
**Type:** `module_call` → `intake_test_helper.runS183Phase11FullRegression`
**Assertions:** python/javascript/typescript/go WASM SHA256 ok, role_no_build_prompt, contract ACTIVE for all 4 languages, provider_mock_branch_ok

**Status:** PASSES individually ✓ (pure file inspection, no LLM calls)

### Helper Extension
**File:** `code/src/testing/helpers/intake_test_helper.js`
**Lines before:** ~1126 → **Lines after:** 1262 (+136 lines)
**Added:** `runS182IntakeE2EThreeFixturesMock`, `runS183Phase11FullRegression`, updated exports

---

## §4 — Track A Audit: 0 Violations ✓

```
grep -rn "fs\.writeFileSync|fs\.appendFileSync|fs\.unlinkSync|fs\.mkdirSync|fs\.rmSync|new OpenAI|child_process" \
  code/src/testing/live/stage_11_5_live_runner.js \
  bin/forge-stage-11-5-live-demo.js \
  code/src/testing/helpers/intake_test_helper.js
```

**Result:** Only comment references found (not code). Zero production violations.

---

## §5 — SU Suite Result: 176/2/5 ⚠ BLOCKER

**Target:** 178/0/5
**Actual:** 176 passed / 2 failed / 5 skipped (183 total)
**Duration:** ~268 seconds

**Failing scenarios:**
- ✗ S120 `builtproject.run_scenarios reference project — all 6 scenarios PASS`
- ✗ S124 `builtproject.run_scenarios — scenario_ids empty list runs all scenarios`

---

## §6 — BLOCKER Analysis: S120/S124 PHASE-8 Flakiness

### Root Cause

Both S120 and S124 run `builtproject.run_scenarios` on `artifacts/projects/_reference_todo_api`. Each of the 6 reference project scenarios (T-1 through T-6) starts a fresh `node server.js` process on port 3000, runs HTTP assertions, then stops the server.

The `_stopProcess` function in `code/src/runtime/builtproject/harness_runner.js` (line 162) is **fire-and-forget on Windows**:

```js
function _stopProcess(proc) {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" });
      // ↑ No await. taskkill may not complete before next scenario starts a new server.
```

**Race condition (Windows-specific):**
1. T-3's server is running on port 3000
2. T-3 teardown calls `_stopProcess(proc)` → dispatches `taskkill /f /t <pid>` asynchronously
3. `_stopProcess` returns immediately
4. T-4's `_startServer` spawns a NEW `node server.js` on port 3000
5. T-3's server hasn't fully released port 3000 → new server gets EADDRINUSE and crashes
6. T-4's poll sees port 3000 still responding (T-3's socket in TIME_WAIT) → resolves falsely
7. T-4's HTTP request hits the dying T-3 server → **ECONNRESET**

**Evidence:**
- S120 passes ~1/5 times (timing-dependent)
- Failure always on T-4: `ERROR: HTTP request failed: read ECONNRESET`
- S124 fails when preceded by S120 (two back-to-back runs on same port)
- Both pass when sufficient time elapses between runs

**NOT caused by Stage 11.5 code** — `harness_runner.js` was not modified in this session.
**Pre-existing** — the issue exists in PHASE-8 infrastructure, not in PHASE-11.

### Proposed Fix (2 lines in harness_runner.js)

Make teardown await process exit before returning, so port is fully released:

```diff
--- a/code/src/runtime/builtproject/harness_runner.js
+++ b/code/src/runtime/builtproject/harness_runner.js

-function _stopProcess(proc) {
+function _stopProcess(proc) {
+  return new Promise((resolve) => {
+    proc.once("exit", resolve);
+    proc.once("error", resolve);
+    setTimeout(resolve, 2000); // safety timeout: resolve after 2s regardless
     try {
       if (process.platform === "win32") {
         spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" });
       } else {
         proc.kill("SIGTERM");
       }
     } catch (_) { /* best effort */ }
+  });
 }

 // In runScenario finally block:
-    if (serverProcess) {
-      _stopProcess(serverProcess);
-    }
+    if (serverProcess) {
+      await _stopProcess(serverProcess);
+    }
```

**Impact:** Each test scenario teardown waits up to 2 seconds for the server process to exit cleanly. The 6 scenarios in S120/S124 add at most 12 seconds, but in practice `taskkill /f /t` completes in <200ms, so real overhead is minimal.

**Scope:** BOUNDED to `harness_runner.js` only. No contract changes.

---

## §7 — Cost Projection

**Previous stages' cumulative:** $0.04396
**Stage 11.4 reference (1 fixture: pycli, vision + architect):** $0.01698

**Stage 11.5 projection (3 fixtures):**
| Fixture | Calls | Projection |
|---------|-------|------------|
| pycli | reverse_vision + architect | ~$0.020 |
| nextjs | reverse_vision only | ~$0.009 |
| gocli | reverse_vision only | ~$0.009 |
| **Total** | | **~$0.038** |

**Post-Stage-11.5 cumulative estimate:** ~$0.082
**Remaining hard cap (Stage 11.5 prompt §2):** $0.30 per run / $0.90 total
**Status:** Well within cap — no concern.

---

## §8 — Pre-Flight: Fixture Accessibility ✓

| Fixture | Path | Accessible |
|---------|------|------------|
| pycli | `artifacts/test_fixtures/intake/fixture_pycli/` | ✓ (pyproject.toml, README.md) |
| nextjs | `artifacts/test_fixtures/intake/fixture_nextjs/` | ✓ (app/, README.md) |
| gocli | `artifacts/test_fixtures/intake/fixture_gocli/` | ✓ (cmd/, README.md) |

processIntakeRequest input: `{ directory_path: <abs_path>, project_id }` ✓

---

## §9 — Owner Decision Required

**STOP** — two decisions needed before GO LIVE:

### Decision A: S120/S124 PHASE-8 Fix

**Option 1 (recommended):** Apply the 2-line `_stopProcess` fix to `harness_runner.js`, re-run suite → confirm 178/0/5, then proceed to live demo.

**Option 2 (exception):** Grant explicit exception to the `suite ≠ 178/0/5` STOP trigger — document S120/S124 as pre-existing PHASE-8 flakiness unrelated to Stage 11.5, proceed directly to live demo.

### Decision B: GO LIVE Approval

After Decision A is resolved:
> "GO LIVE Stage 11.5" — triggers `node bin/forge-stage-11-5-live-demo.js`

---

## §10 — Files Written This Session

| File | Status | Lines |
|------|--------|-------|
| `code/src/testing/live/stage_11_5_live_runner.js` | NEW | 557 |
| `bin/forge-stage-11-5-live-demo.js` | NEW | 359 |
| `code/src/testing/scenarios/S182_intake_e2e_three_fixtures_mock.json` | NEW | 22 |
| `code/src/testing/scenarios/S183_phase11_full_regression.json` | NEW | 23 |
| `code/src/testing/helpers/intake_test_helper.js` | EXTENDED | +136 lines |

**NOT YET WRITTEN (pending GO LIVE):**
- Closure decision artifact (auto-written by CLI after live demo)
- INTAKE_CONTRACT §12 addition (Deliverable E)
- progress/status.json update (Deliverable F)
