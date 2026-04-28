# Self-Building Runtime Activation Protocol

**Document ID:** HALO-DOC-21  
**Status:** BINDING – RUNTIME ACTIVATION AUTHORITY  
**Scope:** Forge Self-Building System Runtime  
**Applies To:** Entire Autonomous Pipeline  
**Enforcement:** Fail-Closed  

---

# 1. Purpose

This document defines when and how the Self-Building System
inside Forge becomes active.

It specifies:

- activation triggers
- repository readiness conditions
- execution bootstrap sequence
- runtime state initialization
- interaction with governed runtime state artifacts and reflection/output status reporting

The purpose of this protocol is to ensure that
Forge begins autonomous execution only when the system
is in a valid deterministic state.

---

# 2. Activation Trigger

The Self-Building System activates when ANY of the following occurs:

1. A new task is registered.
2. Governed runtime authority artifacts indicate a valid deterministic entry or resume state.
3. A lifecycle execution was previously interrupted and must resume.
4. A repository snapshot is loaded for autonomous processing.

Activation MUST NOT occur without one of these triggers.

---

# 3. Repository Readiness Conditions

Before activation, Forge MUST verify:

- Required governance documents exist
- Required artifact directories exist
- governed runtime authority artifacts exist
- progress/status.json may exist as reflection/output only
- Lifecycle state is deterministic
- No corruption exists in artifacts

Required artifact root directories:

```

artifacts/intake/
artifacts/audit/
artifacts/trace/
artifacts/gap/
artifacts/decisions/
artifacts/backfill/
artifacts/execute/
artifacts/closure/

```

If any required directory is missing:

→ Backfill Module MUST create them.

---

# 4. Runtime Bootstrap Sequence

Once activation conditions are satisfied,
Forge MUST perform the following steps.

Step 1 — Repository Snapshot Lock  
The repository state MUST be frozen for deterministic analysis.

Step 2 — Runtime State Initialization  
Forge MUST read governed runtime authority artifacts and determine:

- current governed runtime position
- execution state
- pending actions
- blocking/abort semantics
- deterministic continuation eligibility

Step 3 — Artifact Integrity Verification  
All artifacts referenced by status.json MUST exist.

If any artifact is missing:

→ Execution MUST halt.

Step 4 — Module Selection  
Forge determines the next module using:

MODULE_ORCHESTRATION_GOVERNANCE_v1.

Step 5 — Execution Start  
Selected module begins execution.

---

# 5. Runtime Authority

The authoritative runtime state is carried by:

- `artifacts/forge/forge_state.json`
- `artifacts/orchestration/orchestration_state.json`
- authoritative task closure continuity under `artifacts/tasks/*`
- deterministic module order declared in `code/src/orchestrator/pipeline_definition.js`

These artifacts define:

- pipeline continuity
- current task lineage
- execution integrity
- next allowed step
- closure validity

Forge MUST treat these artifacts as the execution source of truth.

No module may bypass them.

`progress/status.json` remains a reflection/output artifact for human-visible status only.

---

# 6. Execution State Recognition

Forge MUST recognize the following runtime states.

### READY

A project context has been initialized and is eligible for governed startup.

### RUNNING

A valid next module has been resolved from authoritative execution artifacts.

### BLOCKED

Execution is halted because authoritative artifacts prove ambiguity,
contract failure,
or an invalid continuation path.

### ABORTED

Execution is terminated because no valid governed continuation exists.

### COMPLETE

Lifecycle execution completed successfully with authoritative closure continuity.

Modules MUST respect these states.

---

# 7. Resume Behavior

If runtime activation occurs while authoritative execution artifacts indicate RUNNING,
Forge MUST:

- verify artifact integrity
- determine the last contiguous closed module from `artifacts/tasks/*`
- verify `forge_state.json` consistency
- resume from the next deterministic module in `pipeline_definition.js`

Partial module execution MUST NOT resume.

Modules are atomic.

---

# 8. Blocked State Handling

If authoritative execution artifacts indicate BLOCKED,
Forge MUST:

- halt module execution
- preserve the blocking reason in governed state artifacts
- refuse continuation until the blocking condition is remediated through valid artifacts

Execution may resume ONLY after governed continuity is restored.

---

# 9. Aborted Execution Handling

If authoritative execution artifacts indicate ABORTED,
Forge MUST:

- terminate execution attempt
- prevent automatic restart
- require a new governed continuation path

Aborted runs are terminal.

---

# 10. Lifecycle Initialization

If governed runtime state does not exist
and a new project is introduced:

Forge MUST initialize authoritative runtime state artifacts,
including:

- `artifacts/forge/forge_state.json`
- `artifacts/orchestration/orchestration_state.json` when orchestration begins
- `progress/status.json` as a reflection/output artifact

Initialization MUST establish a deterministic starting point
that resolves to the Intake Module through governed runtime logic.

---

# 11. Deterministic Startup Guarantee

Runtime activation is deterministic only when:

- repository snapshot is locked
- artifact references are valid
- lifecycle stage is defined
- no ambiguous state exists

If determinism cannot be proven:

→ Execution MUST FAIL CLOSED.

---

# 12. Runtime Authority Limits

Runtime activation protocol MUST NOT:

- modify governance documents
- generate code
- resolve gaps
- create decisions

It only determines when execution begins.

---

# 13. Interaction with Self-Building Blueprint

This protocol activates the system defined in:

```

SELF_BUILDING_SYSTEM_BLUEPRINT_v1

```

Blueprint defines system architecture.

Runtime Activation defines when execution begins.

---

# 14. Fail-Closed Rule

If activation conditions are ambiguous
or required artifacts are missing:

- execution MUST halt
- system MUST enter BLOCKED state

Autonomous startup without deterministic readiness
is strictly forbidden.

---

# 15. Summary

The Runtime Activation Protocol guarantees that:

- Forge begins execution only under deterministic conditions
- runtime state is controlled by governed execution artifacts
- lifecycle modules execute in proper order
- autonomous execution remains auditable

This protocol ensures safe startup
for the Self-Building System.

## Execution Authority Separation Rule (CRITICAL)

### Rule Definition

Forge execution MUST NOT depend on `progress/status.json` as a source of control.

`progress/status.json` is defined as:

- A project-level state artifact
- An OUTPUT of execution
- A human-readable snapshot of progress

It MUST NOT be used for:

- Determining current_task
- Determining next_step
- Blocking execution decisions
- Driving orchestration flow

---

### Execution Source of Truth

Forge runtime execution MUST be driven exclusively by:

- `artifacts/forge/forge_state.json`
- `artifacts/orchestration/orchestration_state.json`

These artifacts define:

- current_task
- execution_integrity
- next_allowed_step
- pipeline continuity

---

### Enforcement

Any logic that:

- Reads `status.json` to decide execution
- Blocks execution based on `status.json`
- Validates pipeline transitions using `status.json`

Is considered a VIOLATION of runtime determinism.

---

### Rationale

This rule eliminates:

- Circular dependency between execution and output state
- Manual intervention loops
- False BLOCKED states
- Non-deterministic execution paths

---

### Expected Outcome

After enforcement:

- Forge becomes a fully autonomous deterministic pipeline
- `status.json` becomes a pure reflection layer
- Execution consistency is guaranteed by governed Forge/orchestration runtime authority artifacts

---

### Runtime Implementation Note

The following runtime files MUST treat `progress/status.json` as reflection/output only and MUST NOT use it as execution authority:

- `code/src/orchestrator/entry_resolver.js`
- `code/src/orchestrator/autonomous_runner.js`

Execution entry, resume, and deterministic task selection MUST be derived from:

- `artifacts/forge/forge_state.json`
- `artifacts/orchestration/orchestration_state.json` when current-run state exists
- pipeline closure continuity under `artifacts/tasks/*`

---

**END OF SPECIFICATION**