# PHASE-30 MID-CHECKPOINT — stage_mid.md

**Date:** 2026-06-11
**Phase:** PHASE-30 (Test-Loop Convergence — Finding #5)
**Status:** MID-CHECKPOINT PASS — S293–S296 GREEN + zero regressions on S267–S272 / S288–S292

---

## 1. RULING-4 — the ONE authorized engine edit (`buildProject()` in conversationEngine.js)

Inserted after materialize success, BEFORE `advance_state` (per ruling, fail-closed):

```js
      // Persist the authoritative build record (PHASE-30 RULING-4) — fail-closed:
      // a build whose authoritative record cannot be persisted is not a completed build.
      let manifestWrite = null;
      try {
        manifestWrite = await reg.invoke("fs.write_file", {
          path: "artifacts/projects/" + normalizeProjectId(projectId) +
                "/orchestration/" + loopId + "/build_manifest.json",
          content: JSON.stringify({
            built_at: new Date().toISOString(),
            files:    matOut.files_written
          }, null, 2)
        }, { root });
      } catch {
        manifestWrite = null;
      }
      if (!manifestWrite || manifestWrite.status !== "SUCCESS") {
        return { ok: false, error: "build_error", detail: "MANIFEST_WRITE_FAILED" };
      }
```

- `files` = FULL `files_written` objects ({path, sha256, line_count}) per RULING-4 delta (1).
- Fail-closed per RULING-4 delta (2): write throw/not-ok → `{ ok:false, error:"build_error", detail:"MANIFEST_WRITE_FAILED" }`, NO advance_state.
- No other engine file touched: materializerEngine.js, iteration_controller.js, apiServer.js, harness_runner.js all read-only (verified — zero edits this phase).

## 2. Bridge-side changes — all inside `runTests()` (conversationEngine.js)

**(a) Sub-step 0 — entry derivation (new, before dep install):**
- Reads `orchestration/<loopId>/build_manifest.json` via `reg.invoke("fs.read_file")`.
- `manifestPresent` → candidates restricted to `manifest.files[].path` ONLY.
- Priority: `src/index.js → src/server.js → src/app.js → index.js → server.js → app.js`.
- No priority match → fallback: manifest .js files whose content contains `".listen("`
  (read via reg.invoke); exactly 1 → derived; 0 or >1 → unresolved.
- Manifest present + unresolved → `{ ok:false, error:"test_error", detail:"ENTRY_UNRESOLVED" }`,
  no state transition, nothing written (fires before package.json write & scenario writes).
- **Declared semantics (CTO note):** manifest file present but JSON-unparseable, or
  `files` not an array → treated as present-with-zero-candidates → ENTRY_UNRESOLVED
  (fail-closed). A corrupt authoritative record never silently falls back to legacy.
- Manifest ABSENT → legacy behavior preserved (derivedEntry stays null; rewrite skipped;
  legacy dep-scan path taken).

**(b) Dep-scan scoping (Sub-step 1):** `manifestPresent` → `scanPaths` = manifest .js paths
only; absent → legacy `fs.list_dir`/`fs.glob` scan-all block unchanged (verbatim, just
wrapped in `else`).

**(c) Rewrite (Sub-step 2):** for each bridged scenario, when `derivedEntry` set:
every `setup.actions[type=start_server].command = "node " + derivedEntry`, applied
BEFORE the scenario file write.

**(d) §X.1 incidental (declared):** new test-only hook `_test_skip_npm_exec` — skips ONLY
the `shell.run_in_workspace` npm exec, keeping dep-scan + package.json merge + write.
Required so S293/S294 can assert dep-scan scoping offline ($0, no network). Follows the
established `_test_*` hook convention (`_test_skip_npm_install`, `_test_force_npm_install_fail`,
`_test_force_run_scenarios_result`). Never set in production code.

## 3. Scenarios (4 NEW) + helpers

- `S293_entry_derivation_happy.json` — manifest [src/index.js, src/routes/todos.js] + stale
  src/server.js (left-pad) on disk → commands rewritten to "node src/index.js"; package.json
  has express, NOT left-pad; advanced REVIEWER_CODE_AND_SECURITY.
- `S294_stale_entry_inert.json` — manifest [src/app.js] while stale src/server.js (with
  `.listen(` — would win priority if eligible) exists on disk → derived "node src/app.js";
  stale never selected; left-pad absent from merged package.json.
- `S295_entry_unresolved_fail_closed.json` — manifest [src/helpers/math.js] (no priority
  name, no .listen) → ok:false / error:"test_error" / detail:"ENTRY_UNRESOLVED"; graph still
  RUN_TESTS; forge_tests/scenarios empty.
- `S296_manifest_absent_legacy.json` — no manifest; S288-style flow → advanced; bridged
  commands UNCHANGED ("node server.js" verbatim from plan).
- Helper additions in `run_tests_test_helper.js`: `_writeWorkspaceFile`, `_writeManifest`,
  `_readBridgedCommands`, `_readMergedPkg` + 4 runner functions (same conventions as S288–S292;
  direct fs in test infra per established Track A note in the file header).

## 4. Scenario results (mock provider, $0)

```
✓ S288 ✓ S289 ✓ S290 ✓ S291 ✓ S292   (PHASE-29 — zero regression, incl. S296-relevant legacy identity)
✓ S293 ✓ S294 ✓ S295 ✓ S296          (PHASE-30 — all four NEW green)
ALL PASS — 9 passed, 0 failed (3182ms)

✓ S267 ✓ S268 ✓ S269 ✓ S270 ✓ S271 ✓ S272   (PHASE-24 builder wiring — RULING-4 manifest write
ALL PASS — 6 passed, 0 failed (664ms)          breaks nothing; S270 now also persists a manifest)
```

## 5. Track A

- Engine + bridge changes use `reg.invoke` only (fs.read_file / fs.write_file). No new
  `fs.*Sync` / `child_process` / `fetch(` / `new OpenAI` outside §ARC. §ARC=8. L2 count
  unchanged (80) — no new tools.

## 6. Files modified/created (complete list)

| File | Change |
|------|--------|
| `code/src/ai_os/conversationEngine.js` | RULING-4 manifest write in buildProject(); runTests(): Sub-step 0 entry derivation + dep-scan scoping + command rewrite + `_test_skip_npm_exec` hook |
| `code/src/testing/helpers/run_tests_test_helper.js` | +4 fixtures helpers, +4 runner functions, exports |
| `code/src/testing/scenarios/S293–S296 (4 files)` | NEW |
| `artifacts/decisions/DECISION-2026-06-10-phase-30-test-loop-convergence.md` | created (PART A, verbatim) |
| `artifacts/decisions/_phase_30_checkpoints/stage_mid.md` | this file |

No other files changed.

---

## Next: STEP A (awaiting CTO verify of MID)

- Full suite via Start-Process workaround (expect 289/0/5, 294 total)
- Track A greps + stage_final.md → STOP (no closure)

**WAITING FOR CTO.**
