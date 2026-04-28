# TASK-027 — Stage A Autonomy Execution Report Contract (Read-Only)

## Purpose
Provide a deterministic, read-only execution report
after any autonomy attempt (success or failure),
without influencing execution or state.

## Report Nature
- Generated AFTER execution attempt
- Read-only artifact
- Non-authoritative
- Immutable

## Report MAY Include
- execution_id
- start_timestamp
- end_timestamp
- triggered_by (manual / cli)
- autonomy_mode (single-step)
- attempted_next_step
- executed_step (if any)
- execution_result (SUCCESS | FAIL | ABORT)
- stop_reason
- runtime_seconds
- integrity_status
- runtime_readiness_status
- references:
  - status_snapshot_before
  - status_snapshot_after
  - verification_results (if any)
  - decision_log_references (if any)

## Report MUST NOT
- Influence next_step
- Modify progress/status.json
- Trigger retries
- Trigger decisions
- Invoke Stage D
- Invoke decision logging
- Invoke further autonomy

## Creation Rules
- Report is created exactly once per autonomy attempt
- Report creation failure MUST NOT affect execution outcome
- Report generation errors are logged to stdout only

## Storage Rules
- Stored as immutable artifact
- No overwriting
- No deletion
- One report per execution attempt

## Exit Criteria
- Report contract frozen
- No implementation yet
