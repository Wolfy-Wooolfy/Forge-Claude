# TASK-040 — Stage A Contract (Encoding Normalization)

## Task Identity
- Task ID: TASK-040
- Task Name: Stage C Encoding Normalization (Corrective Artifact)
- Stage Binding: C

## Purpose
Emit a corrected Stage C closure artifact with UTF-8 safe encoding,
without modifying the original CLOSED artifact.

## Inputs
- artifacts/stage_C/stage_C.closure.md

## Required Outputs
- artifacts/stage_C/stage_C.closure.v2.md

## Rules
- Do NOT modify v1 artifact
- Emit v2 artifact with identical content except encoding-safe title:
  "# Stage C — Closure"
- Must log encoding anomaly reference to v1

## Closure
- Must emit:
  - artifacts/tasks/TASK-040.execution.closure.md
- Must return:
  - stage_progress_percent: 100
  - closure_artifact: true
