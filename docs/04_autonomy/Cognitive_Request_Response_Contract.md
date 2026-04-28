# Cognitive Request / Response Contract

## Purpose

Define a deterministic, provider-agnostic contract for all cognitive operations inside Forge.

This contract ensures:
- No provider lock-in
- Full traceability
- Strict separation between cognitive generation and execution authority

---

## Core Principles

1. Cognitive output is NEVER authoritative
2. All outputs are considered "candidates" until validated and bound to artifacts
3. Provider-specific formats are strictly prohibited inside pipeline logic
4. All cognitive operations must pass through the adapter layer

---

## Cognitive Request Schema

{
  "request_id": "string",
  "timestamp": "ISO8601",
  "task_context": {
    "task_id": "string",
    "module": "string"
  },
  "input": {
    "type": "structured | text | hybrid",
    "content": "string or object"
  },
  "constraints": {
    "deterministic": true,
    "max_tokens": "number",
    "temperature": 0
  }
}

---

## Cognitive Response Schema

{
  "response_id": "string",
  "request_id": "string",
  "provider_metadata": {
    "provider": "string",
    "model": "string",
    "latency_ms": "number"
  },
  "output": {
    "type": "structured | text",
    "content": "string or object"
  },
  "usage": {
    "prompt_tokens": "number",
    "completion_tokens": "number"
  },
  "status": "SUCCESS | FAILED"
}

---

## Mandatory Storage

All responses must be stored under:

artifacts/cognitive/

With:
- raw_response.json
- normalized_response.json

---

## Authority Rule

Cognitive outputs:
- CANNOT modify code
- CANNOT trigger execution
- CANNOT bypass pipeline stages

They are ONLY:
→ Inputs to decision-making modules (TRACE / GAP / DECISION)

---

## Adapter Responsibility

The adapter layer MUST:
- Normalize all provider responses into this schema
- Strip provider-specific fields
- Enforce deterministic constraints
- Log full trace

---

## Violation Handling

Any direct provider call outside adapter:
→ HARD FAIL

Any non-normalized response:
→ HARD FAIL