# TASK-026 — Stage A Single-Step Autonomy Contract

## Objective
Enable a manually triggered autonomy capability that performs
AT MOST ONE deterministic pipeline advancement per invocation.

## Autonomy Scope
- Manual trigger only
- Single-step execution (one advancement max)
- Synchronous execution
- Time-boxed
- Fail-closed on any ambiguity or failure

## Allowed Capabilities
- Read progress/status.json
- Validate next_step starts with "Stage"
- Execute ONE deterministic transition
- Write updated progress/status.json
- Emit stdout logs

## Explicitly Forbidden
- Background loops
- Multiple steps per run
- Automatic retries
- Stage D invocation
- Decision selection
- Network calls
- Parallel execution
- Any state mutation outside progress/status.json

## Start Conditions (ALL REQUIRED)
- HALO_AUTONOMY=1
- Explicit CLI invocation
- next_step starts with "Stage"
- No blocking_questions present
- Integrity PASS
- Runtime readiness PASS

## Hard Stop Conditions (IMMEDIATE)
- One step executed
- next_step == IDLE
- BLOCKED state produced
- Any FAIL gate hit
- Runtime exceeds MAX_RUNTIME_SECONDS

## Runtime Limits
- MAX_RUNTIME_SECONDS: 60
- No extension allowed

## Observability
- Log start/end
- Log executed step
- Log stop reason
- No hidden state

## Exit Criteria
- Contract frozen
- No implementation yet
