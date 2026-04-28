# Requirement Discovery Loop Contract

## Purpose

This contract defines a universal, domain-agnostic mechanism for iterative requirement discovery.

It ensures that any user request (system, app, game, tool, etc.) is expanded into a complete, validated requirement model before any downstream step (options, decisions, execution).

---

## Core Principle

Requirement discovery is NOT a one-time step.

It is an iterative loop:

User Input
→ Analyze Domain
→ Generate Requirement Model
→ Detect Missing Requirements
→ Ask Questions
→ User Answers
→ Update Model
→ Re-check Completeness
→ Repeat until COMPLETE

---

## Definitions

### Requirement Model

A structured representation of all required components of the requested system.

It is:
- Domain-specific
- Dynamically expanded
- Continuously validated

---

### Completeness

A requirement model is considered COMPLETE only when:

- All core domains are covered
- All dependent sub-requirements are resolved
- No open ambiguity exists that affects execution

---

## Iteration Rules

1. Every user answer MUST trigger re-evaluation of the model

2. If new branches appear:
   → The system MUST ask follow-up questions

3. No transition to:
   - Options
   - Decision
   - Documentation
   - Execution

   is allowed until completeness = TRUE

---

## Domain Detection

The system MUST first classify the request:

Examples:
- Game
- HR System
- Mobile App
- Website
- Internal Tool
- AI System

This classification drives the initial requirement model.

---

## Recursive Expansion

Each requirement may open sub-requirements.

Example:

Payroll → expands into:
- taxes
- insurance
- bonuses
- deductions
- approval flow
- payslips

Each sub-node must be validated.

---

## Stop Condition

The loop stops ONLY when:

completeness = TRUE

---

## Output of This Layer

The final output MUST be:

- Structured requirement model
- Fully validated
- Ready for:
  → Option generation
  → Decision making
  → Documentation build
  → Execution handoff

---

## Enforcement

This contract is MANDATORY.

It overrides:

- Fast response generation
- Direct suggestion behavior
- Premature execution

---

## Position in System Flow

This layer sits BEFORE:

07_OPTION_DECISION_CONTRACT  
08_DOCUMENTATION_BUILD_LOOP  
09_EXECUTION_HANDOFF_TO_FORGE  

---

## Provider-Driven Discovery Rule (MANDATORY)

Requirement Discovery MUST be performed by an AI Provider (LLM).

The system MUST NOT:

- Use keyword matching
- Use rule-based parsing
- Use domain-specific hardcoded logic (e.g. HR, Game, Website)
- Infer requirements using static conditions

---

## Role Separation

AI Provider (LLM) is responsible for:

- Understanding user intent
- Detecting domain
- Building requirement model
- Identifying missing requirements
- Generating follow-up questions
- Re-evaluating completeness

---

AI OS Runtime is ONLY responsible for:

- Managing state
- Storing requirement model
- Enforcing completeness gate
- Controlling loop flow
- Blocking progression until completeness = TRUE

---

## Structured Output Requirement

The AI Provider MUST return a structured JSON response:

{
  "domain": "string",
  "requirement_model": {},
  "completeness": boolean,
  "open_questions": [],
  "reasoning_summary": "string"
}


---

## Provider Output Authority (CRITICAL)

The output of the AI Provider is the single source of truth for:

- requirement_model
- open_questions
- completeness
- domain classification

---

The system MUST:

- store provider output as-is
- use it directly without modification
- rely on it for all loop decisions

---

The system MUST NOT:

- modify provider output
- enrich it using local logic
- merge it with inferred data
- override completeness evaluation

---

## No Post-Processing Rule

No component is allowed to:

- reinterpret provider output
- transform it into alternative structures
- apply additional inference logic

Provider output MUST be used directly.

---

## Hard Prohibition

ANY implementation that includes:

- if (text.includes(...))
- keyword detection
- manual mapping between text and requirements

is STRICTLY FORBIDDEN.

This is considered a violation of AI OS architecture.

---

## Enforcement

If any non-provider-based discovery logic is detected:

→ Execution MUST be BLOCKED  
→ System enters INVALID_ARCHITECTURE state  

---

## Provider Availability Rule (MANDATORY)

Requirement Discovery MUST NOT proceed without AI Provider.

If the provider is:

- unavailable
- failing
- returning invalid output

The system MUST:

- BLOCK the discovery loop
- inform the user clearly
- request retry

---

The system MUST NOT:

- fall back to local logic
- generate questions manually
- partially infer requirements
- continue with incomplete discovery

---

## Enforcement Priority

This rule overrides:

- performance optimizations
- fallback implementations
- legacy discovery logic

---

No Provider → No Discovery  
No Discovery → No Progress  
No Progress → No Execution

---

## Summary (Updated)

Requirement Discovery is:
- Universal
- Iterative
- Provider-driven
- Strictly enforced

No Provider → No Discovery  
No Discovery → No System Progress

---

## Summary

No requirement completeness → No system progress