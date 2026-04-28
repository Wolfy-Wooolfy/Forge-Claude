# TASK-064 — Stage A — Forge Build State Governance Gate Contract

## 1. Objective

Define a deterministic governance rule that binds Forge execution permission to the derived build state.

The system must prevent any autonomous execution if Forge's internal build state is not valid.

---

## 2. Scope

This contract governs:

* bin/forge-autonomous-run.js
* code/src/orchestrator/autonomous_runner.js
* code/src/modules/decisionGate.js

---

## 3. Authoritative State Source

The only valid source of Forge build state is:

artifacts/forge/forge_state.json

This file is:

* Fully derived (not manually edited)
* Deterministic
* Generated via forge_state_writer.js

---

## 4. Governance Rule

### Rule 1 — Integrity Gate

Forge MUST NOT proceed with autonomous execution if:

execution_integrity != CONSISTENT

---

### Rule 2 — Completion Gate

Forge MUST NOT proceed with autonomous execution if:

next_allowed_step == COMPLETE

Reason:
System has no remaining valid tasks to execute.

---

### Rule 3 — Partial Build Restriction

If:

execution_integrity == CONSISTENT
AND next_allowed_step != COMPLETE

Then:

* Execution MAY proceed
* BUT ONLY for the exact task specified in:

next_allowed_step

---

## 5. Failure Behavior

If any governance rule is violated:

* Execution MUST stop immediately
* No task handler should be executed
* No artifact should be written

The system must output:

FORGE GOVERNANCE BLOCK: <reason>

---

## 6. Non-Bypass Rule

This governance layer is:

* Mandatory
* Non-optional
* Cannot be bypassed by flags or environment variables

---

## 7. Dependency Declaration

This contract depends on:

* forge_state_resolver.js
* forge_state_writer.js
* artifacts/forge/forge_state.json

---

## 8. Future Extensions (Not in Scope Now)

* Multi-branch build states
* Parallel task execution
* Soft-warning mode

---

## 9. Acceptance Criteria

This contract is considered satisfied when:

* Forge refuses to run if state is INCONSISTENT
* Forge refuses to run if build is COMPLETE
* Forge runs ONLY when state is CONSISTENT AND actionable
* Execution strictly follows next_allowed_step

---

## 10. Authority

This contract overrides:

* Any implicit execution logic
* Any legacy decision gate behavior
* Any direct invocation of task handlers

Forge execution MUST be state-driven.

---

END OF CONTRACT
