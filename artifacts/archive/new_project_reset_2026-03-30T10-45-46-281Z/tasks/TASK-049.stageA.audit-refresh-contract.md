# TASK-049 — StageA Contract — Audit Refresh

## Task Identity
- Task ID: TASK-049
- Stage Binding: D
- Contract Type: STAGE-A
- Purpose: Execute an Audit refresh run (NamingAuthority + deprecated term scan) and produce an execution closure artifact.

## Preconditions (Fail-Closed)
- progress/status.json MUST have:
  - current_task = "TASK-049"
  - current_stage = "D"
- artifacts/tasks MUST contain at least one file starting with "TASK-049" (this contract satisfies that).
- artifacts/tasks/TASK-049.execution.closure.md MUST NOT exist before execution (idempotency).

## Execution
- Handler: TASK-049 registry entry
- Operation: runAudit(status) then write closure artifact.

## Outputs (Required)
- artifacts/tasks/TASK-049.execution.closure.md
  - MUST be created on successful execution
  - MUST include:
    - task: TASK-049
    - timestamp: ISO
    - stage: from status
    - stage_progress_percent: 100

## Postconditions
- On success:
  - stage_progress_percent MUST be 100
  - current_task MUST be cleared by status writer logic
- On failure:
  - No partial closure artifact allowed (Fail-Closed).

## Evidence
- Execution closure artifact path:
  - artifacts/tasks/TASK-049.execution.closure.md