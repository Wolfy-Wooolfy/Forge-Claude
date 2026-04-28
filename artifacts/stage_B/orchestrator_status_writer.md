# Orchestrator Spec - Status Writer (Canonical)

**Task ID:** TASK-001  
**Stage:** B (Specification)  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Purpose

Define the deterministic behavior for the orchestrator component responsible for writing the single authoritative live execution state to:

- `progress/status.json`

This spec covers ONLY status writing. No agent execution, no stage logic, no audit execution.

This spec is binding ONLY insofar as it matches the higher-authority contract:
- `docs/06_progress/06_Progress_Tracking_and_Status_Report_Contract_v1.md`

---

## 2. Authoritative Output

### 2.1 File
- Output file MUST be: `progress/status.json`

### 2.2 Schema (Exact Fields Only)

The JSON object MUST contain EXACTLY these fields (no extras), and MUST match DOC-06 literally:

- `status_type` (string) — MUST be `"LIVE"` ONLY
- `current_stage` (string)
- `overall_progress_percent` (integer 0..100)
- `stage_progress_percent` (integer 0..100)
- `last_completed_artifact` (string)
- `current_task` (string)
- `issues` (array)
- `blocking_questions` (array)
- `next_step` (string)

No additional fields are permitted.

---

## 3. Write Mode (Hard Rule)

Status writing MUST be a full overwrite.

- Partial edits are forbidden
- Append mode is forbidden

---

## 4. Fail-Closed Rules (Binding)

If the payload does not match the schema EXACTLY:
- Writing MUST fail
- No file output MUST occur

If `status_type` is not exactly `"LIVE"`:
- Writing MUST fail

If `blocking_questions` contains 1 item:
- It MUST be a non-empty string
- `next_step` MUST be an empty string

If `blocking_questions` is empty:
- `next_step` MAY be non-empty

If `overall_progress_percent` is `100`:
- `next_step` MUST be an empty string

---

END
