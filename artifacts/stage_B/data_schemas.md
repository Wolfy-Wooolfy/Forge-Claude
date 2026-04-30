# Stage B — Data Schemas

```json
{
  "task_id": "TASK-067",
  "stage_binding": "B",
  "contract_clauses_satisfied": [
    "DOC-3 §4.3 data_schemas.md required output"
  ],
  "artifact_outputs": [
    "artifacts/stage_B/data_schemas.md"
  ],
  "preconditions": [
    "artifacts/stage_B/specifications.md exists"
  ],
  "stop_conditions": [],
  "closure_conditions": [
    "All canonical schemas listed with paths and SCHEMA-IDs",
    "No schema referenced without a file path"
  ],
  "execution_result": {
    "success": true,
    "artifacts_verified": true,
    "notes": "All schemas derive from docs/05_artifacts/ and docs/09_verify/."
  },
  "status": "CLOSED"
}
```

## Canonical Schema Registry

| Schema ID | File Path | Applies To |
|---|---|---|
| SCHEMA-01 | `docs/06_progress/status_schema_v2.json` | `progress/status.json` |
| SCHEMA-02 | `docs/05_artifacts/task_artifact_schema_v1.json` | `artifacts/tasks/TASK-*.md` |
| SCHEMA-03 | `docs/09_verify/trace_matrix_schema_v1.json` | `artifacts/stage_C/code_trace_matrix.md` |
| SCHEMA-04 | `docs/09_verify/mismatch_report_schema_v1.json` | `artifacts/stage_C/code_mismatch_report.md` |
| SCHEMA-05 | `docs/09_verify/verification_evidence_schema_v1.json` | `artifacts/stage_C/test_evidence.md` |
| SCHEMA-06 | `docs/05_artifacts/stage_closure_schema_v1.json` | Stage closure artifacts |
| SCHEMA-07 | `docs/04_autonomy/forge_state_schema_v1.json` | `artifacts/forge/forge_state.json` |

## Embedded JSON Rule (DOC-21)

All artifacts with a canonical schema MUST:
- Be a Markdown container (`.md`)
- Contain exactly one embedded JSON block using ` ```json ` fence
- Have the JSON block at the top of the file, after the title header
- The embedded JSON is the machine-authoritative truth

## Forbidden Formats

- `~~~json` fence: FORBIDDEN — use ` ```json ` only
- Raw `.json` files for schema-bound artifacts: FORBIDDEN (except where schema explicitly permits)
- Multiple JSON blocks in one artifact: FORBIDDEN
