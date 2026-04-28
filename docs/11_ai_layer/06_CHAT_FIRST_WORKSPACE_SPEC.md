# CHAT-FIRST WORKSPACE SPEC

---

## ⚠️ EXECUTION AUTHORITY CLARIFICATION (CRITICAL)

This document defines the TARGET USER EXPERIENCE (Chat-first interface).

It DOES NOT define execution order.

---

## 🔒 MANDATORY RULE

Chat-first is a UX goal ONLY.

Execution MUST follow:

1. Tool definition
2. Tool implementation
3. Tool validation
4. Tool integration
5. THEN conversation exposure

NO EXCEPTIONS.

---

## 🔺 PRECEDENCE RULE

In case of ANY conflict:

1. 07_TOOL_VS_CONVERSATION_CONTRACT.md
2. 08_CONVERSATION_EXECUTION_MODEL.md
3. 09_CONVERSATION_DEVIATION_PREVENTION_PROTOCOL.md

OVERRIDE this document.

This document is NON-AUTHORITATIVE for execution order.

---

## 🚫 FORBIDDEN INTERPRETATION

This document MUST NOT be interpreted as:

- Permission to build features inside UI
- Permission to skip tool layer
- Permission to implement logic directly in chat
- Permission to introduce conversation behavior without tool backing

---

## ✅ CORRECT INTERPRETATION

This document ONLY defines:

- Chat-style interface
- Message-based UX
- Interaction flow

It MUST be implemented strictly on top of existing tools.

---

## Forge AI Engineering Layer

---

## 1. PURPOSE

Transform Forge AI Workspace from a Tool-Based Interface
into a Chat-First Intelligent System

Where:

- Primary interaction = AI conversation
- UI = minimal interface layer
- Buttons = secondary or removed

---

## 2. CORE PRINCIPLE

User does NOT operate the system manually.

Instead:

- User writes request
- AI understands intent
- AI proposes next step
- AI asks when blocked
- AI prepares execution candidates or proposals

---

## 3. PROJECT MODEL

### Required Feature: Project Isolation

System must operate with clear Projects.

Each Project must include:

- project_id
- name
- created_at
- last_updated
- current_state
- conversation_history
- related_artifacts

---

## 4. PROJECT LIST BEHAVIOR

UI must include:

### Sidebar (Projects)

- List of projects
- Button:
  - New Project

On project selection:

- Load project state
- Load conversation history
- Resume from last checkpoint

---

## 5. CHAT BEHAVIOR

### Input

- User provides text input only

### Output

AI must:

- Respond in user's language
- Explain actions
- Ask when ambiguous
- Provide choices when needed
- Propose actions or prepare execution candidates

---

## 6. AI RESPONSIBILITY

AI controls:

- Operation type:
  - Analyze
  - Draft
  - Proposal
  - Execution Preparation

- Flow management:
  - No dependency on UI buttons
  - Fully intent-driven

---

## 7. REMOVE UI COMPLEXITY

The following are considered LEGACY:

- Analyze Project button
- Run Direct
- Generate Proposal
- Generate Draft
- Manual Approval section

They must be replaced by:

- AI-driven conversation and execution handoff flow

---

## 8. HISTORY MODEL

History must NOT be a flat list.

Instead:

- Scoped per Project
- Used as AI context
- Used for duplicate prevention

---

## 9. LANGUAGE MODE

If user writes Arabic:
→ AI responds in Arabic

If user writes English:
→ AI responds in English

---

## 10. EXECUTION MODEL

AI must:

- Propose (Proposal)
- Prepare execution candidates
- Prepare execution package inputs

AI must NOT:

- execute directly
- perform auto execution
- bypass user approval
- bypass Forge

Execution may only happen when:

- user explicitly approves
- execution package is complete
- handoff is sent to Forge

---

## 11. SYSTEM STATE

Each Project must track:

- Last executed step
- Open proposals (if any)
- Pending decisions

---

## 12. TRANSITION RULE

Current UI:

Tool-Based Dashboard

Is considered:

- Temporary Layer
- Will be fully replaced

---

## 13. NEXT IMPLEMENTATION STEP

1. Add Project Manager Layer
2. Refactor UI:
   - Chat Panel
   - Projects Sidebar
3. Bind AI to project context
4. Remove button-driven flow

---

### ⚠️ VALIDATION BEFORE ANY STEP

Before implementing ANY item above:

- Tool must exist
- Tool must be validated
- Tool must be integrated

Otherwise:

Implementation is INVALID and must STOP.

---

## Runtime Behavior Alignment

This document is governed by:

docs/12_ai_os/19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md

If any behavior here conflicts with runtime behavior rules:

- Runtime contract MUST override
- This document must be interpreted as UX-only

---

## END