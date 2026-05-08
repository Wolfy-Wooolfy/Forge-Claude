# Forge — Execution Instructions

## Execution Authority

The attached ZIP snapshot is the SINGLE SOURCE OF TRUTH
for this execution session.

No external repository, link, or reference
has any authority over execution.

No execution, modification, or continuation is permitted
outside the state recorded inside the ZIP snapshot.

---

## Mandatory Pre-Execution Checklist (HARD GATE)

Before ANY action, the assistant MUST complete ALL of the following
and explicitly confirm completion.

### 1. Snapshot State Reading (MANDATORY)

The assistant MUST:

- Read the FULL ZIP snapshot tree

  Definition of READ (Binding):
  “Read” means a complete, non-summarized, non-sampled,
  non-inferred parsing of every file,
  including all text, structure, metadata, and ordering.
  Skimming, partial reading, structural scanning,
  or assumption-based interpretation does NOT qualify as reading.

- Read the FULL contents of:
  - progress/status.json
  - progress/history/* (if present)
  - architecture/* (if present)
  - docs/** (ALL documents)
  - code/** (existing code only, if present)

- Derive the CURRENT stage, task, and next_step
  STRICTLY from progress/status.json

Execution is FORBIDDEN without this confirmation.

---

### 2. Explicit Reading Confirmation (REQUIRED)

The assistant MUST explicitly state:

> READ COMPLETE:
> - ZIP snapshot
> - progress/status.json
> - progress/history/*
> - architecture/*
> - docs/**
> - code/**

This statement constitutes an explicit assertion of full,
exhaustive reading responsibility.

If this statement is missing or incomplete,
execution MUST STOP.

---

### 3. Status-Driven Continuation Rule

The ONLY allowed execution entry point is:

- progress/status.json → `next_step`

No assumptions.
No jumping stages.
No inferred tasks.

If `execution_state` is not RUNNING or IDLE,
no execution may proceed.

---

### 4. Stage Boundary Enforcement (HARD)

- No stage may be opened unless explicitly recorded in status.json
- No future stage may be partially implemented
- Verification (Stage D) is STRICTLY FORBIDDEN
  unless status.json explicitly enters Stage D

---

### 5. Change Discipline

For ANY change:

- Read the authoritative file first
- State: READ COMPLETE: <file paths>
- Apply the change inside the ZIP context
- Update progress/status.json
- Log stage transition if applicable

No speculative or partial execution is allowed.

---

## Chat-Declared State Acknowledgment (Controlled)

In cases where the user explicitly declares in chat
that a modification, execution, or decision has been completed,
but the ZIP snapshot has not yet been updated:

- The assistant MUST acknowledge the user declaration
  as a TEMPORARY DECLARED STATE.

- This declared state is classified as:
  PENDING — not authoritative.

- The assistant MUST:
  - Accept the declaration for conversational continuity
  - Mark the state as “ZIP update pending”
  - Avoid disputing or invalidating the declaration
    solely due to ZIP mismatch

- The assistant MUST NOT:
  - Execute further dependent steps
  - Close stages
  - Generate final artifacts
  - Treat the declaration as authoritative

- Upon the next ZIP snapshot update:
  - The assistant MUST reconcile
    the declared state with the ZIP contents
  - Any mismatch MUST be resolved in favor of the ZIP snapshot

This rule exists to prevent execution deadlock
without weakening ZIP-first authority.

---

## Enforcement Rule

If any step above is skipped or violated:

- Execution MUST STOP
- No partial work is allowed
- No interpretation is allowed

This document is binding.

---

## 6. Closure Gate (Mandatory for every phase)

A phase is **never** considered complete until ALL of the following are true:

1. `node bin/forge-doctor.js` exits with status code 0.
2. `node bin/forge-test.js` produces a report where every scenario is either `PASS` or `SKIPPED`. **A single `FAIL` blocks closure.**
3. A decision artifact under `artifacts/decisions/DECISION-<ts>-phase-<N>-closure.md` exists and contains:
   - explicit owner approval (verbatim chat reply quoted)
   - the list of scenarios that passed (with run IDs)
   - the list of files modified
   - any unresolved risks
4. `progress/status.json.current_task` is updated to the next phase.
5. `progress/status.json.next_step` describes the immediate next action (not a vague goal).
6. An Exit Report is posted to the user (Arabic), containing:
   - الملفات المعدّلة (paths)
   - السلوك الجديد (1-2 paragraphs)
   - Scenarios اللي عدت
   - Risks متبقية

If any of (1)–(6) is missing, the phase remains OPEN. The assistant is forbidden from declaring completion or moving to the next phase.

This rule supersedes any other instruction that suggests "partial closure" or "move on and finish later".

---

## 7. Phase Failure Rule

When a closure-gate criterion fails:

1. The phase **stays OPEN**. `current_task` is NOT advanced.
2. The decision artifact gains an `unmet_criteria: [...]` field listing the specific failure (e.g. `"scenario_id_5 FAIL: expected tool fs.write_file not called"`).
3. A sub-task is opened to address the failure. The sub-task lives under the same phase, identified as `<phase>.<n>` (e.g. `PHASE-2.1`, `PHASE-2.2`).
4. The phase only closes once the sub-tasks resolve every `unmet_criteria`.
5. **Phases are atomic.** No phase is "partially closed". A phase is OPEN, IN_PROGRESS, or CLOSED — there is no fourth state.

This rule prevents drift, hidden tech debt, and the "we'll come back to it later" failure mode.
