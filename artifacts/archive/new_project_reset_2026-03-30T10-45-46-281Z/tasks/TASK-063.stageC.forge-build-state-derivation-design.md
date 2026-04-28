# TASK-063 — Stage C

## Forge Build State Derivation Design

**Artifact ID:** `TASK-063.stageC.forge-build-state-derivation-design.md`
**Stage:** C
**Status:** OPEN
**Depends On:** TASK-063 Stage A, Stage B
**Scope:** Deterministic design for Forge build-state derivation

---

## 1. Purpose

This stage defines the complete deterministic logic required to derive Forge build-state from repository artifacts.

It transforms identified gaps into:

* explicit derivation rules
* precedence hierarchy
* validation logic
* fail-closed enforcement
* deterministic resolution guarantees

---

## 2. Core Design Principles

### 2.1 Artifact Supremacy

All state must be derived strictly from repository artifacts.

---

### 2.2 Determinism First

Same repository → same derived state
No randomness
No interpretation

---

### 2.3 Fail-Closed Enforcement

If derivation is not guaranteed → system must BLOCK

---

### 2.4 Single-State Guarantee

Only one valid state may exist
Otherwise → INCONSISTENT

---

## 3. Task Ordering Authority

### 3.1 Primary Authority

`code/src/execution/task_registry.js`

This file becomes:

* the **single authoritative source** of:

  * task ordering
  * execution sequence
  * dependency chain

---

### 3.2 Ordering Rule

Tasks must be processed strictly in registry order.

No artifact may override this order.

---

## 4. Closure Authority Rule

### 4.1 Primary Closure Signal

A task is considered CLOSED only if:

`artifacts/tasks/TASK-XXX.execution.closure.md` exists

---

### 4.2 Secondary Signals (Ignored for Closure)

The following must NOT be used as closure indicators:

* stage artifacts (A/B/C/D)
* docs presence
* code existence
* orchestration reports

---

### 4.3 Closure Continuity Rule

Closure must be continuous:

* if TASK-060 is closed
* but TASK-059 is not

→ system = INCONSISTENT

---

## 5. Last Completed Artifact Logic

### 5.1 Determination Rule

The last completed artifact is:

* the highest task in registry order
* that satisfies:

  * valid closure artifact exists
  * all previous tasks are also closed

---

## 6. Open Tasks Logic

A task is OPEN if:

* it exists in registry
* and does NOT have valid closure artifact

---

## 7. Current Task Logic

`current_task` is:

* the first OPEN task in registry order

---

## 8. Stage Derivation Logic

### 8.1 Stage Mapping Rule

Stage must be derived from task naming:

* `.stageA.` → A
* `.stageB.` → B
* `.stageC.` → C
* `.stageD.` → D

---

### 8.2 Current Stage Rule

Current stage = stage of `current_task`

---

## 9. Build Progress Calculation

### 9.1 Rule

```
build_progress_percent =
(closed_tasks_count / total_tasks_count) * 100
```

---

### 9.2 Constraints

* Rounded integer
* If inconsistent → value must not be trusted

---

## 10. Execution Integrity Logic

### 10.1 CONSISTENT

All conditions met:

* valid ordering
* continuous closures
* no conflicting artifacts
* single valid state

---

### 10.2 INCONSISTENT

Occurs if:

* closure gaps exist
* task order violated
* multiple interpretations possible

---

### 10.3 BLOCKED

Occurs if:

* required artifacts missing
* registry unreadable
* no derivation possible

---

## 11. Pending Gaps Logic

Pending gaps must include:

* tasks missing closure
* blueprint-required components not implemented
* contract vs code mismatches (if detectable)

---

## 12. Next Allowed Step Logic

`next_allowed_step` must be:

* the Stage A artifact of `current_task`

---

## 13. Derived From Trace

Must include:

* task_registry reference
* list of closure artifacts used
* timestamp

---

## 14. Deterministic Output Structure

The derived output must strictly follow:

```json
{
  "status_type": "FORGE_BUILD_STATE",
  "current_stage": "C",
  "current_task": "TASK-063",
  "last_completed_artifact": "TASK-062.execution.closure.md",
  "closed_tasks": [],
  "open_tasks": [],
  "pending_gaps": [],
  "build_progress_percent": 0,
  "execution_integrity": "CONSISTENT",
  "next_allowed_step": "TASK-063.stageA",
  "derived_from": [],
  "derived_at": ""
}
```

---

## 15. Validation Rules

Derivation must FAIL if:

* registry missing
* closure chain broken
* duplicate task IDs
* invalid artifact naming

---

## 16. System Behavior

### 16.1 If CONSISTENT

System proceeds normally

---

### 16.2 If INCONSISTENT

System must STOP and report conflict

---

### 16.3 If BLOCKED

System must STOP and request missing inputs

---

## 17. Outcome

This design guarantees:

* deterministic Forge build-state
* zero ambiguity
* strict artifact governance
* compatibility with fail-closed philosophy

---

## 18. Next Step

**TASK-063 Stage D — Implementation**
