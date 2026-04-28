# TASK-001 - Orchestrator Skeleton (Deterministic Stage Runner)

**Task ID:** TASK-001  
**Stage:** A (Architecture)  
**Goal:** Define a minimal deterministic orchestrator skeleton with explicit separation between Forge self-build authority, runtime execution state, and human-visible project status reflection.  
**Scope:** Repository-local, no external dependencies, no CI, no network calls.

---

## 1. Objective

Create the minimal foundation for a deterministic pipeline orchestrator that:

- Enforces stage naming and sequencing (A -> D)
- Writes authoritative Forge self-build state to `artifacts/forge/forge_state.json`
- Writes authoritative per-run orchestration state to `artifacts/orchestration/orchestration_state.json`
- Writes human-visible status reflection to `progress/status.json` without granting it execution authority
- Produces no narrative outputs as authority
- Does not implement agent execution yet
- Uses schema-bound file artifacts as the only authoritative state carriers

---

## 2. Inputs (Authoritative)

- docs/01_system/* (Operating model and authority boundaries)
- docs/03_pipeline/* (Stage ordering, gates, re-entry rules)
- docs/06_progress/* (Status schema and state rules)
- docs/05_artifacts/* (Repository layout and artifact authority rules)
- docs/08_audit/* (Boundary Audit gating rules)
- docs/07_decisions/* (Decision logging rules)

---

## 3. Outputs (Required Artifacts)

Stage A MUST produce:

1) `architecture/task_plan.md` (this file)  
2) `architecture/validated_assumptions.md`

Downstream placeholders (NOT produced in Stage A, listed for traceability only):

- `code/src/orchestrator/*` (Stage C)
- `code/tests/*` (Stage C)
- `verify/*` (Stage D)

---

## 4. Execution Plan (Atomic Steps)

### A1 - Freeze task framing
- Lock Task ID and name: TASK-001
- Lock scope: status.json update only, no execution of real stages

### A2 - Define orchestrator responsibilities (minimal)
- Forge build-state writing: update `artifacts/forge/forge_state.json`
- Runtime execution-state writing: update `artifacts/orchestration/orchestration_state.json`
- Status reflection writing: update `progress/status.json` as output only
- Stage vocabulary: INIT, READY, A, B, C, D
- Allowed execution_state set: IDLE, RUNNING, BLOCKED, ABORTED, COMPLETE
- No derived authority: orchestrator behavior must be justified by explicit contracts

### A3 - Define required status transitions for TASK-001
- READY -> A/RUNNING (already done)
- A/RUNNING -> A/BLOCKED (only if missing mandatory input)
- A/RUNNING -> A/IDLE (if Stage A artifacts are produced and closed)
- Any ABORT must be terminal and freeze progress

### A4 - Produce validated assumptions artifact
- List any assumptions needed for TASK-001
- Mark each as VALIDATED or REQUIRES_HUMAN_DECISION
- Any unresolved assumption blocks Stage A closure

### A5 - Stage A closure gate (definition only)
Stage A for TASK-001 may close ONLY if:
- `architecture/task_plan.md` exists
- `architecture/validated_assumptions.md` exists
- No unresolved assumptions remain
- No missing mandatory input exists

---

## 5. Failure Handling (Stage A)

If ambiguity, missing authority, or missing mandatory inputs exist:
- Execution MUST enter BLOCKED state (not ABORT) if a selectable fork exists
- Execution MUST enter ABORTED if no valid continuation path exists
- No Decision may be logged unless a selectable execution fork exists

---

## 6. Non-Goals (Explicit Out of Scope)

- Implementing orchestrator code
- Executing agents
- Implementing audits
- Implementing decision logging runtime
- Adding CI/CD
- Adding project scaffolding beyond required artifacts

---

## 7. Definition of Done (TASK-001 Stage A)

Stage A for TASK-001 is DONE when:
- `architecture/task_plan.md` is present and complete
- `architecture/validated_assumptions.md` is present with all assumptions resolved
- Forge authority, orchestration authority, and status reflection roles are explicitly separated with no claim that `progress/status.json` controls execution

---

END
