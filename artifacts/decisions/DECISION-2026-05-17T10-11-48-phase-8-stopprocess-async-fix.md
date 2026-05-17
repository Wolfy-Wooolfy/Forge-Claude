# DECISION — PHASE-8 Hotfix: _stopProcess Async Fix

**Artifact:** DECISION-2026-05-17T10-11-48-phase-8-stopprocess-async-fix.md
**Date:** 2026-05-17
**Phase attribution:** Bug originated PHASE-8 / Fix applied during PHASE-11.5
**Status:** OWNER_DECISION_PENDING (ratification alongside Stage 11.5 closure)

---

## §1 Bug Description

`code/src/runtime/builtproject/harness_runner.js` — `_stopProcess()` function used fire-and-forget `taskkill` on Windows. When two consecutive `builtproject.run_scenarios` invocations both start servers on port 3000, the first server's port was not released before the second server spawned, causing `ECONNRESET` on T-4 of the reference todo API test suite.

**Manifestation:** S120 and S124 failed intermittently (~4/5 runs) in the full SU suite on Windows. Both passed individually when run in isolation with sufficient delay between runs. Surfaced on new machine during Stage 11.5 validation.

## §2 Root Cause

Each L5b test scenario (T-1 through T-6) independently starts and stops `node server.js` on port 3000. The original `_stopProcess` dispatched `taskkill /pid <pid> /f /t` synchronously (fire-and-forget — no `await`). The taskkill OS call completed asynchronously; by the time the next scenario's `_startServer` spawned a new server, port 3000 was still held by the dying process. The `_startServer` poll saw the old server responding on port 3000 and resolved prematurely, sending the next scenario's HTTP request to the zombie connection → `ECONNRESET`.

## §3 Fix

**File:** `code/src/runtime/builtproject/harness_runner.js`
**Lines changed:** `_stopProcess` (162→174), teardown call (114), timeout path (148)

```diff
-function _stopProcess(proc) {
-  try {
-    if (process.platform === "win32") {
-      spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" });
-    } else {
-      proc.kill("SIGTERM");
-    }
-  } catch (_) { /* best effort */ }
-}
+function _stopProcess(proc) {
+  return new Promise((resolve) => {
+    proc.once("exit", resolve);
+    proc.once("error", resolve);
+    setTimeout(resolve, 2000); // safety timeout: Windows taskkill is async
+    try {
+      if (process.platform === "win32") {
+        spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" });
+      } else {
+        proc.kill("SIGTERM");
+      }
+    } catch (_) { /* best effort */ }
+  });
+}
```

Call sites updated to `await _stopProcess(...)` — line 114 (teardown in `runScenario` finally) and line 148 (timeout path in `_startServer` setInterval callback).

No other files modified. Scope bounded to `harness_runner.js` per owner instruction.

## §4 Verification

| Check | Result |
|-------|--------|
| `node --check harness_runner.js` | SYNTAX OK |
| S120 isolation | PASS (11.9s) |
| S124 isolation | PASS (13.4s) |
| S120 → S124 sequential (reproduction pattern) | BOTH PASS |
| S119, S120, S123, S124, S128 cluster | ALL PASS (5/5) |
| Full SU suite | **178 PASS / 0 FAIL / 5 SKIP** |
| Track A (child_process) | §ARC-3 exemption — no new violations |

## §5 Why During Stage 11.5

The bug existed since PHASE-8 but was masked on the original development machine due to faster process cleanup timing. The new machine where Stage 11.5 validation runs has different OS scheduling characteristics (Windows process teardown timing varies by machine/load), making the race condition consistently reproducible. The bug was always present; the new machine made it visible.

## §6 Phase Attribution

- **Bug origin:** PHASE-8 (Built-Project Test Harness, `harness_runner.js`)
- **Surfaced:** PHASE-11.5 validation (Stage 11.5 SU suite run on new machine)
- **Fix applied:** PHASE-11.5 (as discovered, no further phase impact)
- **Scope:** No impact on PHASE-11 features — `harness_runner.js` is test infrastructure only

## §7 Owner Approval

**Status:** OWNER_DECISION_PENDING

To ratify: owner confirms "PHASE-8 _stopProcess fix APPROVED" in the Stage 11.5 closure ratification message. No separate ratification message required — single ratification covers both Stage 11.5 closure and this hotfix.
