# TASK-023 — Stage A Autonomy Contract (Controlled)

## Objective
Enable a strictly controlled autonomy loop that can execute HALO pipeline
steps without continuous human intervention, while preserving fail-closed guarantees.

## Autonomy Nature
- Opt-in only (explicit start command)
- Time-boxed execution
- Single-session only (no persistence)
- No background or daemon execution

## Allowed Capabilities
- Read progress/status.json
- Execute next_step if deterministic
- Write progress/status.json
- Stop execution on:
  - BLOCKED state
  - Missing artifact
  - Ambiguous next_step
  - Time limit reached

## Explicitly Forbidden
- Decisions
- Stage D invocation
- Long-running loops
- Timers / schedulers
- Network calls
- Parallel execution
- Memory mutation outside status.json

## Start Conditions
Autonomy MAY start only if:
- status.json next_step starts with "Stage"
- No blocking_questions exist
- Integrity PASS
- Runtime readiness PASS

## Stop Conditions (Hard)
Autonomy MUST stop immediately if:
- Execution time exceeds MAX_RUNTIME
- next_step == IDLE
- Any FAIL gate is hit
- A blocking question is produced

## MAX_RUNTIME
- Default: 30 minutes
- Hard upper bound: 60 minutes
- No auto-extension

## Observability
- All actions logged to stdout
- No hidden state

## Exit Criteria
- Contract approved
- No implementation yet
