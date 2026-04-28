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

#### A) Governed autonomous runner
Path:
- bin/forge-autonomous-run.js

Purpose:
- Executes the governed Forge pipeline run.
- Resolves entry from authoritative runtime artifacts.
- Writes governed Forge/orchestration state and keeps status reflection synchronized.

Expected behavior:
- Fail-closed: stops on any contract mismatch or idempotency violation.
- Deterministic: same inputs produce same artifacts.
- If the pipeline is already complete, emits `PIPELINE COMPLETE — NO ACTION REQUIRED` without mutating execution continuity.

#### B) Legacy status-driven wrappers
Paths:
- bin/halo-run.js
- bin/halo-autonomy-step.js
- bin/forge.js

Purpose:
- Provide bounded compatibility tooling around the older status-driven runtime path.
- Support direct status-driven runs where explicitly invoked.

Expected behavior:
- They MUST NOT override governed runtime authority.
- They are subordinate to `bin/forge-autonomous-run.js` for current autonomous execution claims.

### 2.2 Core Runtime Modules

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
Execution authority remains with `artifacts/forge/forge_state.json`, `artifacts/orchestration/orchestration_state.json`, authoritative task closures under `artifacts/tasks/*`, and deterministic module order in `code/src/orchestrator/pipeline_definition.js`.