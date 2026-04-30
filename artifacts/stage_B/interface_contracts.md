# Stage B — Interface Contracts

```json
{
  "task_id": "TASK-067",
  "stage_binding": "B",
  "contract_clauses_satisfied": [
    "DOC-3 §4.3 interface_contracts.md required output"
  ],
  "artifact_outputs": [
    "artifacts/stage_B/interface_contracts.md"
  ],
  "preconditions": [
    "artifacts/stage_B/specifications.md exists",
    "artifacts/stage_B/data_schemas.md exists"
  ],
  "stop_conditions": [],
  "closure_conditions": [
    "All module-to-module interfaces are explicitly defined",
    "All artifact paths are canonical"
  ],
  "execution_result": {
    "success": true,
    "artifacts_verified": true
  },
  "status": "CLOSED"
}
```

## Module Interface Map

| From Module | To Module | Interface Artifact | Contract |
|---|---|---|---|
| Intake | Audit | `artifacts/intake/intake_snapshot.json` | DOC-30 |
| Audit | Trace | `artifacts/audit/audit_findings.json` | DOC-31 |
| Trace | Gap | `artifacts/trace/trace_matrix.json` | DOC-32 |
| Gap | Design Exploration | `artifacts/gap/gap_actions.json` | DOC-33 |
| Design Exploration | Decision Gate | `artifacts/exploration/option_matrix.json` | HALO-DOC-18 |
| Decision Gate | Backfill | `artifacts/decisions/module_flow_decision_gate.json` | DOC-34 |
| Backfill | Execute | `artifacts/backfill/backfill_tasks.json` | DOC-35 |
| Execute | Verify | `artifacts/execute/execute_plan.json` | DOC-36 |
| Verify | Closure | `artifacts/verify/verification_results.json` | DOC-CE-01 |
| Closure | Release | `artifacts/closure/closure_report.md` | DOC-37 |

## Stage-to-Stage Interface

| From Stage | Gate Artifact | To Stage |
|---|---|---|
| A | `artifacts/stage_A/idea_approval_record.md` (APPROVE) | B |
| B | `artifacts/stage_B/docs_gap_report.md` (zero MUST gaps) + `spec_pack_manifest.md` | C |
| C | `artifacts/stage_C/code_mismatch_report.md` (zero unresolved) + `code_trace_matrix.md` (100%) | D |
| D | `artifacts/stage_D/verification_report.md` (PASS) | RELEASE |

## Cognitive Adapter Interface

- Input: `artifacts/llm/requests/TASK-XXX.N.json`
- Output: `artifacts/llm/responses/TASK-XXX.N.json`
- Metadata: `artifacts/llm/metadata/TASK-XXX.json`
- Raw + Normalized: `artifacts/cognitive/RESP-<uuid>/raw_response.json` + `normalized_response.json`
