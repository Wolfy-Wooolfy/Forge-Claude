# TASK-029 — Stage A Deterministic Multi-Step Execution Contract

## Objective

Introduce explicitly bounded multi-step execution
without introducing autonomy expansion or execution authority increase.

## Scope

- Manual invocation only
- Explicit max_steps parameter
- Deterministic execution
- No loops beyond max_steps
- No background execution

## Non-Scope

- No autonomy scheduling
- No retries
- No recursion
- No decision engine
- No Stage D invocation

## Constraints

- Fail-Closed must remain enforced
- progress/status.json remains sole state authority
- Schema must remain unchanged
- Integrity must remain verifiable

## Success Criteria

- Multi-step execution runs at most N steps
- N must be explicitly provided
- Default max_steps = 1 (backward compatible)
- No infinite execution possible