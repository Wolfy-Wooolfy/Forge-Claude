# 📄 Artifact Serialization and Embedded JSON Rule
**Document ID:** DOC-21  
**Status:** EXECUTION-BOUND  
**Scope:** Artifact Format Normalization (Human + Machine)  
**Applies To:** Task Artifacts, Verification Artifacts, Coverage Artifacts  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document resolves the format mismatch between:

- Existing Markdown-based artifacts under artifacts/
and
- Machine-verifiable JSON schemas under docs/* (SCHEMA-XX)

It enables artifacts to remain human-readable
while being strictly machine-verifiable.

---

## 2. Canonical Serialization Rule

### 2.1 Default Artifact Container
The canonical artifact container format is:

- Markdown (.md)

### 2.2 Mandatory Embedded JSON Block (when schema exists)
If an artifact type has a canonical JSON Schema (SCHEMA-XX),
the artifact MUST include exactly one embedded JSON block
that conforms to that schema.

---

## 3. Embedded JSON Block Specification (Hard)

### 3.1 Location
The embedded JSON block MUST appear at the top of the artifact file,
immediately after the title header (if present).

### 3.2 Fence Format
The embedded JSON MUST be enclosed in a fenced code block:

```json
{ ... }
````

### 3.3 Single Source of Truth

The embedded JSON block is the machine-authoritative truth.
Any narrative text below it is non-authoritative commentary
and MUST NOT contradict the JSON.

If contradiction exists:
→ Artifact invalid.

### 3.4 Exactly One JSON Block

Artifacts with schemas MUST contain:

* exactly one embedded JSON block

More than one:
→ Artifact invalid.

Missing:
→ Artifact invalid.

---

## 4. Task Artifact Binding (SCHEMA-02)

All task artifacts under:

* artifacts/tasks/

MUST be Markdown files that embed a JSON block
conforming to:

* docs/05_artifacts/task_artifact_schema_v1.json (SCHEMA-02)

Without a valid embedded JSON block:
→ Task artifact is treated as non-existent.

---

## 5. Verification Artifacts Binding (Stage C)

If verification artifacts are stored as Markdown,
they MUST embed JSON blocks conforming to their schemas.

Applicable schemas:

* docs/09_verify/trace_matrix_schema_v1.json (SCHEMA-03)
* docs/09_verify/mismatch_report_schema_v1.json (SCHEMA-04)
* docs/09_verify/verification_evidence_schema_v1.json (SCHEMA-05)

If an artifact is stored as pure .json file:

* The file content itself MUST validate against its schema.

---

## 6. Validator Behavior Requirement

Any validator that checks artifacts against schemas MUST:

1. Detect artifact container type (.md or .json)
2. If .md:

   * extract the single embedded JSON block
   * validate extracted JSON against the canonical schema
3. If .json:

   * validate file content against schema

If extraction fails:
→ artifact invalid
→ execution BLOCKED

---

## 7. Backward Compatibility Rule (Fail-Closed Migration)

Legacy task artifacts that do not contain embedded JSON
are treated as legacy-narrative-only.

They remain present in the repo but:

* MUST NOT be used as closure evidence
* MUST NOT be used for progress advancement
* MUST be migrated before Stage C can be closed

---

## 8. Authority

This document is governed by:

* DOC-11 (Artifact Authority Hierarchy)
* DOC-17 (Artifact Schema Revision v2)

This document does not override stage contracts.

---

**END OF DOCUMENT**