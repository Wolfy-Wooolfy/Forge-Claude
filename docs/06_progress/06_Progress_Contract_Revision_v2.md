# 📄 Progress Contract Revision v2
**Document ID:** DOC-18  
**Status:** EXECUTION-BOUND  
**Scope:** status.json Governance & Stage Progress Rules  
**Applies To:** Entire Pipeline  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document redefines the Progress Contract
to align with:

- Loop Enforcement (DOC-13)
- Artifact Authority (DOC-11)
- Cognitive Layer (DOC-12)
- Stage Contracts v2 (DOC-14)
- Artifact Schema v2 (DOC-17)

Progress must reflect artifact reality only.

---

## 2. status.json Authority Boundaries

status.json:

- Reflects state
- Does NOT define authority
- Cannot override artifacts
- Cannot advance stage without closure proof

If status.json contradicts artifacts:
→ Execution enters BLOCKED state.

Artifacts always win.

---

## 3. Required Fields (v2 Schema)

status.json MUST contain:

- current_stage
- current_task
- stage_progress_percent
- overall_progress_percent
- last_completed_artifact
- blocking_questions
- issues
- next_step

Optional fields are prohibited unless documented.

---

## 4. Stage Progress Rule

stage_progress_percent may be:

- 0–99 if stage not closed
- 100 ONLY if Stage Closure Artifact exists

Setting 100 without closure artifact:
→ Governance violation

---

## 5. overall_progress_percent Rule

Calculated deterministically:

Stage A complete → 25%
Stage B complete → 50%
Stage C complete → 75%
Stage D complete → 100%

Partial stages may proportionally increase,
but only if artifacts exist.

No artifact → No progress.

---

## 6. Task Binding Rule

If a task is active:

- current_task must include Task ID
- Task must belong to current_stage
- Task must have declared artifact outputs

If mismatch:
→ BLOCKED

---

### Execution Semantics: current_task

`current_task` is execution-bound.

- If `current_task` is non-empty, it MUST be a valid executable task name.
  Allowed namespaces:
  - `TASK-`
  - `SMOKE:`

- If there is no executable task to run, `current_task` MUST be an empty string (`""`).

Stage descriptions, phase narration, or governance guidance MUST be placed in `next_step`, not `current_task`.

Violations MUST fail-closed at runtime.

---

## 7. Loop Enforcement Binding

Stage cannot close unless:

- Corresponding Loop closure conditions satisfied (DOC-13)
- Mandatory artifacts exist
- No unresolved MUST-level violations remain

status.json must not declare stage completion prematurely.

---

## 8. Blocking State Definition

Blocking occurs when:

- MUST artifact missing
- MUST gap detected
- Verification failure
- Authority conflict
- Escalation raised

When blocked:

- next_step must be empty OR contain single blocking instruction
- Exactly one blocking question allowed

---

## 9. Derived Authority Violation (Progress-Level)

Occurs when:

- Stage advanced without artifact
- Progress increased without proof
- status.json contradicts trace matrix
- Stage D opened without compliance

If detected:
→ Immediate halt
→ Requires remediation artifact

---

## 10. Deterministic Progress Rule

Progress must be:

- Machine-verifiable
- Artifact-driven
- Reproducible
- Non-narrative

LLM statements do not change progress.

Only artifact existence does.

---

## 11. Compliance Requirement

Progress is valid ONLY if:

- status.json matches artifact state
- Stage closure artifact exists for 100%
- Loop enforcement conditions satisfied
- Vision compliance not violated

---

## 12. Supersession

This document supersedes previous progress definitions.

If conflict occurs:
→ Authority hierarchy (DOC-11) applies.

---

**END OF DOCUMENT**