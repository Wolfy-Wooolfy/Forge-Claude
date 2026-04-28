# 📄 Artifact Authority Hierarchy Specification
**Document ID:** DOC-11  
**Status:** EXECUTION-BOUND  
**Scope:** Governance & Authority Resolution  
**Applies To:** Entire Forge System  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines the **authoritative hierarchy** of all project documents,
artifacts, runtime files, and execution contracts.

Its purpose is to:

- Eliminate authority ambiguity
- Prevent derived-authority violations
- Define conflict resolution rules
- Guarantee deterministic governance
- Bind Cognitive Layer execution to Stage authority

No execution may proceed under ambiguous authority.

---

## 2. Authority Layers (Highest → Lowest)

### Layer 0 — Stage Execution Contracts (ABSOLUTE AUTHORITY)

Includes:
- docs/03_pipeline/*
- docs/04_autonomy/*
- docs/05_artifacts/*
- docs/06_progress/*
- docs/09_verify/*
- docs/10_runtime/*

These define:
- What may execute
- When execution must stop
- What constitutes completion
- What artifacts are mandatory
- What constitutes failure

If conflict occurs:
→ Stage contracts ALWAYS override lower layers.

---

### Layer 1 — Artifact Schema & Repository Layout

Defines:
- Where artifacts must exist
- Naming conventions
- Closure rules
- Deterministic artifact identity

Artifacts that violate schema:
→ MUST be treated as non-existent.

---

### Layer 2 — Cognitive Layer (Task Execution Layer)

Includes:
- Task handlers
- Validators
- Analyzers
- Trace generators
- Gap detectors
- Verification runners

Tasks:
- MAY execute ONLY if Stage authority allows
- MAY NOT redefine Stage contracts
- MAY NOT redefine artifact schema
- MUST produce artifacts that comply with schema

Tasks are execution mechanisms,
NOT governance authorities.

---

### Layer 3 — Governed runtime state split

#### Layer 3A — `artifacts/forge/forge_state.json`
Carries authoritative Forge self-build continuity, next allowed step, closed-task lineage, and execution integrity.

#### Layer 3B — `artifacts/orchestration/orchestration_state.json`
Carries authoritative current-run orchestration status for governed runtime execution.

#### Layer 3C — `progress/status.json`
Carries human-visible status reflection for target-project progress/reporting only.

`progress/status.json` MUST NOT grant execution authority,
resume authority,
or module-selection authority.

---

### Layer 4 — Vision Reference (DOC-01)

The Vision document:
- Anchors long-term system direction
- Defines target architecture
- Defines success criteria
- Enables gap detection

The Vision:
- MUST NOT grant execution authority
- MUST NOT override Stage contracts
- MUST NOT redefine artifacts

It is a reference baseline only.

---

## 3. Authority Conflict Resolution Rule

If two layers conflict:

1. Stage Contracts override everything.
2. Artifact Schema overrides Cognitive Layer outputs.
3. Artifacts override status.json declarations.
4. Vision cannot override execution contracts.

If ambiguity remains:
→ Execution MUST enter BLOCKED state
→ A single blocking question must be raised

No inferred resolution is allowed.

---

## 4. Task-to-Stage Binding Rule

Every Task MUST:

- Declare the Stage it belongs to
- Declare which contract clauses it satisfies
- Declare which artifact(s) it produces
- Declare closure condition
- Declare rollback condition

A Task WITHOUT stage binding is invalid.

A Stage WITHOUT artifact proof is incomplete.

---

## 5. Artifact Closure Supremacy Rule

Progress is advanced ONLY when:

- A mandatory artifact exists
- Artifact matches schema
- Closure is explicitly declared
- No unresolved MUST-level gaps remain

Activity does not equal progress.
Execution logs do not equal closure.
LLM output does not equal artifact.

---

## 6. Derived Authority Violation Definition

A Derived Authority Violation occurs when:

- A task redefines stage behavior
- A task advances stage without required artifacts
- status.json declares completion without artifact proof
- A document contradicts higher authority without escalation

If detected:
→ Execution MUST abort.

---

## 7. Mandatory Governance Invariants

The system MUST ALWAYS:

- Be deterministic
- Be fail-closed
- Advance only via artifacts
- Escalate ambiguity
- Separate execution from authority
- Prevent narrative drift

---

## 8. Compliance Requirement

This document is EXECUTION-BOUND.

Any deviation from this authority hierarchy:

→ Constitutes governance failure
→ Invalidates downstream execution
→ Requires remediation before continuation

---

**END OF DOCUMENT**