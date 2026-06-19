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

## AMENDMENT — 2026-06-19 (post-Step-0 CTO ruling)
Step 0 PROBE surfaced three items needing CTO judgment; all independently
re-verified by the CTO and ruled as follows. This amendment corrects the
original §2 / §3(d) / §4 scope WITHOUT overwriting them (audit trail).

A. Manifest finalized (FLAG-1 — orchestrator/forge are DEAD). Re-verified: the
   live surface (apiServer + ai_os/** + runtime/**) imports zero cluster files
   except the two preserved modules; the v2 live pipeline is
   code/src/runtime/orchestration/* + code/src/ai_os/conversationEngine.js, not
   code/src/orchestrator/. All 6 orchestrator/ + 2 forge/ files are bin-only and
   DEAD. §3(d)'s LIVE criterion is corrected to "reached from the live surface"
   only; the "OR Blueprint Part C KEEP" sub-clause is withdrawn as stale (see B).
   Final SOURCE manifest = 44 files: code/src/modules/* (31 — all except
   visionComplianceGate.js + specCompletenessEnforcer.js) + code/src/execution/*
   (2) + code/src/cognitive/** (3) + code/src/orchestrator/* (6) +
   code/src/forge/* (2).

B. Layer-0 supersession of Blueprint Part C (per the Blueprint's own
   conflict-resolution clause). Part C marks orchestrator/ + forge/ as
   "KEEP … remain authoritative" and the 33 modules as "No deletions." Those
   clauses (2026-05-07) predate the L1–L4 runtime and runtime/orchestration/,
   when orchestrator/ WAS the pipeline. They are superseded by the PHASE-37
   audit (2026-06-18) and this decision — the dedicated conflict-resolution
   artifact the Blueprint requires. Part C gets a dated addendum recording the
   supersession; the two LIVE modules remain KEEP.

C. Scope additions (FLAG-2, FLAG-3). (i) A 4th dead CLI entry —
   bin/forge-build-state.js (imports forge/forge_state_writer) — is added;
   retired bins = 4 (forge-run, forge-autonomous-run, forge-autonomy-step,
   forge-build-state). forge-reset-new-project.js + the live tooling bins
   forge-doctor.js / forge-test.js are NOT cluster-coupled and are excluded.
   (ii) Two LIVE docs present retired files as current entrypoints/coverage and
   would dangle: docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md and
   docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md. STEP A
   de-dangles exactly these (plus any other doc found presenting a retired file
   as a live entrypoint/runtime/coverage target). Conceptual references in
   contract docs are OUT OF SCOPE (deferred documentation-reconciliation pass,
   Blueprint FINDINGS-INFO-5).

## STEP A EXECUTION NOTE — newly surfaced dangling consequences (flagged, NOT actioned)
STEP A's pre-deletion re-scan caught two same-legacy-domain couplings that the
Step-0 dangling scan missed (both use `require(path.resolve(...))` / `spawnSync`,
which the Step-0 quote-anchored regex did not match). Neither is on the live
runtime surface, the SU suite, or the STEP B closure gate; both are OUTSIDE the
CTO-fixed 44-source + 4-bin manifest, so STEP A does NOT touch them — they are
recorded here for the CTO mid-verify ruling before STEP B:
  - DISCOVERY-1: verify/smoke/{runner_smoke,runner_dry_run_smoke,status_writer_smoke,
    stage_transitions_smoke}.js import the retired orchestrator/{runner,status_writer,
    stage_transitions}; the package.json script `audit:smoke` → runner_smoke.js will
    fail after deletion. Recommend retiring these 4 smoke files + the `audit:smoke`
    script as a same-domain follow-up (STEP B or PHASE-39 housekeeping).
  - DISCOVERY-2: bin/forge.js is an umbrella dispatcher that `spawnSync`s the retired
    bin/forge-run.js + bin/forge-autonomy-step.js (no `require` of cluster source, so
    not import-coupled). Its run/step/default commands dangle after deletion (the
    `status` command still works). Recommend adding bin/forge.js to the retire set as
    a 5th bin (CTO ruling pending).

## AMENDMENT 2 — 2026-06-19 (CTO mid-verify ruling — full-domain dangling closure)
CTO independently re-verified STEP A (48 deletions correct, live surface clean,
§ARC=10, addenda correct) and ran a comprehensive repo-wide dangling scan that
confirmed DISCOVERY-1/2 and surfaced the full extent of the legacy self-build
domain's dead tooling. Ruling: complete the domain retirement (no half solutions).
RETIRED in STEP B (all verified legacy-domain, none on the live surface, none in
any automated gate — forge-doctor has no integrity check, the SU suite does not
invoke them, and the sole consuming script `audit:smoke` is removed):
  - bin/forge.js (legacy umbrella dispatcher: run/step/default spawn deleted bins;
    status reads legacy artifacts only).
  - verify/smoke/{runner_smoke, runner_dry_run_smoke, stage_transitions_smoke,
    status_writer_smoke}.js (require the deleted orchestrator); smoke_check.js +
    smoke_check.sh (spawn the 4); local_command_logger.js + local_command_log.jsonl
    (used only by smoke_check); and the package.json `audit:smoke` script.
  - tools/integrity.js (hardcoded FILES list of deleted orchestrator/bin paths) +
    tools/pre_run_check.js (reads release_1.0.0.hashes.json; v1 pre-run check).
PRESERVED (LIVE, not cluster-coupled): verify/smoke/{test_doctor, test_harness_meta,
test_permission_layer, test_provider_contract_v2, test_tool_runtime}.js.
LEFT AS FROZEN HISTORY: release_*.hashes.json (14), artifacts/release/*.manifest.md,
artifacts/stage_B|C/*, archived task closures — point-in-time records, same
treatment as artifacts/. Conceptual contract-doc references remain for the deferred
documentation-reconciliation pass (FINDINGS-INFO-5).
Total PHASE-38 retirement = 48 (STEP A) + 11 (STEP B) = 59 files + 1 npm script.

## AMENDMENT 3 — 2026-06-19 (CTO §B.3 self-gate ruling — scope boundary at the CLI-cluster edge)
STEP B's §B.3 dangling re-scan (self-gating) halted before commit with 4 references
to deleted files outside the CLI-cluster manifest:
  - A: tests/contracts/pipeline.stageC.entry.test.js — require() of the deleted
    orchestrator/status_writer; a unit test of deleted v1 code; no runner.
  - B: verify/unit/docs_gap_analyzer.js (~104-147) — hardcoded expected-file list
    containing deleted bin/orchestrator/execution/tools/smoke paths.
  - C: verify/unit/mismatch_reporter.js (~69-70) — dead branch referencing the
    deleted smoke_check.{sh,js}.
  - D: progress/status.json — historical narrative mentioning the deleted bins.
CTO verification established that verify/unit/ + verify/audit/ are NOT the Forge-v1
CLI cluster: they are a DISTINCT verification/audit subsystem, contracted by
docs/09_verify/09_17|18|19 + docs/08_audit/08_Forge_Boundary_Audit, documented as
must-exist/writable runtime dirs (docs/10_Tech_Assumptions), and adjacent to a live
module (specCompletenessEnforcer.js reads artifacts/verify/unit/docs_gap_validation_report.json
— a different, artifacts/-rooted path). Their scripts require only fs/path and do not
import deleted code. Sweeping them as a PHASE-38 tail-end would over-reach a contracted
subsystem and cause multi-doc drift.
RULING — scope PHASE-38 at the CLI-cluster boundary; clear §B.3 minimally:
  - A: RETIRE (dead test; empties tests/). Total deleted = 60 files.
  - B, C: SURGICAL DE-DANGLE — removed only the references to PHASE-38-deleted files;
    the files remain (contracted), not retired.
  - D: historical narrative — left as-is; the §B.4.d PHASE-38 prepend frames it.
DEFERRED (new owner-gated backlog item, folds into FINDINGS-INFO-5): retirement of the
legacy v1 verification/audit harness — verify/unit/{docs_gap_analyzer, mismatch_reporter,
cross_doc_consistency, trace_validator}.js + reports, verify/audit/{audit_logger.js,
audit_log.jsonl} — TOGETHER WITH reconciliation of its contract docs (09_17/18/19,
08_Forge_Boundary_Audit, 09_Build_and_Verify_Playbook, 10_Tech_Assumptions). Not auto-started.
OBSERVATION (pre-existing, not PHASE-38-caused; for the deferred pass): specCompletenessEnforcer.js
(LIVE) reads artifacts/verify/unit/docs_gap_validation_report.json — confirm a live writer
exists or that absence is handled gracefully.
