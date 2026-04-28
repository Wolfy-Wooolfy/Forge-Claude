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
