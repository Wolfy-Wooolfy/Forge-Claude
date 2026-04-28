# TASK-033 — Stage A Trace Engine Contract (SCHEMA-03/04/05)

## Objective

Implement a deterministic Trace Engine task handler that generates Stage C verification artifacts:
- artifacts/stage_C/code_trace_matrix.md (SCHEMA-03)
- artifacts/stage_C/code_mismatch_report.md (SCHEMA-04)
- artifacts/stage_C/test_evidence.md (SCHEMA-05)

## Scope

- Register TASK-033 handler in code/src/execution/task_registry.js
- Generate the three Stage C artifacts with embedded JSON
- Generate deterministic closure artifact at artifacts/tasks/TASK-033.execution.closure.md

## Constraints

- Must be deterministic (no network, no LLM, no non-deterministic randomness)
- Must preserve Fail-Closed behavior
- Must respect canonical artifact paths
- Must not bypass schema rules for embedded JSON artifacts

## Success Criteria

- Task contract exists (this file) and is discoverable by prefix TASK-033
- TASK-033 executes successfully when selected by the orchestrator
- All three Stage C artifacts are created at canonical paths
- Execution closure artifact is created at deterministic expected path
