# DECISION-2026-06-10 — PHASE-30: Test-Loop Convergence (Finding #5)

**Status:** APPROVED (owner delegated CTO decision authority — see §8)
**Date:** 2026-06-10
**Relates:** closes PHASE-29 Finding #5 and proves the self-correcting loop CONVERGES on the real project (phase28_gate10, currently BUILDER iter-1 after the first real loop-back).

## 1. Context (verified @ 4d94b43)
- PHASE-29's real run caught genuine coherence defects: the bridged scenarios' setup hardcodes "node src/server.js" (from the test plan) while the final build's entry is src/index.js; a STALE attempt-2 src/server.js (mounted at /api) was booted → 404s. Fixtures are inert in the runner (Finding #4 — NOT fixed this phase).
- A naive rebuild cannot converge: the defects are plan/bridge-side, not builder-code-side.
- Open question (§0-b): with real sqlite3 file persistence, T-1's insert may satisfy T-3/T-4's "existing_todo" across per-scenario server restarts — if true, Finding #5 alone unblocks convergence.

## 2. Decision
Fix Finding #5 with the MINIMAL coherent change set, then run the first full self-correction iteration on phase28_gate10 as Gate #10:
(a) ENTRY COHERENCE — at bridge time, runTests derives the authoritative entry of the CURRENT build and rewrites each bridged scenario's setup.start_server.command accordingly (bridge-side fix preferred; if §0 proves an engine-side record is required — e.g. buildProject persisting a build manifest — that is ONE authorized engine edit, RULING-style, to be specified at GO).
(b) WORKSPACE HYGIENE — stale source files from prior attempts must not be bootable: §0 proposes the minimal mechanism (e.g. materializer cleans src/ before writing, or build manifest + entry-derivation makes stale files inert). Engine edits require explicit CTO ruling at GO.

## 3. Scope boundaries
IN: the #5 fix set (per §0 findings + GO rulings), ≥3 new mock scenarios covering entry-derivation + hygiene behavior, decision/checkpoints/status, Gate #10 convergence run.
OUT: Finding #4 (fixture engine) — opportunistic only: if sqlite persistence self-satisfies fixtures, document it; full fixture support stays deferred. REVIEWER_CODE_AND_SECURITY bridge (PHASE-31). UI. Provider switch.

## 4. Acceptance gate (deterministic)
- New scenarios + full SU suite green on Windows (exact counts; expect 290→~293+, zero regressions).
- Track A clean; §ARC=8; engine edits ONLY per explicit GO rulings (diffs shown at closure).
- Gate #10 (real, on phase28_gate10 at BUILDER iter-1): POST /build-project (real builder+materializer gpt-4o) → loop RUN_TESTS → POST /run-tests (real npm + real scenarios). TARGET: PASS branch → loop genuinely at REVIEWER_CODE_AND_SECURITY = first converged iteration. EITHER branch is honest evidence; if the report still FAILs after the #5 fix, surface the per-scenario report and STOP (no cap-burning re-loops without CTO).
- Evidence artifacts/spikes/gate30_phase30/ (result + step files incl. rewritten setup commands, rebuild files, report verbatim, states).
- CTO independently verifies before closure.

## 5. Cost budget
One real rebuild (builder+materializer ≈ $0.03–0.06). runTests $0. Kill bar $3.00.

## 6. Track A
reg.invoke only; §ARC=8; no new tools expected (loop_back exists).

## 7. Forward path
30 (this) → 31 REVIEWER_CODE_AND_SECURITY bridge (with a genuinely-reached state) → 32 DOCUMENTATION → 33 QUALITY_JUDGE + Gate 2 → 34 DEPLOYMENT_OR_END + Gate 3.

## 8. Authority
Owner delegation of 2026-06-09 stands. Gate #10 remains a real owner test.

---

## 9. CLOSURE (PHASE-30 CLOSED)

**Status:** CLOSED
**Gate #10 run ts:** 2026-06-11T12:02:31Z
**Verdict:** PASS — branch **PASS_TO_REVIEWER** (the unexpected-but-legitimate branch materialized)
**Cost:** $0.03095 real (one gpt-4o rebuild: builder + materializer, 2 ledger entries). Kill bar never approached.

### Gate #10 — RULING-5 criteria, all met
- **(i) Entry coherence PROVEN:** rebuild wrote 6 files (manifest verbatim: src/models/todo.js,
  src/controllers/todoController.js, src/middleware/validation.js, src/middleware/errorHandler.js,
  src/routes/todoRoutes.js, src/server.js); all six rewritten `start_server` commands ==
  `node src/server.js` (manifest-derived, independently recomputed by the gate script).
  CTO forensic check: all 6 manifest sha256 hashes match the on-disk rebuilt files byte-for-byte.
- **(ii) Final app booted:** new src/server.js mounts `/todos` directly; report verbatim
  6/6/0/0 PASS; no global-404 signature.
- **(iii) Remaining failures:** none.
- **States:** BUILDER iter-1 → (build) RUN_TESTS → (tests PASS) **REVIEWER_CODE_AND_SECURITY iter-1**
  (no increment on PASS — correct semantics). The loop is genuinely parked at REVIEWER —
  first converged iteration on real production data.

### ROLE-REVERSAL PROOF (real-data inertness)
src/index.js — priority #1 in the derivation list — exists on disk (it was PHASE-28's final
entry) and is NOT in the new manifest; derived_entry = src/server.js (priority #2, current
build). The manifest restriction excluded a higher-priority stale candidate. **Exact inverse
of the PHASE-29 defect, proven live.** Manifest-restriction does the real work, not priority
order.

### RULINGS implemented
- **RULING-4:** buildProject() persists `orchestration/<loopId>/build_manifest.json` via
  reg.invoke("fs.write_file") with FULL files_written objects ({path, sha256, line_count});
  fail-closed — write throw/not-ok → `{ ok:false, error:"build_error", detail:"MANIFEST_WRITE_FAILED" }`,
  no advance_state. The ONLY engine edit this phase.
- **RULING-5:** applied — the PASS branch materialized legitimately; evidence requirements met.

### Recorded verbatim (per CTO MID/STEP-A/Gate verifications)
- **Corrupt-manifest semantics (APPROVED):** manifest file present but JSON-unparseable, or
  `files` not an array → present-with-zero-candidates → ENTRY_UNRESOLVED fail-closed. A corrupt
  authoritative record must never silently fall back to legacy.
- **§X.1 incidental (ACCEPTED):** `_test_skip_npm_exec` — the ONLY new test hook; gates ONLY
  the npm exec; keeps dep-scan/merge/write; follows the `_test_*` convention; never set in
  production code.
- **T-3 echo note + Finding #4 stays OPEN:** T-3 (update) passed because the rebuilt
  updateTodo echoes `{id,title,completed}` unconditionally (no `this.changes` check) — the
  200+completed assertions passed from the ECHO, not from persistence. Same pattern in
  deleteTodo (unconditional 204). Harness fixture support (Finding #4) remains OPEN/deferred.
- **Latent app-quality defect flagged as REVIEWER-stage material:** missing `this.changes`
  handling in update/delete (non-existent ids return success shapes). The REVIEWER_CODE_AND_SECURITY
  stage — where the loop now genuinely sits — is the natural place to catch it (PHASE-31).

### Deliverables (final list)
- Engine: `code/src/ai_os/conversationEngine.js` — RULING-4 manifest write in buildProject();
  runTests() Sub-step 0 entry derivation (manifest-restricted, priority list + `.listen(`
  fallback accepting exactly 1, ENTRY_UNRESOLVED fail-closed) + dep-scan manifest scoping +
  start_server command rewrite + §X.1 hook.
- Tests: `run_tests_test_helper.js` (+4 fixtures, +4 runners), scenarios S293–S296.
- Suite: 289/0/5 (294 total) on Windows (Start-Process workaround), duration 1077532ms.
  Track A greps clean (zero new violations); doctor exit 0 (35 checks, 6 known warnings).
- Gate: `scripts/spikes/gate30_phase30_convergence.js` + evidence
  `artifacts/spikes/gate30_phase30/` (15 files incl. rewritten_scenarios/ ×6 copies —
  CTO-verified IDENTICAL to workspace).
- Checkpoints: `_phase_30_checkpoints/stage_mid.md` + `stage_final.md`.

### Closure checklist
- [x] S293–S296 green; full suite 289/0/5 (294) — exact expected counts
- [x] Track A clean; §ARC=8; L2=80 (no new tools); engine edits ONLY per RULING-4
- [x] Gate #10 PASS verified forensically by CTO (manifest sha256 ⇔ disk, role-reversal proof)
- [x] Decision CLOSED (§9 appended), checkpoints on disk
- [x] status.json: current_task PHASE-30 CLOSED; next PHASE-31-PENDING-DECISION
- [ ] Git: local closure commit (NO push, NO tag until CTO closure-diff verification)

### Forward
PHASE-31 pending decision: REVIEWER_CODE_AND_SECURITY bridge (now with a genuinely-reached
state and a real latent defect waiting to be caught) vs Fixture Engine (Finding #4).
