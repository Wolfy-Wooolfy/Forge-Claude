# TASK-063 — Stage A Contract

## Forge Build State Derivation Contract

**Artifact ID:** `TASK-063.stageA.forge-build-state-derivation-contract.md`
**Stage:** A
**Status:** OPEN
**Authority Level:** Governing Contract
**Scope:** Forge internal build-state tracking only
**Runtime Impact:** Indirect / Governance-critical

---

## 1. Purpose

This task defines the official and exclusive mechanism for determining the **development/build state of Forge itself**.

The purpose of this contract is to permanently separate:

* **Forge Runtime State on target projects**
  from
* **Forge Build / Development State**

This separation is mandatory to eliminate authority collision and to restore deterministic, artifact-driven governance.

---

## 2. Problem Statement

Current repository usage created an authority conflict:

* `progress/status.json` is documented as the live execution state for the active project being processed by Forge
* but it was also used informally to indicate the latest internal development state of Forge itself

This dual usage is not acceptable because it causes:

* mixed authority
* ambiguous resume behavior
* inaccurate completion interpretation
* non-deterministic development tracking
* governance inconsistency between docs, runtime, and internal build progress

This contract resolves that conflict.

---

## 3. Governing Decision

Effective immediately:

### 3.1 Runtime Authority

`progress/status.json` remains reserved exclusively for:

* live runtime execution state
* active project execution tracking
* runtime blocking/completion/resume control
* exactly one active project context

It is **not** an authoritative source for Forge’s own development/build state.

---

### 3.2 Forge Build Authority

Forge internal development/build state must be determined only from repository artifacts and derived repository evidence.

It must not depend on:

* chat memory
* manual interpretation
* informal notes
* `progress/status.json`
* undocumented assumptions

---

### 3.3 Derived State Requirement

Forge build state must be represented by a dedicated derived artifact:

`artifacts/forge/forge_state.json`

This artifact is:

* internal to Forge
* authoritative for Forge build-state visibility
* derived automatically from repository artifacts
* never manually edited as a source of truth

---

## 4. Contract Objective

This task establishes the rules that allow Forge to determine, at any time and deterministically:

* where Forge development currently stands
* what was last fully closed
* what is currently open
* whether the repository state is internally consistent
* what the next valid internal build step is

without relying on runtime project state.

---

## 5. Build State Artifact

### 5.1 Required Artifact

Forge build-state must be materialized as:

`artifacts/forge/forge_state.json`

### 5.2 Nature of Artifact

This artifact is:

* **derived**
* **deterministic**
* **artifact-driven**
* **governance-sensitive**
* **non-runtime**

It is a repository build-state mirror, not a project execution state file.

---

## 6. Allowed Sources of Derivation

`artifacts/forge/forge_state.json` may only be derived from the following source classes:

### 6.1 Task Artifacts

* `artifacts/tasks/*.stageA.*`
* `artifacts/tasks/*.stageB.*`
* `artifacts/tasks/*.stageC.*`
* `artifacts/tasks/*.stageD.*`
* `artifacts/tasks/*.execution.closure.md`

### 6.2 Stage Artifacts

Any authoritative stage artifact already recognized by repository governance, when needed for consistency determination.

### 6.3 Execution Registry

* `code/src/execution/task_registry.js`

### 6.4 Optional Governance Sources

Only if explicitly required by implementation design and documented in Stage C:

* pipeline definition
* orchestration state artifacts
* other governing repository metadata

---

## 7. Prohibited Sources

Forge build-state derivation must never use the following as primary authority:

* `progress/status.json`
* chat messages
* unstored assumptions
* undocumented human memory
* inferred repo intent without artifact basis
* any temporary or untracked file

---

## 8. Required Output Fields

The derived build-state artifact must expose, at minimum, the following fields:

* `status_type`
* `current_stage`
* `current_task`
* `last_completed_artifact`
* `closed_tasks`
* `open_tasks`
* `pending_gaps`
* `build_progress_percent`
* `execution_integrity`
* `next_allowed_step`
* `derived_from`
* `derived_at`

---

## 9. Field Intent

### 9.1 `status_type`

Must identify the artifact as Forge internal build-state, not runtime project state.

### 9.2 `current_stage`

Represents the highest currently active Forge development stage inferred from authoritative artifacts.

### 9.3 `current_task`

Represents the current open internal Forge development task, if deterministically inferable.

### 9.4 `last_completed_artifact`

Represents the latest valid closed artifact in the internal Forge development chain.

### 9.5 `closed_tasks`

List of tasks that are deterministically closed by artifact evidence.

### 9.6 `open_tasks`

List of tasks opened but not validly closed.

### 9.7 `pending_gaps`

List of unresolved implementation/documentation/governance gaps still open for Forge itself.

### 9.8 `build_progress_percent`

Derived repository progress indicator for Forge development only.

### 9.9 `execution_integrity`

Repository consistency classification for Forge build-state derivation.

### 9.10 `next_allowed_step`

The next internal Forge build step that is officially allowed based on current derived state.

### 9.11 `derived_from`

Explicit trace of authoritative sources used for derivation.

### 9.12 `derived_at`

Timestamp of artifact generation.

---

## 10. Integrity Classification

`execution_integrity` must be classified strictly and explicitly.

Minimum required values:

* `CONSISTENT`
* `INCONSISTENT`
* `BLOCKED`

### 10.1 CONSISTENT

Used only when repository artifacts support one deterministic reading of build state.

### 10.2 INCONSISTENT

Used when artifacts conflict, closures do not align, stages overlap improperly, or multiple incompatible readings exist.

### 10.3 BLOCKED

Used when required derivation inputs are missing or the build state cannot be deterministically resolved.

---

## 11. Determination Rules

### 11.1 Closure Priority Rule

A task is considered closed only if closure is supported by authoritative closure artifact evidence.

Stage artifacts alone do not imply closure unless governance explicitly says so.

### 11.2 Latest Closed Artifact Rule

`last_completed_artifact` must point to the latest deterministically valid closure artifact, not simply the highest-numbered file.

### 11.3 Open Task Rule

A task is open if:

* it has authoritative opening artifacts
* but lacks valid closure evidence

### 11.4 Gap Rule

A gap is pending when:

* docs require behavior not present in code
* code exists without matching governance closure
* repository state contains unresolved internal contradictions

### 11.5 Single-State Rule

Derivation must produce exactly one valid build-state interpretation.
If multiple valid interpretations exist, result must not guess.
It must become `INCONSISTENT` or `BLOCKED`.

---

## 12. Relationship to Runtime

Forge build-state and Forge runtime state are separate domains.

### 12.1 Runtime Domain

Controlled by:

* `progress/status.json`

### 12.2 Build Domain

Controlled by:

* derived artifacts
* internal Forge governance artifacts
* `artifacts/forge/forge_state.json`

### 12.3 Non-Override Rule

Neither domain may override the other.

Runtime state must not redefine Forge build state.
Forge build state must not impersonate project runtime state.

---

## 13. Fail-Closed Requirement

If derivation cannot produce a single deterministic state, the system must fail closed.

No best-guess output is allowed.

No silent fallback is allowed.

No human-memory correction is allowed.

---

## 14. Manual Editing Rule

`artifacts/forge/forge_state.json` must never be treated as manually authoritative.

If manually edited, it does not become source truth.
The derivation process remains the only authority.

---

## 15. Required Follow-Up Stages

### Stage B

Forge Build State Gap Analysis

### Stage C

Forge Build State Derivation Design

### Stage D

Implementation

---

## 16. Acceptance Criteria

* `progress/status.json` excluded from Forge build authority
* `forge_state.json` defined as derived artifact
* allowed sources defined
* prohibited sources defined
* integrity states defined
* deterministic rule enforced
* fail-closed enforced

---

## 17. Outcome

Forge build-state tracking becomes artifact-derived and deterministic.

---

## 18. Next Step

**TASK-063 Stage B — Gap Analysis**
