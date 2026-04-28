# TASK-050 — StageA Contract — MODULE_FLOW — Trace

## Task Identity
- Task ID: TASK-050
- Stage Binding: D
- Contract Type: STAGE-A
- Module: TRACE
- Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1
- Source Contract: docs/03_pipeline/TRACE_ENGINE_CONTRACT_v1.md

## Purpose
Execute the Trace Module to build deterministic mappings between:
- EXECUTION-BOUND requirements (docs)
- Code units
- Produced artifacts

Trace detects gaps only. It MUST NOT modify docs/code to fix gaps.

## Activation Preconditions (Fail-Closed)
Trace may execute ONLY IF ALL are true:
- artifacts/intake/intake_snapshot.json exists
- artifacts/audit/audit_findings.json exists
- audit_findings.blocked == false
- intake_snapshot.locked_snapshot_flag == true

If any fails → halt immediately and write a BLOCKED artifact (no partial outputs).

## Required Outputs
Trace MUST generate:
- artifacts/trace/trace_matrix.json
- artifacts/trace/trace_matrix.md

Both MUST be deterministic and consistent with TRACE_ENGINE_CONTRACT_v1 schema.

## Closure Artifact
On successful execution, the task MUST create:
- artifacts/tasks/TASK-050.execution.closure.md
And closure MUST include:
- task: TASK-050
- stage: D
- stage_progress_percent: 100
- closure_artifact: true
- references to generated artifacts

## Postconditions
- On PASS: stage_progress_percent stays 100 and current_task cleared (clear_current_task: true)
- On BLOCKED: do NOT clear current_task; must set blocking reason in status_patch.blocking_questions