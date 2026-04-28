# TASK-044 — Stage A Verification Contract

## Task
- Task ID: TASK-044
- Task Name: Stage D Closure
- Stage Binding: D
- Contract Type: VERIFICATION-CONTRACT
- Execution Class: DETERMINISTIC (FAIL-CLOSED)

## Preconditions (Hard)
- progress/status.json.current_stage MUST be "D"
- progress/status.json.stage_progress_percent MUST be 75
- artifacts/tasks/TASK-043.execution.closure.md MUST exist

## Execution Requirements
- Must emit artifacts/stage_D/stage_D.closure.md
- Must emit artifacts/tasks/TASK-044.execution.closure.md
- Must return stage_progress_percent = 100
- Must clear current_task

## Fail-Closed Conditions
- Missing any required output artifact → FAIL
- stage_progress_percent not exactly 100 → FAIL
- current_task not cleared → FAIL
