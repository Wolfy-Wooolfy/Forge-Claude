# TASK-046 — Stage A Verification Contract

## Task
- Task ID: TASK-046
- Task Name: Stage D Release Manifest v2 (Update hashes reference)
- Stage Binding: D
- Contract Type: VERIFICATION-CONTRACT
- Execution Class: DETERMINISTIC (FAIL-CLOSED)

## Preconditions (Hard)
- progress/status.json.current_stage MUST be "D"
- progress/status.json.stage_progress_percent MUST be 100
- artifacts/stage_D/release_manifest.md MUST exist
- release_local_v2.hashes.json MUST exist

## Execution Requirements
- Must emit artifacts/stage_D/release_manifest.v2.md
- Must emit artifacts/stage_D/release_gate_evidence.v2.md
- Must emit artifacts/tasks/TASK-046.execution.closure.md
- Must set next_step to "READY — stable verified snapshot established (release_local_v2.hashes.json)"
- Must keep current_task empty after execution

## Fail-Closed Conditions
- Missing any precondition → FAIL
- Missing any required output artifact → FAIL