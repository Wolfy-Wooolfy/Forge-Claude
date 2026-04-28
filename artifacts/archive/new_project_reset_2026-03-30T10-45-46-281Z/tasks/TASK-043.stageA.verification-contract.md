# TASK-043 — Stage A Verification Contract

## Task
- Task ID: TASK-043
- Task Name: Stage D Verification Matrix (Docs Presence)
- Stage Binding: D
- Contract Type: VERIFICATION-CONTRACT
- Execution Class: DETERMINISTIC (FAIL-CLOSED)

## Preconditions (Hard)
- progress/status.json.current_stage MUST be "D"
- progress/status.json.stage_progress_percent MUST be 50
- artifacts/tasks/TASK-042.execution.closure.md MUST exist

## Execution Requirements
- Must verify existence of:
  - docs/01_system
  - docs/02_scope
  - docs/03_pipeline
  - docs/04_autonomy
  - docs/05_artifacts
  - docs/06_progress
  - docs/07_decisions
  - docs/08_audit
  - docs/09_verify
  - docs/10_runtime
- Each directory MUST contain at least one .md file
- Must emit artifacts/stage_D/docs_presence_report.md
- Must emit artifacts/stage_D/docs_presence_evidence.md
- Must emit artifacts/tasks/TASK-043.execution.closure.md
- Must return stage_progress_percent = 75
- Must patch status to:
  - current_task = "TASK-044: Stage D Closure"
  - next_step = "Stage D — Execute TASK-044 to emit Stage D closure artifact and clear current_task"

## Fail-Closed Conditions
- Missing any required docs directory → FAIL
- Any required docs directory has 0 markdown files → FAIL
- Missing any required output artifact → FAIL
- stage_progress_percent not exactly 75 → FAIL
