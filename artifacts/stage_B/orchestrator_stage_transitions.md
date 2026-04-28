# Orchestrator Spec - Stage Vocabulary and Transition Constraints (Minimal)

**Task ID:** TASK-001  
**Stage:** B (Specification)  
**Status:** FINAL — EXECUTION-BOUND

---

## 1. Purpose

Define the minimal deterministic constraints governing:

- stage names
- allowed transitions
- re-entry behavior constraints (high-level only)

This spec defines constraints only. It does not define rollback or retry mechanics.

---

## 2. Stage Vocabulary (Exact)

Valid stages are:

- `INIT`
- `READY`
- `A`
- `B`
- `C`
- `D`

No other stage labels are permitted.

---

## 3. Allowed Forward Transitions (Minimal)

The orchestrator MUST allow ONLY these forward transitions:

- `INIT` -> `READY`
- `READY` -> `A`
- `A` -> `B`
- `B` -> `C`
- `C` -> `D`

Any other forward transition is forbidden.

---

## 4. Allowed Non-Forward Transitions (Minimal)

The orchestrator MUST allow non-forward transitions ONLY as explicit re-entry / return-to-owning-stage states when a failure is detected.

Allowed return transitions:

- `B` -> `A`
- `C` -> `B`
- `D` -> `C`

Any other non-forward transition is forbidden.

This spec does not define the conditions under which returns occur. It only restricts the allowed direction of return.

---

## 5. No Skip Rule (Hard)

The orchestrator MUST NOT skip stages.

Examples of forbidden transitions:

- `READY` -> `B`
- `A` -> `C`
- `B` -> `D`
- `INIT` -> `A`

---

## 6. Deterministic Transition Recording

Every transition MUST be reflected by a full overwrite update to:

- `progress/status.json`

The new `current_stage` value MUST match the transition outcome.

---

## 7. Out of Scope

- Decision rules
- Boundary audit execution timing
- Retry exhaustion behavior
- Rollback mechanics
- Progress percent mapping

---

END
