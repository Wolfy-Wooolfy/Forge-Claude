## 10. Conversation Contract

Conversation is a governed runtime layer, not free-form assistant drift.

The conversation layer must:

* behave as a human-like companion
* adapt to the user's language
* preserve project context
* ask for clarification when needed
* summarize current understanding before progression
* avoid silent phase transitions

### 10.1 Tone and Language Rules

The system must:

* respond in the user's language
* remain simple, friendly, and clear
* avoid technical jargon unless requested
* distinguish clearly between suggestion, recommendation, and decision

### 10.2 Clarification Rule

If the user's message is too ambiguous to safely move planning forward, the system must ask a focused clarification question before progressing.

### 10.3 Decision Escalation Rule

When multiple valid high-impact paths exist, the system must stop and ask the user to choose after showing differences and recommendation.

### 10.4 State Visibility Rule

The conversation layer must always know and communicate the active runtime state before moving to another state.

### 10.5 No Silent Progression Rule

The system must not move from discussion to documentation, or from documentation to execution preparation, without explicit user confirmation.

---

## Requirement Discovery Enforcement

All user requests MUST pass through the Requirement Discovery Loop before any progression.

The system MUST:

1. Detect the domain of the request
2. Initialize a requirement model
3. Identify missing requirements
4. Ask targeted follow-up questions
5. Update the requirement model based on user responses
6. Re-evaluate completeness after each iteration

This process MUST repeat until:

completeness = TRUE

---

## Provider Enforcement

All requirement discovery MUST be fully provider-driven.

The AI Provider is the ONLY component allowed to:

- understand user intent
- detect domain
- build the requirement model
- identify missing requirements
- generate follow-up questions
- evaluate completeness

---

## Source of Truth Rule

The provider output MUST be treated as the single source of truth for:

- requirement_model
- open_questions
- completeness

The conversation layer MUST NOT:

- modify the requirement model
- generate its own requirement structure
- infer missing requirements manually
- rely on keyword-based logic
- perform any domain-specific reasoning

---

## Strict Delegation Rule

The conversation layer MUST act only as:

- a mediator between user and provider
- a presenter of provider output
- a loop controller

It MUST NOT act as:

- a reasoning engine
- a requirement builder
- a fallback logic layer

---

## Hard Prohibition

Any implementation where the system:

- interprets user input using static logic
- maps text to fields manually
- builds requirement structures without provider

is STRICTLY FORBIDDEN.

This is considered:

INVALID_ARCHITECTURE

---

## Forbidden Actions Before Completeness

The system MUST NOT:

- Generate solution options
- Suggest architectures
- Produce implementation plans
- Trigger execution flows
- Call Forge

Unless the requirement model is COMPLETE

---

## Recursive Expansion Rule

Each answer from the user may introduce new requirement branches.

The system MUST:

- Expand those branches
- Validate them
- Ask further questions if needed

---

## Completion Gate

The conversation layer MUST enforce a hard gate:

IF completeness != TRUE  
→ Stay in Requirement Discovery Loop

Only when:

completeness = TRUE

→ The system may transition to:

- Option generation
- Decision contracts
- Documentation build
- Execution handoff

---

## Priority

This rule overrides:

- Fast response behavior
- Conversational shortcuts
- Provider-generated direct answers

---

## Summary

No completeness → No progress