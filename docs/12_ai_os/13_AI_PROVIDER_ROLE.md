## 25. Initial Provider Positioning

Providers are support mechanisms for reasoning and technical generation.

Provider use does not change the core authority model:

* Companion AI governs discussion, reasoning, and structured decision flow
* Forge governs execution
* providers such as Codex may assist with technical generation only
* no provider may bypass Forge or become an execution authority

---

## Provider Responsibilities (Explicit)

The AI provider is responsible for:

- natural language understanding
- conversation continuity
- idea generation
- proposal generation
- structured output generation
- technical candidate generation when requested

The AI provider is NOT responsible for:

- execution
- file system modification
- pipeline control
- verification authority
- decision ownership
- autonomous workflow control

All execution authority remains strictly within Forge Core.

---

## Requirement Discovery Responsibility

The AI Provider is the ONLY component allowed to:

- Interpret user intent
- Generate requirement questions
- Build requirement structures
- Evaluate completeness

The Provider MUST be used for ALL domains without exception.

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
- use it directly in runtime decisions
- rely on it for all progression checks

---

The system MUST NOT:

- modify provider output
- enrich it using local logic
- merge it with inferred data
- override completeness evaluation

---

## No Post-Processing Rule

No component in the system is allowed to:

- reinterpret provider output
- remap it into internal structures
- apply transformation logic

Provider output must be used directly.

---

Any violation of this rule is considered:

INVALID_ARCHITECTURE

---

## Prohibited Substitutions

The following are NOT allowed as replacements for the Provider:

- Keyword matching logic
- Static domain templates
- Hardcoded requirement flows
- Rule-based inference systems

---

Any such implementation is considered:

INVALID_AI_USAGE

---

## Provider Availability Rule (MANDATORY)

Requirement discovery MUST NOT proceed without AI Provider.

If the provider is:

- unavailable
- failing
- returning invalid output

The system MUST:

- BLOCK the process
- inform the user clearly
- request retry or resolution

---

The system MUST NOT:

- fall back to local logic
- generate questions manually
- attempt partial discovery
- continue with incomplete provider output

---

## Enforcement

No Provider → No Discovery  
No Discovery → No Progress  
No Progress → No Execution