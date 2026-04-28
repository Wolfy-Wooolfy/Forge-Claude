# Provider Driver Interface Contract

**Document ID:** DOC-01-DRIVER  
**Status:** EXECUTION-BOUND  
**Scope:** Defines the mandatory interface and behavioral contract for all Cognitive Provider Drivers  
**Applies To:** Cognitive Adapter Layer + Any Provider Driver Implementation  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines the REQUIRED interface
between the Cognitive Adapter Layer
and any Provider Driver.

No provider-specific implementation may exist
outside this contract.

If a driver violates this interface:
→ Execution MUST Fail-Closed.

---

## 2. Architectural Position

Forge Core
→ Cognitive Layer
→ Cognitive Adapter Layer
→ Provider Driver (this contract)
→ External Cognitive Engine

Provider Drivers:
- Have ZERO authority
- Cannot mutate Forge state
- Cannot write execution artifacts directly
- Cannot bypass adapter logic

---

## 3. Required Driver Interface (Hard)

Every Provider Driver MUST expose exactly one execution method:

execute(request: NormalizedCognitiveRequest): NormalizedCognitiveResponse


No alternative entry points are permitted.

---

## 4. Normalized Request Shape (Hard)

The driver MUST receive a normalized request object with:

- provider_id
- model_id
- task_category
- prompt
- constraints (optional)
- timeout_ms
- attempt_number

The driver MUST NOT:
- Re-route
- Override model_id
- Modify task_category
- Infer new fields

---

## 5. Normalized Response Shape (Hard)

The driver MUST return exactly:

```json

{
output: string,
raw_provider_response: object,
token_usage: {
input_tokens: number,
output_tokens: number
} | null,
provider_latency_ms: number
}

```

Rules:

- output MUST be string (even if empty)
- raw_provider_response MUST be preserved as-is
- provider_latency_ms MUST be numeric
- No additional top-level fields are permitted beyond the fields listed in the normalized shape above

If provider returns malformed structure:
→ Driver MUST classify as MALFORMED_OUTPUT
→ Adapter handles failure classification

---

## 6. Prohibited Driver Behavior (Hard)

Drivers MUST NOT:

- Persist artifacts directly
- Write to governed runtime authority artifacts
- Write to `progress/status.json`
- Perform retries internally
- Swallow errors silently
- Convert provider errors into success
- Interpret schema validity
- Change execution flow

Drivers perform IO ONLY.

All:
- Retry logic
- Schema validation
- Artifact persistence
- Failure classification escalation

are adapter responsibilities.

---

## 7. Error Propagation Rules (Hard)

If provider returns error:

Driver MUST return:

```json
{
output: "",
raw_provider_response: <error_payload>,
token_usage: null,
provider_latency_ms: <number>,
error_classification: <one of predefined failure categories>
}
```

The driver MUST NOT throw unclassified errors.

All errors MUST be classified.

Allowed error_classification values:
- PROVIDER_UNREACHABLE
- AUTH_FAILURE
- TIMEOUT
- EMPTY_OUTPUT
- MALFORMED_OUTPUT
- SCHEMA_INVALID_OUTPUT
- RATE_LIMIT
- UNKNOWN_PROVIDER_ERROR

---

## 8. Replaceability Requirement

A provider driver MUST be fully replaceable
without any modification to:

- Forge Core
- Cognitive Layer
- Routing Policy
- Stage Contracts

If replacing a driver requires changes outside the driver directory:
→ Architectural violation.

---

## 9. Acceptance Criteria

This contract is satisfied when:

- All provider drivers conform to one normalized interface.
- Adapter logic remains provider-agnostic.
- No driver writes artifacts or mutates state.
- Swapping providers does not affect Forge Core behavior.
- Failures are deterministic and classified.

---

## Supported AI Providers (Execution Drivers)

The system must support multiple AI providers through a unified driver interface.

### Primary Provider: OpenAI

- Role: Core reasoning and generation engine
- Usage:
  - natural language understanding
  - idea discussion
  - document generation
  - structured outputs (JSON / plans)
- Integration:
  - via official API
  - authenticated using API keys
- Model examples:
  - GPT-based models (chat + reasoning)

### Secondary Provider: Codex (Local / CLI)

- Role: Code generation and patch creation engine
- Usage:
  - generating code diffs
  - applying structured modifications
  - handling file-level operations
- Integration:
  - local CLI execution
  - invoked via system command (e.g., codex.cmd)
- Output:
  - structured patch JSON
  - file operations (insert / replace / modify)

### Provider Selection Strategy

The system must dynamically select the provider based on task type:

| Task Type | Provider |
|----------|--------|
| Conversation / Idea Discussion | OpenAI |
| Documentation Generation | OpenAI |
| Decision Explanation | OpenAI |
| Code Modification | Codex |
| File Operations | Codex |

### Provider Abstraction Rule

All providers must be accessed through a unified interface.

The system MUST NOT:
- call providers directly from UI
- embed provider-specific logic in business flow

Instead:
- use provider drivers
- route requests through Cognitive Layer

### Future Expansion

The system must allow adding providers such as:

- Google AI (Gemini)
- Local LLMs
- Specialized AI engines

Without changing core system logic.

---

**END OF DOCUMENT**