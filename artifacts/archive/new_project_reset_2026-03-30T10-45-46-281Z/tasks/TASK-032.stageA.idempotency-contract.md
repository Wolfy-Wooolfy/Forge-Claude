# TASK-032 — Stage C Execution Idempotency & State Guard Contract

## Contract Objective

Introduce strict execution guards to ensure:

* No task may execute more than once after completion.
* Stage progress cannot regress.
* State mutation is strictly controlled.
* Execution remains deterministic and fail-closed.

---

## Guard Requirements

### 1) Task Idempotency

If:

* `stage_progress_percent` == 100
* AND `current_task` matches the executing task

Then:

* Execution MUST abort.
* No artifact may be written.
* No state may be mutated.

---

### 2) Stage Progress Monotonicity

Rules:

* `stage_progress_percent` may only increase.
* It must never decrease.
* Attempted regression MUST hard-fail.

---

### 3) Controlled State Mutation

During execution:

* Only `stage_progress_percent`
* Only `last_completed_artifact`

may be updated.

All other fields are immutable.

Any additional mutation MUST fail.

---

### 4) Artifact Write Protection

A task may:

* Create its execution closure artifact once.

If artifact already exists:

* Execution MUST abort.

No overwrite allowed.

---

### 5) Fail-Closed Behavior

Any violation of:

* Idempotency
* Monotonicity
* Schema constraints
* Artifact duplication

MUST:

* Throw explicit error
* Stop execution immediately
* Leave state unchanged

---

## Verification Requirements (Stage C)

Verification must confirm:

* Re-running TASK-031 does not execute.
* stage_progress cannot drop.
* Duplicate artifacts are rejected.
* Status schema remains enforced.
* All smoke tests pass.

---

## Scope Limitation

This contract introduces:

* No autonomy
* No loops
* No multi-step execution
* No decision logic

It only hardens execution safety.

---

## Expected Result

After TASK-032 implementation:

HALO execution becomes:

* Idempotent
* Monotonic
* Deterministic
* Strictly fail-closed
