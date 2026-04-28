# Cognitive Adapter Layer — Architecture Contract

**Document ID:** DOC-01-ADAPTER  
**Status:** EXECUTION-BOUND  
**Scope:** Defines the Cognitive Adapter Layer as a core system component and its mandatory boundaries  
**Applies To:** Forge Runtime + Cognitive Layer + Any External Cognitive Engine  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines the Cognitive Adapter Layer as a REQUIRED core component of Forge.

The Cognitive Adapter Layer exists to:
- Provide a deterministic interface between Forge and any external Cognitive Engine (LLM or equivalent).
- Prevent provider/model lock-in.
- Enforce fail-closed behavior on cognitive calls.
- Make all cognitive interactions auditable and reproducible through artifacts.

This document is execution-bound.
If any requirement is missing, ambiguous, or violated:
→ Execution MUST Fail-Closed.

---

## 2. Definitions

### 2.1 Cognitive Layer (Internal)

The Cognitive Layer is the set of:
- task handlers
- analyzers
- validators
- gap detectors
- trace generators

It is governed by Forge stage authority and contracts.
It does NOT directly call external providers.

### 2.2 Cognitive Engine (External)

A Cognitive Engine is any external system capable of generating or analyzing content
(e.g., LLM provider/model).

The external engine has:
- ZERO authority
- NO direct access to Forge state
- NO ability to create authoritative artifacts independently

External engine integration is governed by:
DOC-CE-01 — Cognitive Engine Interface Contract.

### 2.3 Cognitive Adapter Layer (This Document)

The Cognitive Adapter Layer is the ONLY permitted path
for making cognitive calls to external engines.

It provides:
- a normalized request/response shape
- deterministic routing (as configured)
- strict failure handling
- mandatory persistence of prompts/responses/metadata as artifacts

---

## 3. Architectural Position (Hard)

Forge architecture MUST treat the adapter as:

Forge Core (Governance + Orchestrator)
→ Cognitive Layer (Tasks)
→ Cognitive Adapter Layer (Normalization + IO + Persistence)
→ Provider Driver (Provider-specific implementation)
→ External Cognitive Engine (LLM / model)

Direct calls from tasks to providers are forbidden.

---

## 4. Mandatory Responsibilities of the Adapter (Hard)

The adapter MUST:

1) Normalize Requests
- Convert task intent into a normalized request object.

2) Route Deterministically
- Select provider/model_id ONLY according to:
  DOC-10-CE-SEL — Cognitive Engine Selection & Routing Policy.

3) Execute Provider IO
- Call a provider driver.
- Enforce timeouts and bounded retries (Doc-04).

4) Persist Cognitive Artifacts
For every cognitive call, it MUST persist:
- request payload
- response payload (raw)
- metadata (provider/model_id, timestamps, attempt count, status)
under deterministic paths (see Section 6).

5) Validate Output Shape
- If a task requires schema-bound output, the adapter MUST enforce schema validation
  OR return a deterministic failure classification.

---

## 5. Prohibited Behavior (Hard)

The adapter MUST NOT:

- Infer routing rules dynamically.
- Benchmark models at runtime.
- Auto-switch providers in AUTO mode.
- Modify Forge documentation or contracts.
- Treat model output as authoritative truth.
- Write to governed runtime authority artifacts or to `progress/status.json` directly.
- Create or close stage artifacts.

The adapter is IO + normalization + persistence ONLY.

---

## 6. Mandatory Artifact Outputs (Hard)

All cognitive interactions MUST be persisted under:

`artifacts/llm/`

Minimum required structure:

- `artifacts/llm/metadata/<task_id>.json`
- `artifacts/llm/requests/<task_id>.<attempt>.json`
- `artifacts/llm/responses/<task_id>.<attempt>.json`

Rules:
- Filenames MUST be deterministic.
- No overwrite is permitted for attempts.
- metadata MUST reference the exact request/response files emitted.
- If the adapter cannot write these artifacts:
  → execution MUST Fail-Closed.

This document does not define the complete schema of these files.
If a schema contract exists, it remains authoritative.

---

## 7. Failure Classification (Hard)

Adapter MUST classify any failure into one of these deterministic categories:

- PROVIDER_UNREACHABLE
- AUTH_FAILURE
- TIMEOUT
- EMPTY_OUTPUT
- MALFORMED_OUTPUT
- SCHEMA_INVALID_OUTPUT
- RATE_LIMIT
- UNKNOWN_PROVIDER_ERROR

Rules:
- Classification MUST be recorded in metadata.
- Retry behavior MUST follow Doc-04 bounded retry rules.
- If retry budget is exhausted:
  → execution MUST Abort (not a Decision).

---

## 8. Offline & Network Assumptions (Hard)

Forge may be offline-capable for some tasks.

Rules:
- If a task requires cognitive generation and no offline alternative exists:
  - missing engine configuration MUST cause BLOCKED (if during active task)
  - or readiness FAIL (if required at PRE-START by configured mode)

Adapter MUST NOT “pretend success” offline.

---

## 9. Security & Data Handling (Hard)

The adapter MUST:
- treat prompts/responses as sensitive execution artifacts
- never log secrets
- never embed secrets in artifacts
- rely on environment variables for provider credentials (if applicable)

If secrets are detected in persisted artifacts:
→ critical violation → execution MUST halt.

---

## 10. Acceptance Criteria (Binding)

This document is satisfied only when:

- All cognitive calls are made ONLY via the adapter.
- Routing strictly follows DOC-10-CE-SEL.
- Prompts/responses/metadata are persisted deterministically.
- Failures are classified deterministically and handled fail-closed.
- No external engine output is treated as authoritative without stage validation.

---

**END OF DOCUMENT**