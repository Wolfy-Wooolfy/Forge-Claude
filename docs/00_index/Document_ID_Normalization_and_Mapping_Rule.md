# 📄 Document ID Normalization and Mapping Rule
**Document ID:** DOC-20  
**Status:** EXECUTION-BOUND  
**Scope:** Document Identity Governance  
**Applies To:** Entire Documentation Pack  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines the canonical Document ID system.

It resolves ambiguity between:

- Legacy IDs (example: HALO-DOC-XX)
- New IDs (DOC-XX)
- Unkeyed documents (no explicit ID header)

Without this rule:
→ Cross-reference ambiguity may occur
→ Governance integrity weakens

---

## 2. Canonical ID Namespace

The canonical namespace is:

DOC-XX

Where:

- XX is a zero-padded integer
- Each ID is unique
- No reuse allowed
- No overlapping allowed

Schemas use:

SCHEMA-XX

---

## 3. Legacy ID Handling Rule

If a document contains:

HALO-DOC-XX

It is considered:

Legacy ID (non-canonical)

It remains binding if listed in DOC-19,
but must not be referenced using HALO-DOC format in new documents.

All new references MUST use:

- File path reference
- OR canonical DOC-XX mapping (if assigned)

---

## 4. Unkeyed Document Rule

If a document does not declare a Document ID:

- It is considered legacy-unkeyed
- It remains binding if listed in DOC-19
- It may not be referenced using ID-only reference
- It must be referenced using full file path

Future revisions may assign a DOC-XX ID formally.

---

## 5. Cross-Reference Rule (Hard)

All new documents MUST:

- Reference canonical DOC-XX IDs when available
- Avoid ambiguous names such as "Progress Contract"
- Avoid referencing superseded versions

Incorrect cross-referencing:
→ Governance violation

---

## 6. ID Allocation Rule

New Document IDs must:

- Increment sequentially
- Be recorded in DOC-19
- Never reuse a retired ID
- Never change once assigned

Schema IDs must:

- Increment sequentially
- Be stable across revisions

---

## 7. Backward Compatibility

This normalization rule does NOT:

- Require rewriting legacy files immediately
- Require renaming HALO-DOC IDs inside old files

It only governs forward consistency.

---

## 8. Enforcement Rule

If a document:

- Uses conflicting ID
- Reuses ID
- References non-existent ID
- Conflicts with DOC-19 registry

→ Execution MUST enter BLOCKED state.

---

**END OF DOCUMENT**
