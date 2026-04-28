# Orchestrator Spec — Runner (Minimal, Deterministic)

**Task ID:** TASK-006  
**Stage:** B (Specification)  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Purpose

Define the exact deterministic behavior of the **Orchestrator Runner**.

The Runner is a minimal runtime component responsible ONLY for:
- reading execution state
- validating stage transitions
- writing updated execution status

The Runner performs NO autonomy, NO decision-making, and NO retries.

---

## 2. Inputs (Authoritative)

The Runner MUST read exactly one file:

- `progress/status.json`

No other input source is permitted.

---

## 3. Dependencies (Hard)

The Runner MUST depend ONLY on:
- `code/src/orchestrator/stage_transitions.js`
- `code/src/orchestrator/status_writer.js`

No additional modules are allowed.

---

## 4. Execution Rules (Deterministic)

### 4.1 Read
The Runner MUST:
- load `progress/status.json`
- parse it as JSON
- fail immediately if parsing fails

---

### 4.2 Validate
The Runner MUST:
- read `current_stage`
- read `next_step`
- determine the target stage ONLY if explicitly encoded in `next_step`

If no target stage can be derived:
- the Runner MUST exit without modification

---

### 4.3 Transition
If a target stage is present:
- the Runner MUST call `validateTransition(from, to)`
- if validation fails → execution MUST abort (no write)

---

### 4.4 Write
If validation passes:
- the Runner MUST update `current_stage`
- the Runner MUST reset `stage_progress_percent` to `0`
- the Runner MUST update `current_task`
- the Runner MUST write the full payload via `status_writer.writeStatus`

Partial updates are forbidden.

---

## 5. Forbidden Behavior (Hard)

The Runner MUST NOT:
- create artifacts
- modify artifacts
- execute stages
- loop
- retry
- infer next steps
- invoke AI or LLMs

---

## 6. Failure Handling

On any failure:
- no file MUST be written
- no partial state MUST exist
- the Runner MUST terminate

---

END
