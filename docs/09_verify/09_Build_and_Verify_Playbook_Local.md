# 📄 Document 9 — Build & Verify Playbook (Local)

**Version:** 1.2  
**Status:** MANDATORY  
**Scope:** Local execution only  
**Applies To:** Forge
**Enforcement:** Fail-Closed

---

## 1. Purpose

This document defines the **mandatory local build, verification, retry, and rollback rules**
used by Forge.

Its goal is to ensure that:

- Every execution produces **verifiable artifacts**
- Failures are **detected early**
- No partial, broken, or unverified work progresses forward
- The system can run **for hours or days unattended**
- Human intervention is requested **only when strictly necessary**

This playbook applies to:
- Code
- Documentation
- Configuration
- Generated artifacts
- Validation outputs

---

### 1.1 Playbook Is Binding Execution Law (Hard)

This playbook is NOT guidance
and NOT a recommendation set.

It is a binding execution law.

Any build, verification, retry,
rollback, or abort behavior
that deviates from this playbook
constitutes a system violation.

If a situation is not explicitly covered
by this playbook:
- Execution MUST halt
- Human escalation is REQUIRED

The system MUST NOT invent
or infer build or verification behavior.

---

## 2. Verification Scope

Verification is strictly limited to:
- Structural correctness
- Artifact completeness
- Deterministic rule compliance
- Explicit test definitions

Verification MUST NOT:
- Evaluate quality
- Assess performance
- Judge optimization
- Infer user satisfaction
- Apply subjective standards

If a check cannot be expressed
as a deterministic rule
or an explicit test,
it is NOT verification
and MUST NOT be performed.

---

### 2.0.1 Verification PASS Has No Acceptance Authority (Hard)

A verification PASS indicates
only that defined checks succeeded.

It does NOT:
- Grant acceptance
- Approve release
- Confirm fitness
- Signal completion

Acceptance authority exists ONLY
in Stage D of the pipeline
and ONLY under the conditions
defined in Pipeline Stages Specification.

---

## 2.1 Verification Targets (Hard)

Verification MUST operate on explicit targets only.

A verification run MUST declare its target set deterministically as one of:

- Stage B verification target set (Cognitive Layer — Docs Engines):
  - `artifacts/stage_B/spec_pack_manifest.md`
  - `artifacts/stage_B/specifications.md`
  - `artifacts/stage_B/data_schemas.md`
  - `artifacts/stage_B/interface_contracts.md`
  - `artifacts/stage_B/validation_rules.md`
  - `artifacts/stage_B/edge_cases.md`
  - `artifacts/stage_B/docs_gap_report.md`
  - `artifacts/stage_B/docs_coverage_matrix.md`

- Stage C verification target set:
  - `/code/src/*`
  - `/code/tests/*`
  - `artifacts/stage_C/code_trace_matrix.md`
  - `artifacts/stage_C/code_mismatch_report.md`
  - `artifacts/stage_C/test_evidence.md`

- Stage D verification target set:
  - `artifacts/stage_D/verification_report.md`
  - any additional Stage D verification artifacts required by the Build & Verify Playbook itself
  - verification logs and outputs under `/verify/*` as required by this document

If a verification run cannot declare a deterministic target set:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

## 2.1.1 Cognitive Layer Verification Types (Stage B Only)

Stage B verification MUST include the following verification types, as declared in the live verification report:

- `STRUCTURAL_B_DOCS_PACK`
- `CONTRACT_B_DOCS_PACK`
- `CONSISTENCY_B_DOCS_PACK`

These types have no authority by themselves.
They exist only to bind deterministic checks to Stage B gating.

If these checks cannot be executed deterministically:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

## 2.1.2 Stage B Verification Minimum Deterministic Checks (Hard)

When the verification target set is Stage B:

Structural checks MUST ensure:
- all target artifacts exist
- paths match repository standard
- file format is Markdown for `.md`
- `artifacts/stage_B/spec_pack_manifest.md` contains a deterministic list of Stage B artifacts by path

Contract checks MUST ensure:
- `artifacts/stage_B/docs_gap_report.md` indicates ZERO unresolved MUST-level gaps
- `artifacts/stage_B/docs_coverage_matrix.md` indicates 100% coverage of MUST-level requirements
- `artifacts/stage_B/spec_pack_manifest.md` is consistent with produced artifact paths

Consistency checks MUST ensure:
- Stage B artifact set contains no duplicate responsibility claims across docs
- Stage B artifacts do not introduce scope beyond Stage A frozen intent, if Stage A artifacts exist in the repository snapshot

If any required check is impossible to evaluate deterministically from present artifacts:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

## 2.2 Local Command Trace (Hard)

Any local build or verification command execution MUST be logged as a structured, machine-verifiable artifact.

This log is NOT a Decision and has ZERO execution authority.
It exists solely for auditability and replay.

Path (append-only JSONL):
`verify/smoke/local_command_log.jsonl`

Command output capture (mandatory):
- stdout and stderr MUST be persisted as files
- Hashes MUST be computed from the persisted files (not from transient buffers)

Output storage path:
`verify/smoke/command_output/`

Deterministic output file naming:
- `CMD-<YYYYMMDD>-<HHMMSSZ>-<STAGE>-stdout.txt`
- `CMD-<YYYYMMDD>-<HHMMSSZ>-<STAGE>-stderr.txt`

Rules:
- JSON Lines format ONLY (one JSON object per line)
- Append-only
- Immutable once written
- No narrative text
- Every executed command MUST create exactly one entry
- Every entry MUST reference exactly one stdout file and one stderr file path

Minimum required fields per entry:
- timestamp_utc
- stage ("B" | "C" | "D")
- working_directory
- command (string)
- exit_code (integer)
- stdout_path
- stderr_path
- stdout_sha256
- stderr_sha256

If a command is executed without:
- a corresponding log entry, OR
- persisted stdout/stderr files, OR
- matching hashes

Then:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

### 2.2.1 Smoke Check Entrypoint (Windows-Compatible)

On Windows local execution, Smoke Check MUST be executed via Node:

- `node verify/smoke/smoke_check.js`

Any reference to a `.sh` smoke check script is considered non-authoritative for Windows local runs.

---

## 3. Failure Handling

Failure handling is strictly classified
and MUST follow deterministic rules.

A failure MAY result in ONE and ONLY ONE
of the following outcomes:

1. Retry
2. Rollback
3. Execution Abort
4. Human Interrupt (BLOCKED)

Human Interrupt is permitted ONLY when:
- Required external input is missing, OR
- A selectable execution fork exists

Human Interrupt is governed exclusively by:
- Autonomy Policy & Human Interrupt Protocol

No hybrid or conditional handling is permitted.

---

### 3.1 Retry (Bounded, Corrective)

A Retry is permitted ONLY if:

- The failure cause is explicitly identified
- The corrective action removes the root cause
- The retry path is materially distinct
- No scope, intent, or authority changes occur
- No boundary or policy risk is involved

Retry rules:
- Maximum retries are governed by Autonomy Policy
- Each retry MUST be logged as a non-authoritative attempt record under `verify/`
- Repeating the same execution path is forbidden

If a valid retry cannot be proven deterministically:
- Retry MUST NOT occur
- Execution MUST deterministically choose ONE outcome:
  - Rollback (if a clean-state retry is permitted and rollback is applicable), OR
  - Execution Abort (if no deterministic recovery path exists)

No additional outcomes are allowed.

---

## 3.2 Rollback Rules

A Rollback is a deterministic reversal
to the last verified, authoritative state.

Rollback is permitted ONLY when:
- A previously closed artifact is invalidated
- Verification FAILS after partial completion
- A retry requires a clean state

Rollback rules:
- The rollback target MUST be explicit
- All rolled-back artifacts lose authority
- Rolled-back artifacts MUST remain preserved
- Progress MUST be recalculated deterministically

Rollback MUST NOT:
- Repair artifacts
- Modify content
- Introduce new execution paths
- Mask the original failure

Rollback is corrective,
not adaptive.

Governance documents under `docs/` are permitted to contain structured prose
as long as they do NOT:
- get treated as live execution state
- get parsed as executable instructions outside their declared authority scope
- bypass schema-bound authoritative artifacts (e.g., `artifacts/forge/forge_state.json`, `artifacts/orchestration/orchestration_state.json`, or `progress/status.json`)

---

## 3.2.1 Build Output Authority Gate

Artifacts produced during the Build phase
have ZERO execution authority
until verification is completed successfully.

Build outputs MUST be treated as:
- Provisional
- Non-authoritative
- Ineligible for downstream use

Any attempt to consume, trust, or advance
build artifacts before verification
is a system violation.

---

### 3.3 Build Completion Criteria

A build is considered **complete** when:

- All expected artifacts exist
- No placeholder content remains
- No TODO, FIXME, or unresolved markers exist
- File naming and folder structure match the repository standard

If any condition fails → **BUILD FAILED**

---

## 4. Verification Handling

Retries are governed strictly by the Autonomy Policy & Human Interrupt Protocol (Doc-04)
and are NOT discretionary.

A retry MAY occur ONLY if ALL are true:
- The failure cause is known
- The corrective action removes the cause
- The retry path is materially distinct
- Retry limits are not exceeded
- No boundary risk is involved

Retries MUST NOT:
- Rephrase execution
- Repeat the same path
- Mask underlying defects
- Accumulate silently

If a retry does not change the execution outcome deterministically:

- Retries MUST stop immediately
- The system MUST classify the condition deterministically as ONE of:
  - Execution Abort (if no selectable fork exists), OR
  - Human Interrupt / BLOCKED (ONLY if a selectable fork exists)

In all cases:
- Execution MUST halt
- The authoritative runtime state MUST be written into governed runtime authority artifacts
- A status report MUST be emitted via `progress/status.json` as reflection/output (Doc-06 compliant)
- No continuation is permitted without the applicable control path:
  - Abort finality, OR
  - Logged Decision (if blocked by a selectable fork)

Verification has ZERO authority to modify execution outcomes.

Verification MAY:
- Pass
- Fail

Verification MUST NOT:
- Suggest improvements
- Recommend changes
- Modify artifacts
- Trigger retries implicitly

Any action following verification MUST be governed by:
- Pipeline rules
- Autonomy Policy
- Boundary Audit outcomes

---

### 4.1 Verification Is Mandatory

No artifact may advance to the next pipeline stage without passing verification.

Verification is **not optional**  
Verification is **not implicit**  
Verification is **not assumed**

---

### 4.1.1 Verification Report Artifact Schema (Hard)

Verification MUST produce exactly ONE live report artifact per verification run.

Path:
`verify/unit/verification_report.json`

Rules:
- JSON format ONLY
- This file is a LIVE, mutable verification-state artifact by contract
- Always overwritten for the current run
- Contains NO narrative explanation
- Contains ONLY deterministic fields
- Has ZERO execution authority outside:
  - verification gating, AND
  - audit trace logging

This artifact MUST NOT:
- Update progress
- Advance stages
- Trigger retries implicitly
- Represent approval or acceptance
- Be treated as a Decision artifact

No parallel live verification reports are permitted.
If multiple live verification reports exist:
- Verification MUST FAIL CLOSED
- Execution MUST halt

Minimum required fields:
- timestamp_utc
- stage
- target_artifacts (array of paths)
- verification_types (array)
- result ("PASS" | "FAIL")
- failure_code (required only if FAIL)
- short_reason (required only if FAIL, factual, non-narrative)

If this artifact is missing → VERIFICATION FAILED.

---

### 4.1.2 Stage Verification Closure Artifact (Hard)

In addition to the live report (`verify/unit/verification_report.json`),
the pipeline MUST emit a CLOSED, stage-scoped verification closure artifact under `artifacts/`.

This artifact exists to:
- bind verification results to stage closure rules
- provide an immutable, reviewable pointer to deterministic evidence
- prevent chat-based or implicit verification claims

Rules:
- This closure artifact MUST NOT duplicate the live report schema
- It MUST reference the live report by path
- It MUST reference the relevant command log entries by timestamp range or explicit file references
- It MUST declare PASS/FAIL consistent with the live report

Required paths:

- If verifying Stage B outputs:
  - `artifacts/stage_B/verification_evidence.md` MUST exist and MUST reference:
    - `verify/unit/verification_report.json`
    - `verify/smoke/local_command_log.jsonl`
    - relevant stdout/stderr output file paths under `verify/smoke/command_output/`

- If verifying Stage C outputs:
  - `artifacts/stage_C/test_evidence.md` MUST exist and MUST reference:
    - `verify/unit/verification_report.json`
    - `verify/smoke/local_command_log.jsonl`
    - relevant stdout/stderr output file paths under `verify/smoke/command_output/`

- If verifying Stage D outputs:
  - `artifacts/stage_D/verification_report.md` MUST exist and MUST reference:
    - `verify/unit/verification_report.json`
    - `verify/smoke/local_command_log.jsonl`
    - relevant stdout/stderr output file paths under `verify/smoke/command_output/`

If the stage-scoped closure artifact is missing when required:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

### 4.2 Verification Authority Rule

Verification results are authoritative ONLY
when produced by the pipeline verification layer.

Execution agents MUST NOT:
- Declare verification success
- Suppress verification failures
- Downgrade failure severity

Verification is a gate, not a suggestion.

---

### 4.3 Verification Types

Depending on artifact type, verification may include:

#### a) Structural Verification
- File exists
- Correct path
- Correct naming
- Correct format (JSON / MD / JS / etc.)

#### b) Contract Verification
- Matches declared scope
- Matches defined interfaces
- Respects pipeline stage rules

#### c) Consistency Verification
- No contradiction with previous artifacts
- No duplicated responsibility
- No scope leakage

#### d) Execution Verification (if applicable)
- Local tests pass
- Commands execute without error
- Deterministic outputs confirmed

---

## 4.3.1 Prohibition of Superficial Verification

Verification MUST validate
actual compliance with artifacts and contracts.

The pipeline MUST NOT:
- Treat file existence as sufficient verification
- Accept green builds without contract validation
- Mark verification as PASS based on absence of errors

Verification MUST actively prove:
- Correctness
- Completeness
- Contract compliance

Any verification that does not
invalidate incorrect artifacts
is considered superficial
and MUST FAIL CLOSED.

If deep verification is REQUIRED by contract
but cannot be executed deterministically:

- Verification MUST FAIL CLOSED
- Execution MUST Abort
- No artifact may advance
- No workaround is permitted

Proceeding with partial or inferred verification
is strictly forbidden.

---

### 4.4 Verification Outputs

Verification MUST output exactly ONE live verification report artifact per run:

`verify/unit/verification_report.json`

This file MUST be schema-compliant per:
- Section 4.1.1 — Verification Report Artifact Schema (Hard)

No other verbal, narrative, or secondary verification output
may be treated as a verification result.

If the verification report is missing:
- VERIFICATION FAILED (Fail-Closed)

If multiple live verification reports exist:
- VERIFICATION MUST FAIL CLOSED
- Execution MUST halt

---

### 4.4.1 Verification Report Schema Authority (Hard)

The authoritative schema and rules for the live verification report
are defined EXCLUSIVELY in:

- Section 4.1.1 — Verification Report Artifact Schema (Hard)

This section MUST NOT restate, paraphrase, or duplicate the schema.

If any schema duplication occurs in this document:
- Verification MUST FAIL CLOSED
- Execution MUST halt

---

## 4.5 Execution Abort During Build or Verify (Hard Rule)

If at any point during Build or Verification
the pipeline determines that:

- Verification cannot be performed deterministically
- Required verification signals are unavailable
- Success cannot be proven without assumptions
- No retry or rollback path can restore validity

Then execution MUST enter Execution Abort.

In an Execution Abort:

- Build and verification MUST stop immediately
- No retries are allowed
- No rollback is initiated
- All artifacts remain preserved
- Progress MUST freeze
- Human escalation is REQUIRED

Execution Abort is not a failure of quality.
It is a correct enforcement of determinism.

---

## 5. Retry Policy

Each retry attempt MUST:
- Be logged as a retry attempt record under `verify/`
- Be traceable to the failure cause
- Declare the corrective strategy used
- Reference the triggering verification failure output

Retries are NOT Decisions.
A retry MUST NOT generate a Decision ID
unless a selectable execution fork exists
that requires human selection to proceed.

Unlogged retries are invalid
and considered a system violation.

---

### 5.0.1 Retry Attempt Record Schema (Hard)

Each retry attempt MUST produce exactly ONE immutable retry record artifact.

Path:
`verify/unit/retry_attempts/RETRY-<YYYYMMDD>-<HHMMSSZ>-<STAGE>.json`

Rules:
- JSON format ONLY
- Immutable once written
- No narrative explanation
- Contains ONLY deterministic fields
- Has ZERO execution authority

Minimum required fields:
- retry_id
- timestamp_utc
- stage
- triggering_verification_report (path)
- failure_code
- corrective_strategy_id
- materially_distinct_proof (single factual statement)
- result ("ATTEMPTED" | "SKIPPED" | "BLOCKED")

---

### 5.1 Verification Failure Finality Rule (Hard)

A verification failure is FINAL
for the CURRENT execution attempt.

Upon a verification FAIL, the system MUST:
- Stop the current execution attempt immediately
- Classify the failure deterministically
- Preserve all produced artifacts
- Prevent any conditional continuation

After a verification FAIL, the system MAY proceed
ONLY if:
- A retry is explicitly permitted by Autonomy Policy, OR
- A rollback is deterministically triggered

If neither retry nor rollback is permitted:
- Execution MUST Abort

The system MUST NOT:
- Continue execution within the same attempt
- Downgrade or soften verification checks
- Treat verification failure as recoverable by default

Verification failure finality applies
to the current attempt,
not to the entire task lifecycle.

---

### 5.2 Retry Restrictions

Retries are **NOT allowed** when:

- Failure is due to missing data
- Failure involves multiple valid options
- Failure indicates a boundary or policy risk

In these cases → **HUMAN INTERRUPT REQUIRED**

---

### 5.3 Retry Uniqueness Rule (Hard Constraint)

Retries MUST be materially distinct.

If multiple retries:
- Target the same failure cause
- Operate on the same artifact
- Do not alter the execution path in a structurally meaningful way

They are considered the SAME retry,
regardless of wording or minor adjustments.

Re-attempting the same failure pattern
under different labels
is forbidden.

If retry uniqueness cannot be guaranteed deterministically:
- Retries MUST stop
- Human interrupt is mandatory

---

## 5.4 Local Execution Loop Guard

If the same build–verify–rollback cycle
occurs repeatedly without closing
a new artifact or stage:

- The system MUST treat this as a loop
- Execution MUST halt
- A status report MUST be emitted
- Human escalation is REQUIRED

Repeated local cycles without forward closure
constitute a system fault.

A Local Execution Loop that cannot be resolved
within deterministic bounds
MUST be classified as an Execution Abort.

In this case:
- Execution MUST halt
- No further retries are allowed
- No rollback is permitted
- No Decision MUST be logged unless a valid fork exists

Loop detection without classification
is a system violation.

---

### 5.4.0 Loop Detection Failure Artifact (Hard)

When a Local Execution Loop is detected, the system MUST generate a structured failure artifact under:

`verify/audit/LOCAL-LOOP-<YYYYMMDD>-<STAGE>.json`

Minimum required fields:
- loop_id
- stage
- cycle_count
- last_failure_code
- last_verification_report (path)
- classification ("ABORTED" | "BLOCKED")
- timestamp_utc

This artifact has ZERO execution authority.
It exists only to justify:
- Execution Abort, OR
- Human Interrupt (if and only if a selectable fork exists)

No narrative content is permitted.

---

### 5.4.1 Loop Abort Supremacy Rule (Hard)

If a Local Execution Loop
is classified as non-resolvable:

- Execution MUST enter Execution Abort
- No rollback MUST be performed
- No retry is permitted
- The current execution path is permanently terminated

Rollback MUST NOT be used
to escape or mask execution loops.

Loop detection represents
a structural execution failure,
not an artifact failure.

Any attempt to apply rollback
after a loop-based abort
is a system violation.

---

## 6. Rollback Rules

### 6.1 When Rollback Is Triggered

Rollback is mandatory when:

- Verification fails after all retries
- Artifact causes downstream failure
- Output violates scope or policy

---

### 6.2 Rollback Behavior

Rollback is a terminal action
for the CURRENT execution attempt only.

Rollback permanently invalidates
all artifacts produced
during the failed attempt.

The pipeline MUST NOT:
- Reuse rolled-back artifacts
- Patch or partially recover them
- Treat rollback as a soft reset

After rollback:
- The CURRENT execution attempt is terminated
- Execution MAY re-enter the pipeline
  as a NEW execution attempt
- Re-entry MUST occur ONLY
  at the appropriate owning stage
- Re-entry MUST follow Pipeline Stages Specification
- Progress MUST be recalculated deterministically

Rollback restores authority boundaries.
It does NOT imply success,
continuation,
or partial credit.

Any attempt to continue execution
within the same attempt
after rollback
is a system violation.

---

## 7. Progress Tracking Contract

Build and verification activities
MUST NOT update progress directly.

Progress updates MAY occur ONLY when:
- An artifact is CLOSED
- A stage transition is completed
- A rollback or retry event is logged

All progress updates are governed exclusively by:
- Progress Tracking & Status Report Contract
- Pipeline orchestrator authority

Build/verify components MAY:
- Emit verification results
- Emit failure classifications

They MUST NOT:
- Modify progress percentages
- Advance stages
- Infer completion

Any progress update originating
from build or verification logic
constitutes an authority violation.

---

## 8. Human Interrupt Conditions

Forge MUST interrupt the human authority ONLY when execution is BLOCKED due to:

1. Multiple valid contract-compliant implementation options exist (selectable fork)
2. Required external inputs or secrets are missing
3. A boundary or policy risk is detected AND presents a selectable fork
4. Verification failure cannot be resolved deterministically AND a selectable fork exists

If a verification failure cannot be resolved deterministically AND NO selectable fork exists:
- Execution MUST enter Execution Abort
- No questions MUST be asked
- No options MUST be presented

All interrupt behavior is governed EXCLUSIVELY by:
- Autonomy Policy & Human Interrupt Protocol (Doc-04)
- Progress Tracking & Status Report Contract (Doc-06)

In all other cases, Forge proceeds autonomously.

---

## 9. Prohibited Behaviors

The following are strictly forbidden:

- Advancing without verification
- Assuming correctness
- Skipping rollback
- Overwriting valid artifacts with unverified ones
- Asking the user for confirmation without a hard reason

Any violation → **SYSTEM FAILURE**

---

## 10. Definition of Done (DoD)

This playbook is considered satisfied for a given local execution attempt ONLY when:

- Build completes successfully per Section 3.3
- Verification passes and `verify/unit/verification_report.json` exists with result "PASS"
- Any required audit logs and failure artifacts (if applicable) are written under `verify/audit/`
- The stage-scoped closure artifact required by Section 4.1.2 exists:
  - Stage B: `artifacts/stage_B/verification_evidence.md`
  - Stage C: `artifacts/stage_C/test_evidence.md`
  - Stage D: `artifacts/stage_D/verification_report.md`
- No blocking condition remains unresolved in the governing execution state
- Progress handling is performed ONLY by the orchestrator per Doc-06

This playbook grants ZERO authority to:
- Declare overall task success
- Advance pipeline stages
- Modify governed runtime authority artifacts
- Modify `progress/status.json`

Only then may the pipeline proceed to the next contract-governed stage gate.

**END OF DOCUMENT**
