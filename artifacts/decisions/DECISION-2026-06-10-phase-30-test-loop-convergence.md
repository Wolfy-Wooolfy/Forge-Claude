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
