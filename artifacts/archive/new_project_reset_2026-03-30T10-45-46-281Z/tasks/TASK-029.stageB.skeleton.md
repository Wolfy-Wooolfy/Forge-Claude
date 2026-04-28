# TASK-029 — Stage B Deterministic Multi-Step Skeleton (Non-Executable)

## Purpose

Define structural constraints required for bounded multi-step execution.

## Structural Guarantees

- max_steps parameter must be explicitly provided
- Default max_steps = 1
- No implicit multi-step behavior
- No recursive execution
- No loop without explicit cap
- Execution must stop immediately when:
  - next_step == IDLE
  - blocking_questions not empty
  - integrity failure
  - stage_progress_percent == 100

## Execution Impact

None.

This skeleton introduces:
- No autonomy expansion
- No decision logic
- No scheduling
- No background execution