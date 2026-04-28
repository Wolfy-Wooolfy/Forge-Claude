# Cognitive Prompt Construction Contract

**Document ID:** DOC-01-PROMPT  
**Status:** EXECUTION-BOUND  
**Scope:** Defines deterministic prompt construction rules for all cognitive calls  
**Applies To:** Cognitive Layer + Cognitive Adapter Layer  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines how prompts are constructed
before being sent to any external Cognitive Engine.

Prompt construction MUST be deterministic,
versioned, and auditable.

Uncontrolled prompt variation is forbidden.

---

## 2. Deterministic Template Requirement (Hard)

Each task category MUST have:

- A fixed prompt template
- A version identifier
- A deterministic section ordering

Example categories:

- DOC_WRITER
- CODE_WRITER
- ANALYZER
- VERIFIER

Prompt templates MUST NOT:
- Be dynamically assembled from arbitrary fragments
- Include non-deterministic system messages
- Change order of structural sections

---

## 3. Prompt Template Versioning (Hard)

Each template MUST include:

- template_id
- template_version
- template_hash (SHA-256 of template text)

The adapter MUST persist template metadata in:

artifacts/llm/metadata/<task_id>.json

Template changes MUST:
- Be explicitly committed
- Be traceable via repository history
- NOT silently modify existing execution flows

---

## 4. Allowed Prompt Inputs

Prompt construction may include:

- Task-specific parameters
- Artifact content (bounded)
- Explicit constraints

Prompt MUST NOT include:

- External dynamic context
- Runtime speculation
- Heuristic system messages
- Hidden provider instructions

---

## 5. Prompt Authority Boundaries

Prompt content:

- Does NOT grant authority to the model
- Does NOT override Forge contracts
- Cannot redefine success criteria

All model output remains candidate material
until validated by stage contracts.

---

## 6. Reproducibility Guarantee

Given:

- Same task_id
- Same template_version
- Same input artifacts
- Same provider/model_id

Forge MUST be able to reproduce
the same prompt structure deterministically.

Model output variability is permitted.
Prompt variability is NOT.

---

## 6.1 Template Version Lineage Binding (Hard)

Once a task begins execution:

- The template_version used for the first cognitive call
  MUST be bound to that task_id.

- All subsequent cognitive calls within the same task lineage
  MUST use the same template_version.

Template version changes:

- MUST NOT occur mid-task.
- MUST NOT silently alter ongoing execution.
- MAY require a new task initiation
  OR an explicit architectural Decision (if system-wide impact).

Mixing template versions within a single task lineage
constitutes a deterministic integrity violation
and MUST halt execution.

---

## 7. Acceptance Criteria

This contract is satisfied when:

- Every cognitive call references a versioned template.
- Template metadata is persisted.
- Prompt construction logic is centralized and deterministic.
- Template changes are traceable.
- No hidden system messages exist.

---

**END OF DOCUMENT**