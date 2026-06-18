# PHASE-38 — STAGE A MID-CHECKPOINT (deletions + artifact amendment + de-dangle docs)

**Date:** 2026-06-19
**Decision:** `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md` (+ AMENDMENT 2026-06-19)
**Mode:** working-tree changes only — NO suite run, NO status.json change, NO commit, NO push.
**Status:** STEP A complete → STOP for CTO mid-verify before STEP B.

---

## 1) git status --short (full)

```
 M architecture/FORGE_V2_BLUEPRINT.md
 M artifacts/decisions/DECISION-2026-06-19-phase-38-legacy-cluster-retire.md
D  bin/forge-autonomous-run.js
D  bin/forge-autonomy-step.js
D  bin/forge-build-state.js
D  bin/forge-run.js
D  code/src/cognitive/cognitive_adapter.js
D  code/src/cognitive/cognitive_config_resolver.js
D  code/src/cognitive/drivers/openai_driver.js
D  code/src/execution/task_executor.js
D  code/src/execution/task_registry.js
D  code/src/forge/forge_state_resolver.js
D  code/src/forge/forge_state_writer.js
D  code/src/modules/auditEngine.js
D  code/src/modules/backfillEngine.js
D  code/src/modules/boundaryAuditStageGate.js
D  code/src/modules/canonicalArtifactValidator.js
D  code/src/modules/closureEngine.js
D  code/src/modules/codeToSpecTraceValidator.js
D  code/src/modules/codexContractValidator.js
D  code/src/modules/cognitiveLayerContractEnforcer.js
D  code/src/modules/crossDocConsistencyEngine.js
D  code/src/modules/decisionArtifactValidator.js
D  code/src/modules/decisionFileNameEnforcer.js
D  code/src/modules/decisionFinalityEnforcer.js
D  code/src/modules/decisionGate.js
D  code/src/modules/designExplorationEngine.js
D  code/src/modules/docGapLoopContract.js
D  code/src/modules/docsGapAnalyzerValidator.js
D  code/src/modules/executeEngine.js
D  code/src/modules/forkDetectionEngine.js
D  code/src/modules/gapEngine.js
D  code/src/modules/intakeEngine.js
D  code/src/modules/loopEnforcementOrchestrator.js
D  code/src/modules/loopTerminationValidator.js
D  code/src/modules/nodeSmokeCheck.js
D  code/src/modules/projectIsolationGuard.js
D  code/src/modules/providerAuthorityEnforcer.js
D  code/src/modules/recommendationSeparationValidator.js
D  code/src/modules/researchTransparencyLayer.js
D  code/src/modules/toolIntegrationReadiness.js
D  code/src/modules/traceEngine.js
D  code/src/modules/verifyEngine.js
D  code/src/modules/visionAlignmentValidator.js
D  code/src/orchestrator/autonomous_runner.js
D  code/src/orchestrator/entry_resolver.js
D  code/src/orchestrator/pipeline_definition.js
D  code/src/orchestrator/runner.js
D  code/src/orchestrator/stage_transitions.js
D  code/src/orchestrator/status_writer.js
 M docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md
 M docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md
 M docs/10_runtime/18_AGENT_ROLES_CONTRACT.md
```

**Deletion tally = 48** (matches the manifest exactly):
- SOURCE = 44: modules 31 + execution 2 + cognitive 3 (incl. `drivers/openai_driver.js`) + orchestrator 6 + forge 2.
- BINS = 4: forge-run, forge-autonomous-run, forge-autonomy-step, forge-build-state.

**Modified (tracked) = 5:** the 4 docs/artifacts below + the decision artifact amendment.
(The decision artifact shows ` M` because Step 0's version was already committed by the CTO between Step 0 and Step A; the diff is the Step-A AMENDMENT append only — original §0–§8 untouched.)

---

## 2) Preserve-list proof — `code/src/modules/` retains EXACTLY the 2 LIVE modules

```
$ ls code/src/modules/
specCompletenessEnforcer.js
visionComplianceGate.js
```
Neither preserved module appears in the deletion list above. ✓

---

## 3) Emptied directories removed

```
REMOVED: code/src/execution
REMOVED: code/src/cognitive
REMOVED: code/src/orchestrator
REMOVED: code/src/forge
```
✓ All 4 cluster directories gone; `code/src/modules/` remains (2 files).

---

## 4) Exact diffs of edited docs/artifacts

### 4.1 docs/10_runtime/18_AGENT_ROLES_CONTRACT.md (§ARC scope-note → RETIRED; §ARC=10 + two-LIVE-modules exception preserved)
```diff
-**OUT-OF-TRACK-A-SCOPE — Forge-v1 self-build CLI cluster.** … is **not governed by Track A**. … is **CLI-invokable only** (`bin/forge-run.js`, `bin/forge-autonomous-run.js`, `bin/forge-autonomy-step.js`). Direct `fs` / `child_process` / `fetch` is **tolerated there pending a future owner-gated migrate-or-retire decision**. … Authorization: `DECISION-2026-06-18-phase-37-arc-drift-audit.md`.
+**OUT-OF-TRACK-A-SCOPE — Forge-v1 self-build CLI cluster (RETIRED in PHASE-38).** … (the two LIVE governance modules … are **PRESERVED**) … predated the Runtime Layers, was **unreachable from the live API** …, and was CLI-invokable only. It was **RETIRED in PHASE-38** (see `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md`): the cluster (44 source files + 4 dead CLI bins — `forge-run`, `forge-autonomous-run`, `forge-autonomy-step`, `forge-build-state`) was deleted from the active tree; git history preserves it. Only the two LIVE governance modules remain under `code/src/modules/`. … Authorization: `DECISION-2026-06-18-phase-37-arc-drift-audit.md` (audit) + `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md` (retirement).
```
(Line 371 `§ARC count = **10**` UNCHANGED; the two-LIVE-modules exception UNCHANGED.)

### 4.2 architecture/FORGE_V2_BLUEPRINT.md — Part C (2 dated addenda; originals preserved)
```diff
 **No deletions.** The existing 33 modules are well-factored … keep doing their job.
+
+> **ADDENDUM 2026-06-19 (PHASE-38 — partially SUPERSEDED → RETIRED).** … Of the 33 modules, only `visionComplianceGate.js` + `specCompletenessEnforcer.js` … remain KEEP. The other 31 … were **RETIRED (deleted)** in PHASE-38 …. git history preserves them.
```
```diff
 KEEP. Pipeline definition, runner, state writer remain authoritative. `autonomous_runner.js` is updated to emit Tool Runtime calls … (Stage 1 migration above).
+
+> **ADDENDUM 2026-06-19 (PHASE-38 — SUPERSEDED → RETIRED).** This KEEP clause was authored 2026-05-07, when `code/src/orchestrator/` WAS the pipeline. The v2 live pipeline … is `runtime/orchestration/*` + `ai_os/conversationEngine.js`. PHASE-37 audit proved orchestrator/ + forge/ unreachable … the cluster was **RETIRED (deleted)** in PHASE-38. The two LIVE governance modules remain KEEP.
```

### 4.3 docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (entrypoint/runtime doc — de-dangled)
- §2.1: removed the retired CLI entry descriptions (forge-autonomous-run/forge-run/forge-autonomy-step/forge-build-state), dropped the "subordinate to forge-autonomous-run.js" claim, added a RETIRED banner naming `start-api.js` as the live entrypoint (tooling forge-doctor/forge-test), and listed `bin/forge.js` as flagged-for-follow-up.
- §2.2: added a RETIRED banner over the orchestrator/execution module lists (live = runtime/orchestration/* + conversationEngine.js).
- §6 Non-authority clause: added a RETIRED note (the forge_state.json / pipeline_definition.js authority model belonged to the retired cluster; live surface = start-api.js → apiServer.js + ai_os/** + runtime/**).
(Full hunk in git diff; CRLF→LF normalization warning is cosmetic, pre-existing line endings.)

### 4.4 docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md (coverage map — de-dangled)
- Added a §2 RETIRED banner scoping §§2–4 (entrypoints + orchestrator + execution) as deleted; live coverage targets = start-api.js → apiServer.js + ai_os/** + runtime/**; explicit note that live VISION_COMPLIANCE = `modules/visionComplianceGate.js` (not the retired `execution/task_registry.js` of §4.3).
- §2.1 forge-autonomous-run.js marked RETIRED (per CTO).

### 4.5 architecture/FORGE_V2_PHASE_ROADMAP.md — NOT edited
Scan hits (lines 280, 373–375, 433) are **historical phase-plan records** (PHASE-4/PHASE-6/PHASE-7-A "files modified/planned" lists), not live-entrypoint claims → left intact per CTO "update only if presented as live."

---

## 5) docs/** retired-reference scan — disposition

**LIVE (presented retired files as current entrypoint/runtime/coverage) → EDITED this step:**
| Doc | Why live | Action |
|---|---|---|
| docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md | EXECUTION-BOUND entrypoint/runtime doc | de-dangled (§2.1/§2.2/§6) |
| docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md | active coverage map | de-dangled (§2 banner + §2.1) |
| docs/10_runtime/18_AGENT_ROLES_CONTRACT.md | live §ARC scope note | tolerated→RETIRED |
| architecture/FORGE_V2_BLUEPRINT.md (Part C) | Layer-0 disposition table | 2 dated addenda |

**CONCEPTUAL / contract / frozen → DEFERRED (Blueprint FINDINGS-INFO-5 reconciliation pass; NOT edited):**
| Doc | Lines | Reason deferred |
|---|---|---|
| docs/03_pipeline/SELF_BUILDING_RUNTIME_ACTIVATION.md | 116, 366, 367 | conceptual self-build runtime spec (contract doc) |
| docs/03_pipeline/pipeline_contract_violation_v1.md | 26, 83, 151 | pipeline-contract spec |
| docs/07_decisions/DECISION_PIPELINE_CONTRACT_ENFORCEMENT_v1.md | 102 | frozen decision artifact (immutable history) |
| architecture/validated_assumptions.md | 18 | references runtime DATA artifact (forge_state.json), conceptual authority model |
| architecture/task_plan.md | 15, 57 | references forge_state.json data artifact, historical plan |

---

## 6) Track A / scope confirmation

- **No live-surface runtime file changed.** The only `M` entries are 4 docs + the decision artifact. Zero changes under `code/src/workspace/**`, `code/src/ai_os/**`, `code/src/runtime/**`, `code/src/providers/**`.
- **The 2 preserved modules** (`visionComplianceGate.js`, `specCompletenessEnforcer.js`) are neither deleted nor modified.
- **Post-deletion live-surface re-grep** for requires of any deleted path → only the 2 preserved-module imports at `apiServer.js:19-20`. No dangling require on the live surface.
- **Untouched bins:** forge-doctor.js, forge-test.js, forge-reset-new-project.js, forge-builtproject-test.js, forge-live-smoke.js, forge.js (+ all other non-cluster bins) — all present.
- No new `fs.*Sync` / `child_process` / `fetch` / `new OpenAI()` introduced anywhere.

---

## 7) Newly surfaced dangling consequences (flagged for CTO mid-verify; NOT actioned — outside the fixed 44+4 manifest)

> Both were missed by the Step-0 dangling scan because they couple via `require(path.resolve(...))` / `spawnSync` (the Step-0 quote-anchored regex matched only `require("literal…")`). Neither is on the live runtime surface, the SU suite, or the STEP B closure gate. Working-tree deletions are fully reversible before the STEP B commit, so these can be ruled on now.

- **DISCOVERY-1 — `verify/smoke/*` + `npm run audit:smoke` will break.**
  - `verify/smoke/runner_smoke.js` → `code/src/orchestrator/runner` (deleted)
  - `verify/smoke/runner_dry_run_smoke.js` → `code/src/orchestrator/runner` (deleted)
  - `verify/smoke/status_writer_smoke.js` → `code/src/orchestrator/status_writer` (deleted)
  - `verify/smoke/stage_transitions_smoke.js` → `code/src/orchestrator/stage_transitions` (deleted)
  - `package.json` script `audit:smoke` → `verify/smoke/runner_smoke.js`.
  - **Recommendation:** retire these 4 legacy smoke files + the `audit:smoke` script (same Forge-v1 self-build domain) as a STEP B / PHASE-39 housekeeping addition. Not part of the live SU suite or the closure gate.

- **DISCOVERY-2 — `bin/forge.js` umbrella dispatcher dangles.**
  - `bin/forge.js` `spawnSync`s `bin/forge-run.js` (run / default) and `bin/forge-autonomy-step.js` (step / default) — both deleted. Its `status` subcommand still works (reads JSON artifacts). No `require` of cluster source, so it was not in the import-coupled bin set.
  - **Recommendation:** add `bin/forge.js` to the retire set as a 5th bin (CTO ruling pending). Until then it remains in the tree.

---

## 8) STOP

STEP A ends here. Awaiting CTO mid-verify + a ruling on DISCOVERY-1/2 before STEP B
(full SU suite, forge-doctor, Track-A grep, status.json, closure checkpoint, LOCAL commit).
