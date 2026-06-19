# PHASE-41 — Closure Checkpoint (Fixture Engine · D1 Ephemeral Overlay Root)

**Date:** 2026-06-19
**Decision artifact:** [DECISION-2026-06-19-phase-41-fixture-engine.md](../DECISION-2026-06-19-phase-41-fixture-engine.md) (+ AMENDMENT 1, AMENDMENT 2)
**Predecessor:** PHASE-40 TRULY CLOSED (tag `phase-40-complete`, commit 500fddbf).

---

## STEP 0 — Byproduct probe + design decision (read-only, $0)
Empirical full-suite run on a clean tree → exactly **2 tracked-file writers** left byproducts:
- **S25** (`apiserver` `POST /api/ai/decision` → `appendDecisionLog` → L2 `fs.write_file` on the real root)
  appended a DECISION_PACKET to the TRACKED `artifacts/llm/decision_log.json`.
- **S196** (`module_call` → `runS196SecretsInEnvVarCheck` → bare `runDoctor()` → default `update_status:true`
  → `_patchStatusRuntimeHealth`, direct fs §ARC-9) patched the TRACKED `progress/status.json` `runtime_health`.

Zero stray untracked dirs (per-scenario `_cleanup` covers the `test_*` project dirs). `/api/system/doctor`
is a latent third writer (no scenario hits it). Root cause: `bin/forge-test.js` threads the **real repo root**
as both code-root and data-root; writes that escape per-scenario `projectDir` land on the tracked tree.
**CTO chose D1 (Ephemeral Overlay Root).**

## STEP A — Build overlay + thread + teardown → mid-checkpoint gate
- NEW [code/src/testing/fixture_overlay.js](../../../code/src/testing/fixture_overlay.js) (122 lines):
  `buildOverlay(realRoot) → { root, junctions[] }` junctions the read-only inputs back to the real repo
  (top-level `code/ docs/ web/ architecture/ node_modules/ scripts/` + nested `artifacts/vendor`,
  `artifacts/test_fixtures`, `artifacts/projects/_reference_todo_api`), copies `package.json` +
  `ecosystem.config.js`, and seeds FRESH writable `artifacts/` + `progress/` (`status.json`,
  `artifacts/llm/approval_policy.json`; `decision_log.json` created fresh). `teardownOverlay` rmdir's every
  junction LINK first (removes the reparse point, never the target) and only `rmSync`s once ALL junctions are
  cleared — junction lifecycle empirically de-risked (symlink "junction" needs no admin; `require` resolves
  through it; `lstat().isSymbolicLink()===true`; rmdir+rmSync leave the target intact).
- [bin/forge-test.js](../../../bin/forge-test.js) wiring: `buildOverlay` → `process.chdir(overlay.root)` →
  `runScenarios({ root: overlay.root })` → `finally{ restore cwd + teardownOverlay }` → `process.exit` AFTER
  the finally (teardown guaranteed on success/failure). `chdir` is required because `runDoctor.js:10` defaults
  `root` to `process.cwd()` and S196 calls `runDoctor()` with no args; it also isolates the cwd-ROOT helpers.
- First overlay run: **305/20/5** (20 missing read-only inputs — ref-project `node_modules`, `scripts/`,
  `artifacts/vendor`, `artifacts/test_fixtures`). The tracked tree stayed CLEAN even then (the failures were
  missing READS, never escaped WRITES). After junctioning those → **325/0/5**.

## Zero-byproduct gate (REAL repo)
- Full suite on the overlay: **325 passed / 0 failed / 5 skipped (330)**.
- `git status --porcelain` POST == PRE — no suite byproducts.
- `git hash-object artifacts/llm/decision_log.json` = `79178ec0…` PRE == POST (suite did not touch the tracked copy).
- `progress/status.json` unchanged BY THE SUITE (closure edits are separate, deliberate).
- 0 leftover `forge-su-*` dirs in os.tmpdir() (teardown ran).

## Documented residual (accepted; gate-clean)
The L5b ref-project harness writes (`_reference_todo_api/forge_tests/last_report.json`, `loopback_signal.json`)
go through the `_reference_todo_api` junction into realRoot's **gitignored** paths (.gitignore §17) — identical
to pre-overlay behavior; the git-clean gate holds. New built projects (PHASE-42+) land in the FRESH overlay
`artifacts/projects/` and are fully isolated. Optional full-isolation refinement is backlog gold-plating.

## Closure metrics
- Suite **325/0/5 (330)** · forge-doctor **35 checks, 0 FAIL** · §ARC **= 10** · L2 tools **80** · roles **13**.
- Track A clean — test-infra ONLY (new `fixture_overlay.js` + `bin/forge-test.js`); ZERO live-surface change.
- Mock-only, **$0**, no real API keys.
- `progress/status.json.next_phase` → **PHASE-42-PENDING-DECISION**.
