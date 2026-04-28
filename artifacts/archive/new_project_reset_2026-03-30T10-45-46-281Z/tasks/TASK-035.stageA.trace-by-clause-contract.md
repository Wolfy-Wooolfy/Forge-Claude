# TASK-035 — Stage C Clause-Level Trace Contract

## Objective

Implement full clause-level trace mapping for Stage C.

## Scope

- Parse Stage C specification
- Extract all MUST clauses
- Map each clause to code reference
- Update artifacts/stage_C/code_trace_matrix.md
- Update artifacts/stage_C/code_mismatch_report.md
- Remove MM-TRACE-001 if resolved

## Constraints

- Deterministic
- No LLM
- No external network
- Pure file parsing and static analysis

## Success Criteria

- All MUST clauses explicitly mapped
- Trace coverage 100%
- No TRACE_GAP mismatches remaining
