# TASK-038 — Stage A Contract (Trace Rebuild)

## Task Identity
- Task ID: TASK-038
- Task Name: Rebuild Stage C Clause-Level Trace Rows
- Stage Binding: C

## Purpose
Rebuild `artifacts/stage_C/code_trace_matrix.md` to include clause-level MUST rows derived from Stage C requirements in:
- `docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md`

## Inputs
- `docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md`
- `artifacts/stage_C/code_trace_matrix.md`
- `artifacts/stage_C/code_mismatch_report.md`

## Required Outputs
- Update `artifacts/stage_C/code_trace_matrix.md` to include clause-level rows with IDs:
  - `STAGE_C.CLAUSE.MUST.001+`
- Ensure `artifacts/stage_C/code_mismatch_report.md` keeps:
  - `MM-TRACE-001` in status `RESOLVED`

## Determinism Rules
- No network access
- File paths MUST be canonical
- Output MUST embed JSON under `~~~json`

## Closure
- Must produce deterministic closure artifact:
  - `artifacts/tasks/TASK-038.execution.closure.md`
- Must return `stage_progress_percent` >= 65
