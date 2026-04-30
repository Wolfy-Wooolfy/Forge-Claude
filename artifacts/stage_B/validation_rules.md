# Stage B — Validation Rules

```json
{
  "task_id": "TASK-067",
  "stage_binding": "B",
  "contract_clauses_satisfied": [
    "DOC-3 §4.3 validation_rules.md required output"
  ],
  "artifact_outputs": [
    "artifacts/stage_B/validation_rules.md"
  ],
  "preconditions": [
    "artifacts/stage_B/specifications.md exists"
  ],
  "stop_conditions": [],
  "closure_conditions": [
    "All gate conditions are deterministic",
    "No subjective validation rule present"
  ],
  "execution_result": {
    "success": true,
    "artifacts_verified": true
  },
  "status": "CLOSED"
}
```

## Stage Gate Validation Rules

### Stage A Gate (before Stage B)
- RULE-A1: `artifacts/stage_A/idea_final_spec.md` MUST exist
- RULE-A2: `artifacts/stage_A/idea_approval_record.md` MUST exist and contain `APPROVE`
- RULE-A3: All embedded JSON in stage_A artifacts MUST conform to SCHEMA-02
- RULE-A4: No unresolved assumptions in `validated_assumptions.md`

### Stage B Gate (before Stage C)
- RULE-B1: `artifacts/stage_B/docs_gap_report.md` MUST report zero MUST-level gaps
- RULE-B2: `artifacts/stage_B/docs_coverage_matrix.md` MUST indicate 100% MUST-level coverage
- RULE-B3: `artifacts/stage_B/spec_pack_manifest.md` MUST exist and be consistent with produced artifacts
- RULE-B4: All 8 required Stage B artifacts MUST exist under `artifacts/stage_B/`

### Stage C Gate (before Stage D)
- RULE-C1: `artifacts/stage_C/code_trace_matrix.md` MUST have `must_coverage_percent = 100`
- RULE-C2: `artifacts/stage_C/code_mismatch_report.md` MUST have `unresolved_total = 0` and `blocking = false`
- RULE-C3: `artifacts/stage_C/test_evidence.md` MUST have `status = "PASS"`
- RULE-C4: All embedded JSON MUST use ` ```json ` fence (DOC-21)
- RULE-C5: `codebase_root` in trace matrix MUST match pattern `^(code/|src/|app/|backend/|packages/)`

### Stage D Gate (Release)
- RULE-D1: `artifacts/stage_D/verification_report.md` MUST exist
- RULE-D2: Vision Coverage Matrix MUST show 100% MUST coverage
- RULE-D3: Vision Gap Report MUST have `result = "PASS"`
- RULE-D4: `artifacts/release/deployment_record.md` MUST exist
- RULE-D5: `artifacts/release/runtime_validation.md` MUST exist

## Artifact Format Validation Rules
- RULE-F1: All schema-bound artifacts MUST embed exactly ONE JSON block using ` ```json ` fence
- RULE-F2: `additionalProperties: false` — no extra fields allowed in schema-bound artifacts
- RULE-F3: All artifact filenames MUST be lowercase with underscores — no spaces, no uppercase
- RULE-F4: `progress/status.json` MUST contain `status_type: "LIVE"` and conform to SCHEMA-01
