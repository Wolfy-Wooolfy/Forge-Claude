# Cognitive Engine Interface Contract

Document ID: DOC-CE-01  
Status: ACTIVE  
Scope: Defines the relationship between Forge and any external Cognitive Generation Engine  
Enforcement Level: HARD (Governance-Critical)

---

## 1. Purpose

This document formally defines the architectural relationship between:

- Forge (Deterministic Governance & Execution Engine)
- External Cognitive Engine (LLM or equivalent generation system)

Forge does NOT contain an intrinsic reasoning model.
All generative, analytical, or synthetic output may be produced via an external Cognitive Engine.

However:

Authority remains exclusively within Forge.

---

## 2. Architectural Separation Principle

Forge consists of two strictly separated layers:

### A) Governance & Authority Layer (Internal)

Owned by Forge:
- Stage control
- Status state
- Artifact validation
- Contract enforcement
- Audit logic
- Integrity verification
- Naming authority
- Transition permissions

This layer is deterministic and fail-closed.

### B) Cognitive Generation Layer (External)

May include:
- Large Language Models (LLMs)
- Symbolic reasoning engines
- Other generative AI systems

This layer:
- Produces candidate outputs only
- Has no authority
- Cannot mutate system state directly
- Cannot advance stages
- Cannot create valid artifacts without Forge validation

---

## 3. Dependency Declaration

Forge MAY depend on an external Cognitive Engine
for document generation, architecture drafting,
code writing, analysis, and gap detection.

This dependency:

- Is operational, not authoritative
- Must remain model-agnostic
- Must be replaceable without changing governance rules

Changing the provider or model
does NOT change Forge architecture.

---

## 4. Output Authority Rule

All Cognitive Engine outputs are classified as:

UNVERIFIED CANDIDATE OUTPUT

They become authoritative ONLY IF:

1. Persisted as artifacts
2. Validated against contracts
3. Pass integrity checks
4. Recorded in governed runtime authority artifacts and mirrored in `progress/status.json` if human-visible reflection is required

No raw model output has authority.

---

## 5. Auditability Requirement

All interactions with the Cognitive Engine MUST:

- Be traceable
- Be reproducible where possible
- Be stored as artifacts (prompt + response)
- Include metadata (model id, timestamp, context info)

Absence of stored interaction logs
constitutes governance non-compliance.

---

## 6. Fail-Closed Guarantee

If the Cognitive Engine:

- Is unavailable
- Produces malformed output
- Violates contract constraints

Forge MUST:

- Reject output
- Enter BLOCKED state if required
- Prevent stage transition

No silent degradation is allowed.

---

## 7. Model-Agnostic Rule

Forge must not:

- Hard-code a specific model
- Depend on provider-specific behavior
- Assume probabilistic consistency

All cognitive generation must be abstracted behind a logical interface.

---

## 8. Governance Supremacy Statement

Forge governs.
Cognitive Engines generate.

Generation does not imply authority.
Authority derives exclusively from contracts and artifacts.

End of Contract.