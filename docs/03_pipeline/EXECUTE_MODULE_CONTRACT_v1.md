# EXECUTE_MODULE_CONTRACT_v1

Document ID: DOC-36  
Status: EXECUTION-BOUND  
Authority Level: HARD (Fail-Closed)  
Applies To: SELF_BUILDING_SYSTEM  
Governed By: MODULE_ORCHESTRATION_GOVERNANCE_v1  

---

# 1. Purpose

Execute Module performs deterministic code implementation
based strictly on approved gap actions.

Execute is the only module authorized to:

- Create new code files
- Modify existing code files
- Register new modules
- Extend runtime behavior
- Update orchestration logic

Execute MUST NOT:

- Refactor beyond approved scope
- Optimize
- Improve design
- Introduce new features
- Reinterpret requirements

Execute is corrective, not creative.

---

# 2. Activation Preconditions

Execute may execute ONLY IF:

- Backfill completed successfully
- Decision Gate completed successfully
- BLOCKED state is false
- gap_actions.json exists
- Approved actions include code-level implementation

If any condition fails → halt immediately.

---

# 3. Read-Before-Change Law

Before modifying any file, Execute MUST:

1) Read the current authoritative version of the file  
2) Read all directly dependent or related files  
3) Confirm file paths explicitly  
4) Verify no concurrent modification occurred  

Execute MUST explicitly log:

"READ COMPLETE: <file paths>"

If confirmation missing → execution invalid.

---

# 4. Scope Control Rules

Execute MUST modify ONLY:

- Files explicitly referenced in approved actions
- Files inside code/src/
- Related registry or orchestrator files if required

Execute MUST NOT:

- Touch docs/
- Touch artifacts/
- Touch progress/status.json directly
- Modify stage contracts
- Modify governance documents

---

# 5. Deterministic Modification Rules

All modifications MUST:

- Be explicit (add / replace / delete)
- Be minimal
- Preserve formatting consistency
- Preserve existing logic unless explicitly replaced
- Avoid dynamic timestamps
- Avoid environment-specific logic

If replacing code, replacement MUST be complete and reproducible.

---

# 6. Execution Artifacts (Mandatory)

Execute MUST generate:

1) artifacts/execute/execute_plan.json  
2) artifacts/execute/execute_diff.md  
3) artifacts/execute/execute_log.md  

---

# 7. execute_plan.json Schema

{
  "execution_id": "",
  "approved_code_actions": [
    {
      "action_id": "",
      "target_file": "",
      "modification_type": "ADD | REPLACE | DELETE",
      "reason": "",
      "linked_gap_id": ""
    }
  ]
}

---

# 8. execute_diff.md Requirements

Must include:

- File path
- Before snapshot hash (if available)
- After snapshot hash
- Explicit change description
- Deterministic confirmation statement

No narrative explanation allowed.

---

# 9. File Creation Rules

If creating new file:

- Must confirm path legality
- Must confirm file does not already exist
- Must use deterministic template
- Must register in appropriate runtime registry (if required)

Duplicate creation attempt → halt.

---

# 10. Code Replacement Rules

If replacing file:

- Must confirm full replacement authorized
- Must preserve module export integrity
- Must validate no syntax corruption introduced
- Must not break registry unless authorized

Partial undocumented replacement forbidden.

---

# 11. Registry Integrity Rule

If modifying task_registry or orchestrator:

- Must preserve existing handlers
- Must not remove unrelated entries
- Must maintain deterministic ordering
- Must log registry diff explicitly

---

# 12. Fail-Closed Conditions

Execute MUST halt if:

- Attempt to modify unauthorized file
- Attempt to modify governance docs
- Attempt to alter status.json
- File read confirmation missing
- Duplicate action_id detected
- execute_plan.json malformed
- Syntax corruption detected

Upon halt:

- artifacts/execute/execute_error.md MUST be generated
- System enters BLOCKED
- Exactly ONE blocking question must be produced

---

# 13. Downstream Invalidation Rule

After Execute completes:

Invalidate:

- closure/

Trace, Gap, Decision remain valid unless structural changes require re-run.

If structural mapping changed → Trace must re-run.

---

# 14. Completion Criteria

Execute is COMPLETE only when:

- execute_plan.json exists
- execute_diff.md exists
- execute_log.md exists
- All approved code actions executed exactly once
- No halt condition triggered

Only then may Closure begin.

---

# 15. Governance Integrity Statement

Execute is the most dangerous module.

Without strict scope enforcement,
SELF_BUILDING_SYSTEM degenerates into uncontrolled automation.

Execute must be:

- Deterministic
- Scoped
- Logged
- Reproducible
- Auditable

No silent mutation permitted.

---

END OF DOCUMENT