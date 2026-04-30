# Stage B — Edge Cases

```json
{
  "task_id": "TASK-067",
  "stage_binding": "B",
  "contract_clauses_satisfied": [
    "DOC-3 §4.3 edge_cases.md required output"
  ],
  "artifact_outputs": [
    "artifacts/stage_B/edge_cases.md"
  ],
  "preconditions": [
    "artifacts/stage_B/specifications.md exists",
    "artifacts/stage_B/validation_rules.md exists"
  ],
  "stop_conditions": [],
  "closure_conditions": [
    "All edge cases are deterministically classified",
    "No speculative edge cases included"
  ],
  "execution_result": {
    "success": true,
    "artifacts_verified": true
  },
  "status": "CLOSED"
}
```

## Edge Case Registry

### EC-001 — Artifact exists but has no embedded JSON
**Condition:** `.md` artifact exists but contains no ` ```json ` block
**Classification:** Legacy-narrative-only (DOC-21 §7)
**Behavior:** MUST NOT be used as closure evidence. MUST be migrated before Stage C closes.
**Resolution:** Add embedded JSON conforming to SCHEMA-02 without modifying narrative content.

### EC-002 — `current_task` is empty string in status.json
**Condition:** `current_task: ""` when no task is active
**Classification:** Valid state (DOC-18 §6)
**Behavior:** PASS — empty string is the correct value when no task is running.

### EC-003 — Stage closure artifact exists but not schema-bound
**Condition:** `stage_X.closure.md` exists with no embedded JSON
**Classification:** Governance violation
**Behavior:** Closure has no machine-verifiable authority. MUST be remediated.
**Resolution:** Add embedded JSON conforming to SCHEMA-06.

### EC-004 — Duplicate Document ID detected
**Condition:** Two documents share the same DOC-XX or HALO-DOC-XX identifier
**Classification:** Governance violation (DOC-20 §8)
**Behavior:** Execution MUST enter BLOCKED state.
**Resolution:** Assign unique IDs per DOC-20 §6. Update DOC-19 index.

### EC-005 — `v2` file next to closed artifact
**Condition:** `artifact.v2.md` exists alongside `artifact.md` that is already closed
**Classification:** Mutation of immutable artifact (DOC §7.2)
**Behavior:** CRITICAL fault. Execution MUST halt. Human escalation required.
**Resolution:** The `.v2` file may only exist if a rollback Decision artifact explicitly mandates it.

### EC-006 — Namespace not listed in MODULE_ORCHESTRATION_GOVERNANCE §11
**Condition:** Module writes to `artifacts/new_namespace/` not in governance
**Classification:** CRITICAL violation
**Behavior:** Execution MUST halt immediately. Governance violation recorded.
**Resolution:** Add namespace to SYSTEM-GOVERNED table in MODULE_ORCHESTRATION_GOVERNANCE before next run.

### EC-007 — `~~~json` fence used instead of backtick fence
**Condition:** Artifact uses tilde fence for JSON block
**Classification:** DOC-21 §3.2 violation
**Behavior:** Validator cannot extract JSON. Artifact treated as non-existent.
**Resolution:** Replace `~~~json` with ` ```json ` and `~~~` with ` ``` `.
