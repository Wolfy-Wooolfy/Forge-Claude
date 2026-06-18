# Runtime Entrypoints and Tooling
Document ID: DOC-RT-10_10
Status: EXECUTION-BOUND
Scope: Runtime + CLI entrypoints + tooling contracts

## 1) Purpose

This document defines the executable entrypoints and tooling that operate Forge as a deterministic, fail-closed pipeline.

It is execution-bound in the sense that:
- All runtime commands MUST map to existing code entrypoints.
- All pre-run and integrity checks MUST be reproducible and auditable.
- Smoke tests provide bounded verification evidence.

## 2) Repository Entry Points

### 2.1 Primary CLI Entrypoints

> **⚠ RETIRED — PHASE-38 (2026-06-19).** The Forge-v1 self-build CLI cluster described in this section was **deleted from the active tree** per `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md` (basis: the PHASE-37 reachability audit found it unreachable from the live API). The **live entrypoint is `start-api.js`** (`npm start`); the live tooling CLIs are `bin/forge-doctor.js` and `bin/forge-test.js`. The descriptions below are retained for historical mapping only and no longer describe current code. git history preserves the deleted files.

The following CLI entrypoints were RETIRED (deleted) in PHASE-38:
- `bin/forge-autonomous-run.js` — (was) the governed autonomous pipeline runner.
- `bin/forge-run.js`, `bin/forge-autonomy-step.js` — (were) status-driven run/step wrappers.
- `bin/forge-build-state.js` — (was) the Forge self-build state writer (via `code/src/forge/forge_state_writer.js`).
- `bin/forge.js` — umbrella dispatcher that spawned the above; flagged for follow-up retirement (PHASE-38 STEP A note).

### 2.2 Core Runtime Modules

> **⚠ RETIRED — PHASE-38 (2026-06-19).** `code/src/orchestrator/*` and `code/src/execution/*` listed below were **deleted** per `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md`. The live pipeline is `code/src/runtime/orchestration/*` + `code/src/ai_os/conversationEngine.js`. The lists below are historical mapping only.

#### Orchestrator
Paths:
- code/src/orchestrator/runner.js
- code/src/orchestrator/stage_transitions.js
- code/src/orchestrator/status_writer.js

Responsibilities:
- runner.js: runtime control loop and bounded execution sequencing.
- stage_transitions.js: gate and stage transition enforcement.
- status_writer.js: governed mutation of the human-visible status reflection at `progress/status.json`.

#### Task Execution
Paths:
- code/src/execution/task_executor.js
- code/src/execution/task_registry.js

Responsibilities:
- task_registry.js: resolves a task name to a handler implementation.
- task_executor.js: validates handler output schema and enforces task contracts.

## 3) Tooling

### 3.1 Pre-run checks
Path:
- tools/pre_run_check.js

Purpose:
- Validates runtime environment prerequisites and repository readiness.
- Fail-closed if required inputs or directories are missing.

Output:
- Must end in PASS for execution to proceed under governed runs.

### 3.2 Integrity verification
Path:
- tools/integrity.js

Baseline reference:
- release_local_v2.hashes.json

Purpose:
- Verifies repository file integrity against the baseline hashes file.

Rule:
- Integrity verification must pass before any governed execution that claims baseline compliance.

## 4) Verify and Smoke

### 4.1 Smoke tests
Paths:
- verify/smoke/runner_smoke.js
- verify/smoke/runner_dry_run_smoke.js
- verify/smoke/status_writer_smoke.js
- verify/smoke/stage_transitions_smoke.js

Purpose:
- Provide bounded functional checks for orchestrator and status mutation logic.
- Fail-closed: any smoke failure blocks execution claims.

## 5) Known Gaps and Mapping Notes

1) Some verification expectations exist as specifications under docs/09_verify/* while runtime smoke exists under verify/smoke/*.
2) If a verify output is specified in docs but not produced by code, it must be treated as a documentation-to-code gap and handled via a governed backfill task.

## 6) Non-authority Clause

This document does not override the governed runtime authority model.
`progress/status.json` is a reflection/output artifact for status visibility.

> **⚠ RETIRED — PHASE-38 (2026-06-19).** The legacy self-build authority model described in this clause (`artifacts/forge/forge_state.json`, `artifacts/orchestration/orchestration_state.json`, `code/src/orchestrator/pipeline_definition.js` module order) belonged to the Forge-v1 self-build cluster, **deleted** per `DECISION-2026-06-19-phase-38-legacy-cluster-retire.md`. It no longer governs the live runtime (the v2 live surface is `start-api.js → apiServer.js` + `ai_os/**` + `runtime/**`). Retained for historical mapping only.