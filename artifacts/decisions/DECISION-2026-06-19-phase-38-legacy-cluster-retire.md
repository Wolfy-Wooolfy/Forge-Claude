# DECISION-2026-06-19-phase-38-legacy-cluster-retire

Status:    APPROVED (owner standing-delegation, 2026-06-19: "قرر بنفسك باعتبارك CTO المشروع ونفّذ … مش عايزين نضيع وقت كتير")
Authored:  2026-06-19 — CTO advisor
Phase:     PHASE-38
Depends on: DECISION-2026-06-18-phase-37-arc-drift-audit.md (full-live-surface reachability proving the cluster unreachable)
Supersedes: the "pending migrate-or-retire" clause in docs/10_runtime/18_AGENT_ROLES_CONTRACT.md §"§ARC Track A Scope"

## §0 Context & Authority
PHASE-37 scoped the Forge-v1 self-build CLI cluster OUT-OF-TRACK-A-SCOPE: ~36 files / ~198 direct fs.*Sync writes (+2 child_process, +1 fetch), proven unreachable from the live API surface (apiServer routes + ai_os + runtime) via the import graph (audit §3.5), CLI-only via bin/forge-run.js, bin/forge-autonomous-run.js, bin/forge-autonomy-step.js. Disposition was deferred to an owner-gated decision. This artifact is that decision. The pipeline is COMPLETE (PHASE-34); the cluster is superseded by the L1–L4 runtime + the live conversation graph and carries no live functionality.

## §1 Decision
RETIRE (delete) the cluster from the active tree. Do NOT migrate — wrapping superseded, unreachable code onto L2 has no live consumer and is wasted effort. Git history preserves the removed code; no in-tree archive kept.
Rationale: zero live value; removes permanent audit/reachability noise; cleans the ground for the next live-surface item (C2 cross-project write isolation, PHASE-39); low blast radius (nothing on the live surface imports it).

## §2 Scope
IN SCOPE (retire): code/src/modules/* (EXCEPT the two LIVE modules below), code/src/execution/*, code/src/cognitive/*, code/src/orchestrator/* (DEAD files only — see §3d), code/src/forge/*, bin/forge-run.js, bin/forge-autonomous-run.js, bin/forge-autonomy-step.js, and any package.json "bin"/scripts pointing exclusively at the above.
EXPLICITLY PRESERVED (LIVE — must NOT be deleted): code/src/modules/visionComplianceGate.js; code/src/modules/specCompletenessEnforcer.js; all of code/src/runtime/**, code/src/ai_os/**, code/src/workspace/apiServer.js, code/src/providers/**.

## §3 Reachability basis (re-confirmed in §0 PROBE, not assumed)
The manifest is valid only if Claude Code confirms in STEP 0:
(a) No live-surface file (apiServer routes + ai_os/** + runtime/**) imports any candidate (directly or transitively).
(b) No SU scenario (code/src/testing/scenarios/**) or harness imports/exercises any candidate — removal cannot change the suite count.
(c) The two preserved modules are NOT in the manifest.
(d) code/src/orchestrator/*: each file classified LIVE (reached from live surface OR Blueprint Part C KEEP) vs DEAD; only DEAD files are in the manifest.
Any failure of (a)–(d) → STOP-AND-REPORT, delete nothing.

## §4 Staging
STEP 0 (read-only): create this artifact + produce evidence-backed deletion manifest, preserve-list, orchestrator live/dead split, SU-dependency check, dangling-reference scan → STOP-AND-REPORT (CTO verify).
STEP A (after CTO GO): delete manifest files + dead CLI entries + dead package.json bin/scripts; update doc 18 §ARC scope-note ("pending migrate-or-retire" → "RETIRED in PHASE-38, this artifact"); fix Roadmap/Blueprint references → mid-checkpoint.
STEP B (closure): full SU suite (expect 321/0/5 unchanged), forge-doctor (35 green), Track A grep clean on live surface, artifact closure note, status.json update (next_phase → PHASE-39-PENDING-DECISION; remove legacy file/write counts from §ARC scope-note; §ARC=10/L2=80/roles=13/doctor=35 unchanged), closure checkpoint → LOCAL commit → STOP for CTO closure-diff + push GO.

## §5 Closure gate (deterministic)
Manifest fully removed; preserve-list intact (grep proves both LIVE modules present); SU 321/0/5 (326) on Windows UNCHANGED [in-container 313/8/5 environmental allowed]; forge-doctor 35 with no new removal-attributable FAIL; Track A grep on live surface unchanged (no forbidden direct writes); doc 18 scope-note = RETIRED with §ARC still 10; status.json updated; closure checkpoint written; tag phase-38-complete pushed only after CTO push GO; GitHub-raw 200 on tag.

## §6 Cost
Mock-only, $0. No LLM calls. Kill bar $3 (untouched). No real-key approval requested.

## §7 Risks
R1 orchestrator file assumed dead is live → §3(d) + STOP-AND-REPORT.
R2 preserved module deleted by mistake → explicit preserve-list + §5 grep assertion.
R3 hidden CLI/script dependency (.bat / npm script invoking a removed bin) → §0 dangling-reference scan.
R4 git "U" auto-snapshot noise at closure → tag on clean closure commit, verified via git rev-list -n 1.

## §8 Authorization
Owner standing delegation (2026-06-19). CTO selected PHASE-38 = legacy cluster RETIRE; C2 isolation deferred to PHASE-39 (next live-surface item); Fixture Engine + Anthropic-switch remain backlog (Anthropic blocked on missing ANTHROPIC_API_KEY). Decision-artifact-first satisfied; §0 PROBE + STOP-AND-REPORT preserves the CTO verification gate before any destructive action.
