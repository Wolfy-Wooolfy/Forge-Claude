# TASK-042 — Stage A Verification Contract

## Task
- Task ID: TASK-042
- Task Name: Stage D Advance After VERIFY-05
- Stage Binding: D
- Contract Type: VERIFICATION-CONTRACT
- Execution Class: DETERMINISTIC (FAIL-CLOSED)

## Preconditions (Hard)
- progress/status.json.current_stage MUST be "D"
- progress/status.json.stage_progress_percent MUST be 25
- artifacts/tasks/TASK-041.execution.closure.md MUST exist

## Execution Requirements
- Must emit artifacts/stage_D/verify05_advance.md
- Must emit artifacts/tasks/TASK-042.execution.closure.md
- Must return stage_progress_percent = 50
- Must patch status to:
  - current_task = "TASK-043: Stage D Verification Matrix (Docs Presence)"
  - next_step = "Stage D — Execute TASK-043 to verify docs folders presence + emit evidence"

## Fail-Closed Conditions
- If any precondition is missing or false → FAIL
- If any required artifact is missing after execution → FAIL
- If stage_progress_percent decreases or is not exactly 50 → FAIL
