# TASK-045 — Stage A Verification Contract

## Task
- Task ID: TASK-045
- Task Name: Stage D Release Manifest + Gate Closure
- Stage Binding: D
- Contract Type: VERIFICATION-CONTRACT
- Execution Class: DETERMINISTIC (FAIL-CLOSED)

## Preconditions (Hard)
- progress/status.json.current_stage MUST be "D"
- progress/status.json.stage_progress_percent MUST be 100
- artifacts/stage_D/stage_D.closure.md MUST exist
- release_local.hashes.json MUST exist

## Execution Requirements
- Must emit artifacts/stage_D/release_manifest.md
- Must emit artifacts/stage_D/release_gate_evidence.md
- Must emit artifacts/tasks/TASK-045.execution.closure.md
- Must set next_step to "READY — stable verified snapshot established"
- Must keep current_task empty after execution

## Fail-Closed Conditions
- Missing any precondition → FAIL
- Missing any required output artifact → FAIL
