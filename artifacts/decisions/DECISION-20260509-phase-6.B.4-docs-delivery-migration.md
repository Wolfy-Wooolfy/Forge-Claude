# DECISION-20260509-phase-6.B.4-docs-delivery-migration

**Date:** 2026-05-09
**Status:** CLOSED — exit report: artifacts/decisions/PHASE-6.B.4-exit-report.md
**Phase:** PHASE-6.B.4
**Related:** DECISION-20260509-phase-6.B.3-engine-migration

---

## Context

PHASE-6.B.3 migrated ideationEngine + businessAnalysisEngine with full coverage.
PHASE-6.B.4 migrates 3 engines in the documentation/delivery cluster:
`documentationBuildLoop`, `documentationReviewEngine`, `deliveryPackageBuilder`.

Two infrastructure adjustments needed:
1. `documentationBuildLoop.js` has helpers (ensureDir, writeJson, nowIso, readJsonSafe)
   at module-level — inconsistent with all other engines and incompatible with
   `getDefaultRegistry()` (needs runtime `root` context).
2. `_runDirectEngine` doesn't support pre-existing fixture files. `documentationReviewEngine`
   has a hard guard on `draft.md` existence; S18 needs `fixture_files` support.

---

## Bug-11 (PHASE-6.B.3 debt)

`test_harness_meta.js` has hardcoded count 13. PHASE-6.B.3 added S14/S15/S16 (total=16)
but did not update `test_harness_meta.js`. PHASE-6.B.3 exit report claimed "5 smoke suites PASS"
— incorrect; actual was 4/5. Surfaced during PHASE-6.B.4 baseline check.
**Fix:** update hardcoded count from 13 → 19 in §3.14 of this phase.

---

## Decisions (8 fronts)

### F1 — documentationBuildLoop.js

- Move `ensureDir`, `readJsonSafe`, `writeJson`, `nowIso` from module-level into closure.
- `STAGES` constant stays at module-level + remains exported (external consumers).
- Add async `writeJson` via `reg.invoke("fs.write_file", ...)`.
- Add async `writeFile` helper for markdown content (non-JSON).
- Remove `ensureDir` (fs.write_file auto-creates parents).
- Add `tryWriteJson` and `tryWriteFile` (best-effort wrappers).
- Convert `saveLoopState` to async.
- Write patterns:
  - **W1** (draft.md): HARD — if write fails, return `ok:false, reason:"DRAFT_PERSIST_FAILED"`
  - **W2** (review log): best-effort — `tryWriteJson`
  - **W3** (loop state via saveLoopState): HARD — propagate failure as `ok:false, reason:"LOOP_STATE_PERSIST_FAILED"`
  - **W4** (report.md): best-effort — `tryWriteFile`

### F2 — documentationReviewEngine.js

Standard pattern (mirror 6.B.3):
- `writeJson` → async via reg.invoke.
- `appendArrayJson` → async; awaits writeJson.
- Remove `ensureDir`.
- `tryAppendArrayJson`, `tryWriteJson` wrappers.
- **W5** (documentation_review_log.json via appendArrayJson): best-effort.
- **W6** (review_report.json via writeJson): best-effort.

### F3 — deliveryPackageBuilder.js

Mixed pattern:
- `writeJson` → async via reg.invoke.
- Add `writeFile` for markdown content.
- Remove `ensureDir`.
- `tryWriteFile`, `tryWriteJson` wrappers.
- **W7** (RUNBOOK.md): best-effort.
- **W8** (delivery_package.json): best-effort.
- **W9** (project_state.json): HARD — if write fails, return `ok:false, reason:"STATE_PERSIST_FAILED"`.

### F4 — scenario_runner.js fixture_files support

After project_state.json fixture creation in `_runDirectEngine`, iterate `scenario.fixture_files`:
```js
if (Array.isArray(scenario.fixture_files) && scenario.fixture_files.length > 0) {
  for (const ff of scenario.fixture_files) {
    if (!ff || typeof ff.path !== "string" || typeof ff.content !== "string") continue;
    const ffPath = path.join(projectDir, ff.path);
    fs.mkdirSync(path.dirname(ffPath), { recursive: true });
    fs.writeFileSync(ffPath, ff.content, "utf8");
  }
}
```
Cleanup: existing recursive `rmSync(projectDir)` in `_cleanup` covers all fixture_files. No extra tracking needed.

### F5 — S17 (direct_engine docBuildLoop, Option B)

Pre-create `draft.md` via `fixture_files` → engine skips DRAFT stage → only invokes review provider.
Mock: content mode with `quality_gate.passed: true` → all stages auto-complete → `DOCUMENTATION_BUILD_COMPLETE`.
Assertions: status=PASS, ok=true, mode=DOCUMENTATION_BUILD_COMPLETE, 3 artifact_exists.

### F6 — S18 (direct_engine docReviewEngine)

`fixture_files` with draft.md. Mock: content mode, quality_gate.passed=true → REVIEW_PASSED.
Assertions: status=PASS, ok=true, mode=REVIEW_PASSED, 2 artifact_exists.

### F7 — S19 (direct_engine deliveryPackageBuilder)

No provider call → no mock. Fixture: `active_runtime_state: "EXECUTION_HANDOFF_CREATED"`.
Assertions: status=PASS, ok=true, mode=DELIVERY_PACKAGE_READY, 2 artifact_exists.

### F8 — Documentation & cleanup

- `test_harness_meta.js`: update hardcoded count 13 → 19 (fixes Bug-11).
- `progress/status.json`: current_task → PHASE-6.B.4-CLOSED, next → PHASE-6.B.5.
- FINDINGS-INFO-3: deliveryPackageBuilder writes `project_state.json`, shared with
  projectRuntime/conversationEngine/activeProjectManager. Safe under single-owner.
- Decision artifact + exit report.

---

## Acceptance Criteria

| AC | Criterion |
|----|-----------|
| AC #1 | `node bin/forge-test.js` → **19 PASS / 0 FAIL / 0 SKIP** |
| AC #2 | S17/S18/S19 each ≥4 assertions, all PASS |
| AC #3 | 0 `fs.writeFileSync\|mkdirSync\|unlinkSync\|rmSync` in 3 target engines |
| AC #4 | `module.exports` from documentationBuildLoop exports `{ createDocumentationBuildLoop, STAGES }` |
| AC #5 | Negative test: disable W5 (review log append) → S18 artifact_exists FAIL → revert → 19/19 |
| AC #6 | L3 reach (S19): READ_ONLY → engine ok:false (W9 HARD denied) + DENIED in audit → revert → 19/19 |
| AC #7 | All 5 smoke suites PASS (incl. test_harness_meta.js with count=19) |
| AC #8 | No leftover `test_engine_*` dirs after harness |
| AC #9 | S01-S16 unchanged, all PASS |
| AC #10 | apiServer.js imports documentationBuildLoop unchanged (public API preserved) |

---

## Rollback

```bash
git checkout HEAD -- code/src/ai_os/documentationBuildLoop.js \
  code/src/ai_os/documentationReviewEngine.js \
  code/src/ai_os/deliveryPackageBuilder.js \
  code/src/testing/scenario_runner.js
rm code/src/testing/scenarios/S1{7,8,9}_*.json
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| R1. Helpers reorg breaks docBuildLoop | No module-level code references helpers today; only STAGES is exported and stays put |
| R2. S17 dual-mock | Resolved by Option B (pre-create draft.md as fixture_file) |
| R3. fixture_files cleanup | Recursive rmSync covers arbitrary subtree ✓ |
| R4. project_state.json HARD pattern | Correct behavior change: caller should see failure |
| R5. STAGES re-export | `module.exports = { createDocumentationBuildLoop, STAGES }` verified post-edit |
