# INTAKE_MODULE_CONTRACT_v1

Document ID: DOC-30  
Status: EXECUTION-BOUND  
Authority Level: HARD (Fail-Closed)  
Applies To: SELF_BUILDING_SYSTEM  
Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1  

---

# 1. Purpose

The Intake Module is the mandatory entry point of the SELF_BUILDING_SYSTEM.

Its purpose is to:

- Lock repository snapshot
- Classify execution entry state
- Produce deterministic repository inventory
- Establish execution context
- Prevent undefined starting conditions

No downstream module may execute without successful Intake completion.

---

# 2. Activation Conditions

Intake activates when:

- governed Forge runtime artifacts indicate a valid deterministic entry condition
OR
- A new execution cycle is registered

Before execution:

- Repository must be snapshot-locked
- No file mutation is allowed during intake scan

---

# 3. Deterministic Repository Scan

The Intake Module MUST:

1. Recursively scan repository root
2. Exclude:
   - node_modules/
   - .git/
   - system temp folders
3. Sort files lexicographically
4. Record:
   - file path
   - file size
   - file hash (if available)
   - last modified timestamp (captured, not trusted for logic)

Scan result must be deterministic.

---

# 4. Entry Classification Logic

Intake MUST classify repository state into ONE of the following:

- IDEA_ONLY
- DOCS_ONLY
- CODE_ONLY
- DOCS_AND_CODE
- FULL_PIPELINE_STATE

Classification Rules:

IDEA_ONLY:
- No code/
- Minimal or no docs/
- No artifacts/

DOCS_ONLY:
- docs/ present
- No code/

CODE_ONLY:
- code/ present
- No docs/

DOCS_AND_CODE:
- docs/ and code/ present
- No active artifacts state

FULL_PIPELINE_STATE:
- docs/
- code/
- artifacts/
- governed runtime state artifacts present and valid
- `progress/status.json` optional as reflection/output validation only

Classification MUST be rule-based.
No inference beyond structural presence.

---

# 5. Intake Artifacts (Mandatory)

Intake MUST generate:

1) artifacts/intake/intake_snapshot.json  
2) artifacts/intake/intake_context.json  
3) artifacts/intake/intake_report.md  
4) artifacts/intake/repository_inventory.json  

---

# 6. intake_snapshot.json Schema

Must include:

- execution_id
- snapshot_timestamp
- total_files
- total_directories
- classification
- repository_root_hash (if available)
- locked_snapshot_flag: true

---

# 7. repository_inventory.json Schema

Must include array of:

[
  {
    "path": "",
    "size_bytes": 0,
    "hash": "",
    "captured_at": ""
  }
]

Array MUST be sorted lexicographically by path.

---

# 8. intake_report.md Content

Must include:

- Classification result
- Justification rules triggered
- Observed structural components
- Intake validation summary
- Deterministic confirmation statement

No narrative explanation permitted.
Only structured reasoning.

---

# 9. Fail-Closed Conditions

Intake MUST halt if:

- governed runtime state artifact corrupted
- or status reflection corrupted in a way that prevents reporting fidelity
- Repository unreadable
- File access denied
- Duplicate path anomalies
- Snapshot cannot be locked
- Hash computation fails (if hashing required)

Upon halt:

- artifacts/intake/intake_error.md MUST be generated
- System MUST enter BLOCKED state
- Exactly ONE blocking question must be produced

---

# 10. Downstream Invalidation Rule

If Intake re-runs:

All downstream artifacts MUST be invalidated:

- audit/
- trace/
- gap/
- decisions/
- backfill/
- execute/
- closure/

No exception permitted.

---

# 11. Security & Isolation Rules

Intake MUST NOT:

- Modify files
- Infer intent
- Access external APIs
- Trigger code execution
- Trust system time for logic

Intake is strictly read-only.

---

# 12. Runtime Enforcement Requirement

Forge runtime MUST:

- Prevent Audit from starting before Intake success
- Validate existence of intake_snapshot.json
- Validate existence of intake_context.json
- Validate existence of intake_report.md
- Validate existence of repository_inventory.json
- Validate locked_snapshot_flag == true

Failure results in execution halt.

---

# 13. Completion Criteria

Intake is considered COMPLETE only when:

- All four mandatory artifacts exist
- No fail-closed condition triggered
- Snapshot is locked
- Classification is valid
- Repository inventory matches scan count

Only then may Audit begin.

---

END OF DOCUMENT