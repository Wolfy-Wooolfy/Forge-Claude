# Autonomy Execution Report Schema (Skeleton)

**Status:** SKELETON — NON-EXECUTABLE  
**Authority:** Non-authoritative (Report-only)  
**Rule:** Must not trigger execution, must not write state.

## Fields

- execution_id: string
- start_timestamp: string (ISO-8601)
- end_timestamp: string (ISO-8601)
- triggered_by: string (manual | cli)
- autonomy_mode: string (single-step)
- attempted_next_step: string
- executed_step: string
- result: string (SUCCESS | FAIL)
- error: object | null
  - name: string
  - message: string
  - stack: string
- status_snapshot: object
  - current_stage: string
  - current_task: string
  - next_step: string
  - stage_progress_percent: number
  - last_completed_artifact: string