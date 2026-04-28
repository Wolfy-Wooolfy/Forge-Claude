# Progress Tracking & Status Report Contract (v1)

**Document Type:** Authoritative Execution Contract  
**Applies To:** All Autonomous Pipelines, Agents, and Sub-Agents  
**Status:** BINDING  
**Enforcement Level:** Mandatory – Fail-Closed  

---

## 1. Purpose

This document defines the **single, authoritative progress-reporting mechanism** by which progress is tracked, reported, and queried inside the Autonomous Pipeline. It does NOT define execution control authority.

The objective is to ensure that:

- The system **never waits for human feedback by default**
- The human can request status **at any time**
- Progress is **quantifiable, auditable, and deterministic**
- No ambiguity exists about:
  - Where we are
  - What was completed
  - What is currently executing
  - What is blocking (if anything)

This contract eliminates:
- Hidden progress
- Implicit assumptions
- “We’re almost done” ambiguity
- Human dependency for continuation

---

## 2. Core Principles (Non-Negotiable)

1. Progress is computable ONLY from closed, validated artifacts  
2. Progress reporting is strictly read-only for humans  
3. No human approval is required to advance execution  
4. The pipeline MUST NOT stall silently  
5. Every reported percentage MUST be derivable and auditable  
6. Status is derived from artifacts and gates, not narration  
7. Execution activity has ZERO progress value  

---

## 2.0.1 Progress Is Artifact-Based Only (Hard)

Progress exists ONLY when an artifact is CLOSED
and has PASSED its validation gate.

The following have ZERO progress value:
- Execution activity
- Analysis
- Reasoning
- Computation
- Retries in progress
- Waiting states

If no artifact is CLOSED:
- Progress MUST remain unchanged
- Percentages MUST NOT advance
- Silence MUST NOT be interpreted as progress

Any system behavior that reports progress
without artifact closure
is a system violation.

---

## 2.1 Progress Authority Rule

Progress artifacts are system-owned.

Only the pipeline orchestrator may:
- Update progress values
- Advance stage percentages
- Modify status.json

Individual agents MUST NOT:
- Self-report completion
- Adjust progress directly
- Infer percentage advancement

Unauthorized progress mutation is a system fault.

---

## 2.2 Observable Progress Rule (Hard Constraint)

Progress is considered observable ONLY when:
- A new artifact is closed
- A stage transition occurs
- A rollback or retry is executed and logged

Internal activity, computation,
or background processing
does NOT constitute progress.

If no observable progress occurs
within a bounded execution window,
the system MUST emit a status report.

Any required explanation for lack of progress MUST exist ONLY as structured data
inside `progress/status.json` fields (e.g., `current_task`, `issues`, or `blocking_questions`)
as permitted by this contract.
No narrative output outside `progress/status.json` is allowed.

---

### 2.2.1 Activity vs Progress Distinction (Hard Rule)

Execution activity does NOT imply progress.

The following do NOT constitute progress:
- Computation
- Analysis
- Internal reasoning
- Retry preparation
- Background validation

Progress exists ONLY when:
- An artifact is CLOSED
- A stage transition occurs
- A rollback or retry is executed and logged

Any system behavior that reports progress
based on activity rather than artifact closure
is a system violation.

---

## 3. Canonical Status Report Format

Every status report MUST strictly follow this structure.
No additional fields are allowed unless this document is versioned.

`status_type` is canonical and MUST always be:
- "LIVE"

No other value is permitted.
Any value other than "LIVE" is INVALID and MUST Fail-Closed.

```json
{
  "status_type": "LIVE",
  "current_stage": "",
  "overall_progress_percent": 0,
  "stage_progress_percent": 0,
  "last_completed_artifact": "",
  "current_task": "",
  "issues": [],
  "blocking_questions": [],
  "next_step": ""
}
```

---

### 3.0 Status Report Authority Binding (Hard)

The Canonical Status Report defined in this section
MUST be represented exclusively and literally
by the contents of:

`progress/status.json`

There is NO distinction between:

* A “status report”
* The live status reflection file

They are the SAME artifact for human-visible status.

Any status report:

* Emitted verbally
* Returned via API
* Displayed to a human

MUST be a direct, lossless rendering
of the current contents of `progress/status.json`.

No alternate formats,
summaries,
or derived representations
are permitted.

`progress/status.json` is authoritative for reporting fidelity only.
It does NOT override execution authority carried by higher-order runtime artifacts.

If a reported status differs in ANY way
from `progress/status.json`:

* The report is INVALID
* Execution MUST halt
* A corrected status MUST be re-emitted

---

### 3.1 Status-State Representation (Mandatory)

The reported state is derived deterministically
from the status report fields.
This representation is for status/reporting consistency only and MUST remain aligned with higher-authority execution artifacts.

Exactly ONE execution state MUST apply:

* RUNNING
* BLOCKED
* ABORTED
* COMPLETED

State derivation rules (in strict priority order):

1. If execution is under Execution Abort handling rules → ABORTED
2. Else if `blocking_questions` is non-empty → BLOCKED
3. Else if `overall_progress_percent` = 100:

   * `next_step` MUST be an empty string
   * `blocking_questions` MUST be an empty array
     → COMPLETED
4. Otherwise → RUNNING

No other state inference is allowed.

Any status report that implies
multiple states simultaneously
is invalid.

---

## 3.0.1 Project Addressability Contract (Hard)

`progress/status.json` represents the authoritative progress/status reflection
for exactly ONE active project context.

Forge MUST treat execution state as project-addressable.

Rules:

- Execution state MUST belong to a single project boundary.
- Multiple projects MUST NOT share a single execution state.
- No global execution state spanning multiple projects is permitted.

In v1 (Personal Mode):

- Only one project MAY be active at a time.
- The active project context MAY be implicit.

However:

The architecture MUST NOT assume permanent singleton execution.

If future multi-project support requires redefining
the reporting model of `progress/status.json`:

- The architecture is considered defective.

No component may assume that Forge is permanently single-project.

---

## 4. Field Definitions (Binding)

### 4.1 current_stage

MUST be EXACTLY one of the following canonical stage IDs:

* "A"
* "B"
* "C"
* "D"

These values are authoritative and machine-stable.

Stage names, descriptions, or display labels
MUST NOT be used as `current_stage` values.

Abbreviations beyond the defined IDs,
aliases,
or inferred labels
are STRICTLY FORBIDDEN.

If the value does not match
one of the above strings EXACTLY:

* Status report is INVALID
* Progress calculation MUST FAIL CLOSED
* Execution MUST halt

---

### 4.2 overall_progress_percent

* Integer only (0–100)
* Represents **total pipeline completion**
* Calculated as a weighted sum of stages
* MUST never be estimated emotionally

If calculation is impossible → **FAIL CLOSED**

---

### 4.2.1 Stage Weighting (Hard Rule)

Overall progress MUST be calculated using
fixed, predefined stage weights.

Unless explicitly overridden by a versioned contract,
the default stage weights are:

* Stage A — Architecture: 20%
* Stage B — Documentation: 25%
* Stage C — Implementation: 30%
* Stage D — Verification & Decision: 25%

Stage weights are immutable during execution.

Any change to stage weights requires:

* A new version of this contract
* Recalculation from zero
* Explicit human approval

---

### 4.2.2 No Estimated Progress Rule (Hard)

Progress percentages MUST NOT be:

* Estimated
* Rounded
* Approximated
* Inferred from effort

If progress cannot be calculated
deterministically from closed artifacts and validation gates:

* The status report is INVALID
* Execution MUST Fail-Closed
* `blocking_questions` MUST include exactly one structural question:

  * "Progress calculation failed deterministically. Fix required in orchestrator calculation rules. Continue? (YES/NO)"
* `next_step` MUST be an empty string

Under no circumstances may:

* `overall_progress_percent` be reset to 0
* or modified
  unless triggered by:
* explicit rollback / invalidation, OR
* Execution Abort handling rules

---

### 4.3 stage_progress_percent

Stage progress represents verified completion
inside the current stage.

Calculation MUST be based ONLY on:

* Artifacts that are CLOSED
* Artifacts that passed validation gates

Formula:

(closed_and_verified_artifacts / total_required_artifacts) * 100

Artifacts that are:

* Draft
* Pending verification
* Rolled back

MUST be counted as 0%.

If verification status is unknown
→ Fail-Closed and set progress to 0%.

---

### 4.4 last_completed_artifact

* MUST reference a real artifact
* MUST include:

  * Artifact name
  * Version (if applicable)
  * Location (logical or physical)

Examples:

* `docs/Scope_and_Success_Contract_v1.md`
* `code/memoryEngine/index.js`

If no artifact exists → value MUST be `"NONE"`

---

### 4.5 current_task

* A single, concrete execution step
* MUST be directly traceable to a required artifact
* MUST be executable without clarification
* MUST NOT contain multiple actions
* MUST NOT describe analysis, intent, or reasoning
* MUST NOT imply draft or non-authoritative work

If a task cannot be tied to
a specific artifact lifecycle step,
it is not a valid current_task.

Valid:

* "Close docs/04_autonomy/autonomy_policy.md"
* "Run verify/smoke/smoke_check.sh"
* "Generate code/src/memoryEngine/index.js"

Invalid:

* "Draft Autonomy Policy retry rules"
* "Working on autonomy stuff"
* "Analyzing the best approach"

---

### 4.6 issues

* Non-blocking problems
* Informational only
* The pipeline **continues execution** despite them

Examples:

* Naming inconsistency detected
* Optional optimization deferred

Empty array if none exist.

---

### 4.7 blocking_questions

`blocking_questions` MUST be empty
unless execution is BLOCKED
due to missing mandatory input
or a bounded, selectable decision fork.

Each blocking question MUST:

* Be binary or option-bounded
* Be answerable by the human
* Explicitly unblock execution
* Be strictly minimal (no narrative)

If this array is non-empty:

* Execution state MUST be BLOCKED
* `next_step` MUST be an empty string
* The reason MUST be structural, not preference-based

`blocking_questions` MUST NOT be used
to represent deterministic impossibility.

If execution is deterministically impossible
and no valid fork exists:

* Execution MUST be classified as ABORTED
* `blocking_questions` MUST be empty
* Progress freeze rules apply

---

### 4.8 next_step

The next_step field reflects
ONE and ONLY ONE
immediately executable action as resolved by higher-authority execution artifacts.

Rules:

* It MUST be deterministic
* It MUST NOT require human input
* It MUST map directly to an artifact lifecycle step
* It MUST be executable without clarification

The next_step MUST NOT:

* Describe intent
* Describe planning
* Describe future reasoning
* Contain conditional language

If no executable action exists:

* Execution MUST be BLOCKED or ABORTED
* next_step MUST be empty
* The blocking reason MUST be explicit

---

#### 4.8.1 next_step State Validity Rule (Hard)

The `next_step` field MUST be populated
ONLY when execution state is RUNNING.

If execution state is:

* BLOCKED
* ABORTED
* COMPLETED

Then:

* `next_step` MUST be an empty string
* No implied or suggested action is allowed

Any non-empty `next_step`
outside RUNNING state
constitutes an authority leak
and is a system violation.

---

## 5. When Status Is Generated

A status report MUST be generated:

1. On explicit human request
2. After completing any artifact
3. After entering a new stage
4. Before pausing for a blocking question
5. After resolving a blocking question

If no artifact is produced and no stage transition occurs
within a bounded execution window,
a status report MUST be emitted automatically.

Prolonged silence without progress
is a contract violation.

---

## 6. Progress Percentage Rules

### 6.1 Allowed Sources (Exclusive)

Progress percentages MAY ONLY be derived from:

* Count of CLOSED artifacts
* Passed validation gates
* Completed stage exits

The pipeline MUST NOT:

* Inflate progress using optional artifacts
* Advance progress based on activity
* Include non-mandatory outputs in calculations

If artifact requirements are unclear,
progress calculation MUST FAIL CLOSED
and default to 0%.

---

## 6.2 Fail-Closed Rule

If progress cannot be calculated deterministically:

* The status report is INVALID
* Execution MUST Fail-Closed
* `overall_progress_percent` MUST remain unchanged
  unless a rollback/invalidation or Execution Abort rule applies
* `stage_progress_percent` MUST be set to `0`
* `blocking_questions` MUST include exactly one structural question:

  * "Progress calculation failed deterministically. Fix required in orchestrator calculation rules. Continue? (YES/NO)"
* `next_step` MUST be an empty string

Execution MUST transition to BLOCKED until the calculation rules are corrected.

---

## 6.2.1 Post-Completion Progress Lock (Hard Rule)

Once the execution state is deterministically derived as COMPLETED
per Section 3.1:

* `overall_progress_percent` MUST be set to `100`
* Progress MUST become immutable
* No further updates are permitted
* No regression is allowed
* No new artifacts may affect progress

Any attempt to modify progress
after COMPLETED state is reached
is a system violation.

---

## 6.3 Progress Regression Rule

Progress percentage MAY decrease ONLY when:

* A rollback is executed
* A previously closed artifact is invalidated
* A stage is explicitly reopened by decision

Any progress decrease MUST:

* Be explainable deterministically
* Be reflected immediately in status.json
* Reference the triggering decision or rollback

Silent or unexplained regression
is a contract violation.

---

## 6.4 Progress Handling on Execution Abort (Hard Rule)

Execution Abort represents
a terminal enforcement state.

Upon Execution Abort:

* `current_stage` MUST reflect the aborting stage
* `next_step` MUST be an empty string
* `blocking_questions` MUST be an empty array
* `issues` MAY include deterministic fault descriptors (non-narrative, non-persuasive)
* `status.json` MUST be frozen immediately after writing the ABORTED state

Progress percentages MUST remain artifact-derived.
They MUST NOT be force-reset to 0 as a semantic signal.

Rules:

* `overall_progress_percent` MUST remain the last deterministically calculated value
  derived from CLOSED artifacts prior to the abort
* `stage_progress_percent` MUST remain the last deterministically calculated value
  for the current stage prior to the abort

No partial success is implied by non-zero progress.
ABORTED is NOT SUCCESSFUL regardless of percentage.

---

### 6.5 Progress Authority Lock After Abort (Hard)

After an Execution Abort:

* No component may update progress
* No percentage recalculation is allowed
* No inferred recovery progress may be reported
* No re-entry, retry, rollback, or continuation may be authorized

Progress remains frozen
until a new task is explicitly initiated.

Any progress update after Abort
is a system violation.

---

## 7. Human Interaction Model

The human authority may ask at any time:

* “Status?”
* “Progress?”
* “Where are we?”

The system MUST respond with:

* A full status report
* A direct, lossless rendering of `progress/status.json`
* NO additional text
* NO commentary
* NO explanation
* NO suggestions
* NO interpretation

The response MUST NOT include
any content that is not present
verbatim in `progress/status.json`.

Any deviation,
augmentation,
or narrative addition
constitutes a contract violation
and MUST halt execution.

---

## 8. Forbidden Behaviors

The following are strictly prohibited:

* Waiting for approval without a blocking question
* Advancing stages without artifact closure
* Reporting rounded or guessed percentages
* Reporting progress without evidence
* Mixing planning commentary with status output

---

## 9. Enforcement

Any agent or pipeline component that violates this contract:

* MUST halt execution immediately (Fail-Closed)
* MUST preserve all artifacts and current state for audit
* MUST invalidate any non-authoritative or unauthorized status mutation
* MUST return control to the owning-stage enforcement path as governed EXCLUSIVELY by:

  * Pipeline Stages Specification (A→D)
  * Autonomy Policy & Human Interrupt Protocol
  * Build & Verify Playbook (Local)

If a contract-compliant owning-stage recovery path exists:

* Execution MUST return to the owning stage
* All downstream artifacts MUST be invalidated deterministically

If NO contract-compliant recovery path exists:

* Execution MUST transition to Execution Abort
* Progress freeze rules apply
* Human visibility MUST occur ONLY via the live execution state
  in `progress/status.json` (lossless rendering)
* No narrative notification, summary, or extra text is permitted

---

### 9.1 Status Mutation Authority Lock (Hard)

Only the pipeline orchestrator
may create or modify `progress/status.json`.

Agents, sub-agents, tools, or scripts
MUST NOT:

* Patch status fields
* Correct percentages
* Rewrite blocking questions
* Override execution state

Any unauthorized status mutation
is a critical system fault
and MUST trigger immediate halt.

---

## 10. Versioning

Any change to this document requires:

* New version number
* Explicit diff
* Re-validation of all pipeline components

Until then, this version is **final and binding**.

---