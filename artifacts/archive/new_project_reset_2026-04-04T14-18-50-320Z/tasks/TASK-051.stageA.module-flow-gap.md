# TASK-051 — StageA Contract — MODULE_FLOW — Gap

## Task Identity
- Task ID: TASK-051
- Stage Binding: D
- Contract Type: STAGE-A
- Module: GAP
- Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1
- Source Contract: docs/03_pipeline/GAP_ENGINE_CONTRACT_v1.md

## Purpose
Execute the Gap Module to detect structured gaps between:
- Requirements (docs)
- Code units
- Produced artifacts
- Execution state

Gap MUST NOT fix.
Gap MUST NOT modify docs/code.
Gap outputs corrective actions only.

## Activation Preconditions (Fail-Closed)
Gap may execute ONLY IF ALL are true:
- artifacts/intake/intake_snapshot.json exists
- artifacts/audit/audit_findings.json exists
- artifacts/trace/trace_matrix.json exists
- audit_findings.blocked == false
- No BLOCKED state active in progress/status.json (blocking_questions empty)

If any fails → halt immediately with no partial outputs.

## Required Outputs
Gap MUST generate:
- artifacts/gap/gap_report.md
- artifacts/gap/gap_actions.json

Both MUST be deterministic and consistent with GAP_ENGINE_CONTRACT_v1 schema.

## Closure Artifact
On successful execution, the task MUST create:
- artifacts/tasks/TASK-051.execution.closure.md

Closure MUST include:
- task: TASK-051
- stage: D
- stage_progress_percent: 100
- closure_artifact: true
- references to generated artifacts

## Postconditions
- On PASS: stage_progress_percent stays 100 and current_task cleared (clear_current_task: true)
- On BLOCKED: do NOT clear current_task; must set blocking reason in status_patch.blocking_questions