# TOOL vs CONVERSATION CONTRACT

## 1. Core Principle

ALL FEATURES MUST BE IMPLEMENTED AS TOOLS FIRST.

Conversation is NOT execution.
Conversation is ONLY an interface over tools.

---

## 2. Definitions

Tool:
- Deterministic executable capability
- Has clear input/output contract
- Testable independently
- Does NOT depend on UI

Conversation:
- Interface layer
- Interprets user intent
- Selects tool
- Passes inputs
- Displays outputs

---

## 3. Architecture Separation

STRICT RULE:

- Tools MUST NOT depend on:
  - UI
  - Chat
  - DOM

- Conversation MUST NOT:
  - Implement business logic
  - Execute logic directly
  - Modify system state directly

Conversation can ONLY:
- Understand
- Ask
- Clarify
- Route
- Display

---

## 4. Execution Flow Rule

Every feature MUST follow:

1. Tool implementation
2. Tool validation
3. Tool integration in workspace
4. THEN expose via conversation

No exceptions.

---

## 5. Anti-Patterns (FORBIDDEN)

- Building logic inside UI
- Mixing chat with execution logic
- Direct execution without tool abstraction
- Hidden state changes outside tool contracts
- UI-driven behavior instead of tool-driven behavior

---

## 6. Current System Mapping

The following are CONFIRMED TOOLS:

- /api/ai/analyze
- /api/ai/propose
- /api/ai/preview
- /api/ai/decision
- /api/ai/apply-execute-plan
- /api/ai/history
- /api/auth/register
- /api/auth/login

Conversation Layer:

- web/index.html
- Chat UI
- appendMessage / appendTextMessage / appendSnapshotMessage

---

## 7. Enforcement Rule

Any new feature violating this contract MUST be rejected.

No UI-first implementation allowed.
No shortcut allowed.

This document is AUTHORITATIVE.