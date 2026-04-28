# System Overview & Operating Model
## Forge

**Status:** Authoritative – v1  
**Scope:** Personal / Non-Commercial  
**Owner:** Khaled Elmasry  
**Execution Model:** Companion-guided, Forge-executed  

---

## 1. Purpose of This System

Forge is a **governed execution system** designed to transform approved execution packages into **fully completed, verified, and traceable outcomes**.

Human interaction happens primarily through the Companion AI OS layer, while Forge remains responsible for deterministic execution, verification, and closure.

The system exists to eliminate:
- Fragmentation between ideas, documents, code, and verification
- Unstructured clarification cycles
- Execution drift caused by unclear approval boundaries
- Loss of progress visibility

### Companion vs Forge Operating Boundary

The system operates through two distinct but connected layers:

1. Companion AI OS Layer
   - user-facing conversation
   - idea development
   - business reasoning
   - documentation building
   - research and recommendation
   - execution package preparation

2. Forge Core Layer
   - deterministic execution
   - governed implementation
   - verification
   - closure and delivery readiness validation

The Companion layer must not execute directly.
Forge must not replace the companion conversation and reasoning role.

This boundary is governed behaviorally by:
`docs/12_ai_os/19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md`

Forge is **not a decision assistant**, **not a reasoning authority**, and **not a conversational agent**.

It does NOT:
- Decide what HALO should be
- Judge correctness beyond explicit contracts
- Resolve subjective or strategic questions

All “decisions” inside Forge are strictly:
- Binary
- Contract-driven
- Logged
- Escalated when non-deterministic

Any action requiring judgment, preference, or interpretation
is explicitly outside Forge authority.

Forge does not contain intrinsic reasoning capability.

All generative or analytical reasoning is delegated to external Cognitive Engines
via the Cognitive Adapter Layer.

External cognitive output is treated as untrusted candidate material
until validated and stage-bound under Forge authority.

---

### 1.1 Execution Authority Clarification

This document defines the operating model and authority boundaries of Forge.

It does NOT perform task work.
It does NOT produce artifacts.
It does NOT run stages.
It does NOT reason.
It does NOT decide.
It does NOT derive progress.
It does NOT mutate state.

Execution authority exists ONLY in the Pipeline Orchestrator,
which is a deterministic control component — NOT an agent.

The Pipeline Orchestrator:
- Executes only explicit rules from lower-level contracts
- Has no interpretive, heuristic, or adaptive authority
- Cannot invent behavior, fill gaps, or resolve ambiguity
- Must fail-closed on any undefined condition

Autonomous agents:
- Produce candidate artifacts ONLY
- Have ZERO execution authority
- Cannot advance stages, mutate state, or apply decisions

Any conflation between:
- Agent output
- Orchestrator authority
- Execution control

constitutes a critical system violation
and MUST halt execution immediately.

---

### 1.1.A Non-Operational Nature Declaration (Hard)

This document is **non-operational by design**.

It MUST NOT be used by any component, agent, or orchestrator to:
- Infer execution steps
- Decide execution order
- Select retry or rollback strategies
- Calculate progress
- Interpret failure causes
- Resolve ambiguity

Any attempt to operationalize this document,
directly or indirectly,
constitutes a **Derived Authority Violation**
and MUST result in immediate execution halt.

Operational authority exists ONLY in:
- Scope & Success Contract
- Pipeline Stages Specification
- Autonomy Policy & Human Interrupt Protocol
- Progress Tracking & Status Report Contract
- Decision Logging & Change Traceability Specification
- Artifact Schema & Repository Layout Standard
- Build & Verify Playbook
- HALO Boundary Audit Rules
- Tech Assumptions & Local Runtime Setup

---

### 1.1.B.1 Component Vocabulary (Hard)

For the purpose of this system, the following terms are canonical and non-negotiable:

- Pipeline Orchestrator  
  Deterministic control logic responsible for:
  - Sequencing pipeline stages
  - Invoking agents and tools
  - Enforcing validation gates
  - Writing governed execution state artifacts and authoritative progress reflections
  - Halting execution on undefined or invalid behavior  

  The Pipeline Orchestrator does NOT:
  - Author content
  - Produce artifacts
  - Interpret intent
  - Resolve ambiguity
  - Apply judgment or preference

- Autonomous Agents  
  Non-authoritative execution components that:
  - Produce candidate artifacts ONLY
  - Have ZERO authority to advance stages
  - Have ZERO authority to mutate execution state
  - Have ZERO authority to certify correctness or compliance

- Boundary Audit Layer  
  A mandatory, independent enforcement layer that:
  - Evaluates compliance against HALO Boundary Audit Rules
  - Produces binary PASS / FAIL outcomes only
  - Gates all stage closure and downstream advancement
  - Cannot be overridden, bypassed, or reinterpreted

Boundary Audit outcomes are absolute.
Any attempt to proceed without a required PASS
constitutes a critical execution violation.

- Cognitive Layer  
  Internal, stage-bound execution components responsible for producing candidate artifacts
  (docs/specs/code/analysis outputs) under strict contracts.

  The Cognitive Layer:
  - Has ZERO authority to advance stages
  - Has ZERO authority to mutate execution state
  - MUST NOT call external providers directly

- Cognitive Adapter Layer  
  A REQUIRED core system component that is the ONLY permitted path
  for invoking any external Cognitive Engine.

  The Cognitive Adapter Layer:
  - Normalizes requests/responses
  - Applies deterministic routing per DOC-10-CE-SEL
  - Enforces bounded retries per Doc-04
  - Persists prompts/responses/metadata as artifacts
  - Has ZERO authority to change Forge state or close stages

  Defined by:
  - docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md

- Provider Drivers  
  Provider-specific implementations used ONLY by the Cognitive Adapter Layer
  to interact with external Cognitive Engines.

  Provider Drivers:
  - Are replaceable without changing Forge Core behavior
  - MUST return normalized outputs to the adapter
  - Have ZERO execution authority

- External Cognitive Engine  
  Any external generative or analytical engine (LLM or equivalent).

  External engines:
  - Have ZERO authority
  - Cannot create valid artifacts independently
  - Cannot alter system state

---

### 1.1.C Prohibition of Conceptual Inference (Hard Rule)

This document MUST NOT be used as:
- A conceptual guide for agent behavior
- A mental model for filling execution gaps
- An interpretive lens for undefined scenarios
- A justification for inferred execution intent

Conceptual alignment does NOT grant authority.

If an execution behavior cannot be justified
by an explicit rule in a lower-level execution contract,
then referencing this document — even conceptually —
is strictly forbidden.

Any behavior derived from
“system understanding”,
“operating philosophy”,
or “model alignment”
rather than explicit contract text
constitutes a Derived Authority Violation
and MUST halt execution.

---

### 1.1.1 Prohibition of Derived Authority (Hard Rule)

No execution rule, behavior, or permission may be
**derived, inferred, or extrapolated** from this document.

This document:
- Defines intent and boundaries ONLY
- Does NOT grant executable authority
- Does NOT fill gaps in lower-level contracts

If an execution behavior is not explicitly defined in:
- Pipeline Stages Specification
- Autonomy Policy & Human Interrupt Protocol
- Progress Tracking & Status Report Contract
- Boundary Audit Rules
- Build & Verify Playbook

Then the behavior is considered **undefined** and MUST FAIL CLOSED.

This document MUST NEVER be used to:
- Resolve ambiguity
- Justify continuation
- Infer missing execution logic
- Patch incomplete stage specifications

---

## 2. Core Objective

Enable HALO development to progress **autonomously for hours or days**, producing:

- Closed execution documents
- Matching implementation artifacts (code/config)
- Basic verification evidence
- Clear progress and state reporting

While calling the human **only when strictly required**.

---

## 2.1 Definition of an Accepted Task

An accepted task within Forge MUST:

- Be executable, not exploratory
- Have a clear end-state or deliverable
- Be bounded in scope (no open-ended goals)
- Be related directly to HALO development or its supporting systems

The system MUST reject or reclassify any input that is:
- Pure brainstorming
- Philosophical discussion
- Vision-only ideation without execution intent

If task intent cannot be determined deterministically → Fail-Closed and escalate.

---

## 3. System Nature (What This Is / Is Not)

### 3.1 What This System IS

- A **pipeline**, not a chatbot
- A **task executor**, not an advisor
- A **document-driven engine**
- A **fail-closed system**
- A **single-owner system** (personal use)

### 3.2 What This System IS NOT

- Not a brainstorming assistant
- Not a multi-user platform
- Not a self-modifying intelligence
- Not an authority over HALO rules
- Not allowed to invent requirements

---

## 4. Operating Model Overview

Forge operates as a **stage-linear, state-aware execution pipeline**.

“Linear” refers strictly to **stage ordering authority**, not execution flow rigidity.

The pipeline explicitly supports ONLY the following execution control mechanisms:

- Controlled stage re-entry (owning-stage only)
- Deterministic rollback (policy-governed)
- Execution Abort (terminal, non-recoverable)
- Retry cycles (bounded, materially distinct, policy-governed)

No other execution control behavior is permitted.
Any unclassified or hybrid behavior is invalid and MUST fail closed.

No execution path may bypass,
skip,
or reorder stages,
but execution flow itself is not required to be monotonic.

Each task flows through predefined stages, where:
- Every stage has clear inputs and outputs
- Every stage must close before the next begins
- Failures are handled deterministically
- Progress is continuously tracked

The system does **not pause by default** between stages.

---

## 5. Autonomy Principle

The system follows an **Autonomy-First Rule**:

> If execution can proceed safely, deterministically, and within defined boundaries, it MUST proceed without human input.

Human involvement is treated as an **exception**, not a requirement.

---

### 5.1 Autonomy Does NOT Imply Authority

Autonomous execution within Forge does NOT grant the system
any authority to reinterpret intent, redefine success,
or alter HALO governance rules.

Autonomy applies ONLY to:
- Execution sequencing
- Artifact production
- Retry and rollback handling
- Deterministic continuation within defined contracts

The system has ZERO authority to:
- Change scope definitions
- Invent missing requirements
- Override HALO boundary rules
- Treat probabilistic output as final truth

If autonomy and authority ever conflict:
- Authority always wins
- Execution MUST stop (Fail-Closed)

---

## 6. Human Interaction Model (Binding)

Human interaction is an exception, not a workflow step.

The system MUST interrupt the human authority ONLY if:

1. More than one valid execution path exists
2. Mandatory input is missing (credentials, keys, explicit decisions)
3. A HALO boundary, scope rule, or authority rule may be violated

In all other cases:
- Execution MUST continue
- No confirmation is requested
- No progress is blocked

Human interaction does NOT perform execution work
and does NOT generate artifacts.

Its sole role is to:
- Resolve ambiguity
- Provide missing mandatory input
- Select between multiple valid options

Once ambiguity is resolved, the pipeline advances autonomously
without further human involvement.

Human input unblocks execution,
but never replaces or performs pipeline stages.

---

### 6.1 Prohibition of Human Framing Authority (Hard Rule)

This document MUST NOT be used to:
- Frame questions to the human
- Structure interrupt messages
- Justify escalation wording
- Influence how options are presented

All human interaction formatting,
interrupt structure,
question minimality,
and option presentation
are governed EXCLUSIVELY by:

- Autonomy Policy & Human Interrupt Protocol
- Progress Tracking & Status Report Contract

Any human-facing message
that derives structure, tone, or framing
from this document
constitutes a Derived Authority Violation
and MUST halt execution.

---

## 7. Progress Visibility Contract

This document does NOT define progress semantics,
progress calculation,
or progress authority.

It only declares the system obligation
to make progress observable.

All progress definition, calculation,
state derivation, and reporting
are governed EXCLUSIVELY by:

- Progress Tracking & Status Report Contract (v1)

This document MUST NOT be used to:
- Interpret progress meaning
- Define completion thresholds
- Infer execution state
- Supplement progress rules

If any ambiguity exists regarding progress:
- The Progress Tracking Contract is authoritative
- This document yields immediately

---

## 8. Time & Execution Expectations

- Execution may span minutes, hours, or days
- No artificial waiting for confirmation
- No idle pauses between stages
- Retries are handled internally (up to policy limits)

---

## 9. Authority & Boundaries

Forge operates under strict authority limits:

- HALO documentation is authoritative
- Existing HALO rules are immutable unless explicitly updated by the owner
- The system may propose changes but never apply them silently
- All outputs are traceable to inputs

---

## 10. Failure Philosophy

The system follows a **Fail-Closed** philosophy:

- If unsure → stop and escalate
- If unsafe → stop and escalate
- If ambiguous → stop and ask
- If deterministic → execute

Silent failure is forbidden.

Silent continuation is equally forbidden.

If execution proceeds without producing:
- A new artifact
- A state transition
- A logged retry or rollback

within a bounded execution window,
the system MUST treat this as a Progress Stall condition.

A Progress Stall:
- MUST trigger a mandatory status emission
- MUST be handled EXCLUSIVELY by:
  - Autonomy Policy & Human Interrupt Protocol
  - Progress Tracking & Status Report Contract (v1)

This document MUST NOT:
- Define stall time limits
- Convert stall into Execution Abort by itself
- Define recovery, retry, rollback, or escalation mechanics

Any transition to Execution Abort,
and any post-stall enforcement behavior,
MUST be justified ONLY by the lower-level execution contracts.

---

## 10.1 Mandatory Boundary Audit Coupling

All execution within Forge is **strictly coupled** to the HALO Boundary Audit Rules.

This means:

- No stage may be marked CLOSED without a Boundary Audit PASS
- No artifact may advance to a downstream stage without an audit PASS
- Retry and rollback actions MUST invoke Boundary Audit as defined by their governing contracts
- Execution Abort MUST record the audit state at the point of termination

Boundary Audit is not a supporting mechanism.
It is a **hard execution gate** whose exact invocation points,
scope, and outcomes
are defined EXCLUSIVELY in the HALO Boundary Audit Rules.

This document MUST NOT:
- Expand audit scope
- Infer audit timing
- Redefine audit triggers
- Override audit definitions specified elsewhere

Any execution behavior that bypasses
a required Boundary Audit invocation
as defined in the authoritative Boundary Audit Rules
is non-compliant and invalid.

---

### 10.2 Execution Abort Authority Lock (Hard Rule)

Upon an Execution Abort:

- The Pipeline Orchestrator loses all autonomous execution authority
- No retry, rollback, re-entry, or continuation logic may be invoked
- No new execution path may be initiated
- No partial or conditional execution is permitted

The orchestrator enters a terminal passive state.

The ONLY permitted actions after an Execution Abort are:

- Preserve all artifacts and state (no deletion, no overwrite)
- Write the authoritative final execution state into governed runtime authority artifacts
- Mirror the resulting human-visible final status into `progress/status.json`
  in strict compliance with the Progress Tracking & Status Report Contract (v1)
- Produce any mandatory abort/audit artifacts ONLY if explicitly required
  by an authoritative contract (e.g., audit failure artifacts), with no narrative text

No human-facing narrative notification is permitted.
All human visibility MUST occur through the governed reflection layer,
with `progress/status.json` serving as the human-visible status surface only.

Any autonomous action taken after Execution Abort
constitutes an authority violation
and MUST be treated as a critical system fault.

---

## 11. Relationship to HALO

Forge is a **pure execution layer** that operates in service of HALO.

It is NOT part of:
- HALO’s cognitive runtime
- HALO’s identity system
- HALO’s memory or vault architecture
- HALO’s reasoning or intelligence logic

Forge does not contain intrinsic reasoning capability or reasoning authority.
It governs intelligence through contracts; it does not own it.

It executes tasks **about HALO**, not **inside HALO**.

Any attempt to:
- Embed Forge into HALO cognition
- Treat Forge output as HALO truth
- Allow Forge to influence HALO identity or memory

is a system violation.

---

## 12. End State Definition

This system is considered successful when:

- HALO tasks can be issued as high-level intents
- Execution proceeds end-to-end autonomously
- Human attention is required only at true decision points
- Progress is always visible and auditable
- No execution context is lost between stages

---

## 13. Interpretive Authority

This document defines the authoritative interpretation of:

- What Forge is
- How it operates
- When human involvement is allowed

If any future document, agent behavior, or implementation
conflicts with this operating model:

- The implementation MUST change
- This document does NOT yield silently

This document provides ZERO fallback authority.

If a behavior, rule, or execution path
is not explicitly defined
in a lower-level execution contract:

- This document MUST NOT be consulted
- This document MUST NOT be referenced
- This document MUST NOT be interpreted

Absence of definition
is treated as prohibition,
not permission.

---

## 13.1 Non-Executable Nature of This Document (Hard Rule)

This document is **descriptive**, not executable.

It MUST NOT be used as:
- An execution recipe
- A source of derived rules
- A fallback when other contracts are missing

If a behavior is not explicitly defined in:
- Pipeline Stages Specification
- Autonomy Policy
- Boundary Audit Rules
- Build & Verify Playbook

Then this document MUST NOT be used
to justify or infer that behavior.

Execution authority NEVER originates here.

---

### 13.2 Uncertainty Is Conflict (Hard Rule)

If the system is unable to deterministically conclude
whether a conflict exists between documents or behaviors:

- The situation MUST be treated as a conflict
- Execution MUST halt
- No continuation is permitted
- Human escalation is REQUIRED

Assumed compatibility,
probable alignment,
or inferred intent
are NOT valid bases for continuation.

Uncertainty itself is a blocking condition.

---

### 13.3 Silence Does Not Imply Compliance (Hard Rule)

The absence of errors, warnings, or interruptions
MUST NOT be interpreted as compliance.

Compliance exists ONLY when:
- Artifacts are explicitly produced
- Validation gates are passed
- Boundary audits return PASS

Silent execution without observable progress
or artifact closure
is considered a fault condition
and MUST trigger status emission or halt.

---

## 14. Authority Conflict Resolution (Hard Rule)

In the event of any conflict between governing documents of the
Forge, authority is resolved strictly
in the following order:

1. HALO Core Rules & Boundary Contracts  
2. Scope & Success Contract  
3. Autonomy Policy & Human Interrupt Protocol  
4. Pipeline Stages Specification  
5. HALO Boundary Audit Rules (Fail-Closed Pack)  
6. Progress Tracking & Status Report Contract (v1)  
7. Build & Verify Playbook (Local)  
8. Decision Logging & Change Traceability Specification  
9. Artifact Schema & Repository Layout Standard  
10. Tech Assumptions & Local Runtime Setup  
11. Stage-level or task-specific artifacts  
12. Code  
13. Runtime behavior  
14. Agent output or reasoning  

If a lower-authority layer conflicts with a higher one:

- Execution MUST halt immediately
- The conflict MUST be logged
- Human escalation is REQUIRED

No document may reinterpret or override a higher-authority contract.
Silently adapting behavior is forbidden.

---

## System Entry & Execution Boundary (Hard)

All execution within HALO MUST originate from the approved Pipeline.

No component, engine, module, or subsystem
is permitted to execute independently,
be invoked directly,
or operate outside a resolved Pipeline stage.

Direct execution, ad-hoc invocation,
or bypassing stage gates
constitutes a system boundary violation
and MUST trigger immediate execution halt.

System components are execution units,
not entry points.

---

## Workspace & Project Isolation Model (Hard)

Forge operates in Personal Local Mode by default.

However, architectural isolation MUST exist at the project boundary level.

### 1. Workspace Concept (Architectural Layer)

A Workspace represents:

- A logical ownership boundary
- A container for one or more projects
- An isolation boundary for execution state

In v1 (Personal Mode):

- Only one workspace MAY exist.
- The workspace MAY be implicit.
- Multi-workspace runtime switching is OUT-OF-SCOPE.

However:

The Core MUST be designed as if workspace separation exists,
even if only one workspace is active.

### 2. Project Isolation (Mandatory)

Each project MUST:

- Have isolated artifacts
- Have isolated execution state
- Have isolated decision logs
- Have deterministic state transitions independent of other projects

No cross-project mutation is permitted.

If execution of one project can mutate another project's state:

- Runtime readiness MUST FAIL.

### 3. Isolation Guarantee (Hard)

Isolation MUST exist at:

- Artifact level
- State level
- Decision level
- Execution level

No global mutable state is permitted inside Forge Core.

If any execution logic relies on implicit global state:

- Runtime readiness MUST FAIL.
- Execution MUST NOT start.

---

## Cognitive Provider Independence Contract (Hard)

Forge Core MUST remain provider-agnostic.

### 1. Provider Abstraction Rule

All cognitive execution MUST occur exclusively through:

- The Cognitive Adapter Layer
- Provider Drivers implementing the Provider Driver Interface Contract

No direct provider calls are permitted inside:

- Core logic
- Stage engines
- Orchestrator
- Verification layer

If any component calls a provider SDK directly:

- Runtime readiness MUST FAIL.
- Execution MUST NOT start.

### 2. Replaceability Guarantee

It MUST be possible to:

- Replace OpenAI with another provider
- Replace Gemini with another provider
- Add a new provider driver

Without modifying:

- Stage governance logic
- Artifact schema
- Execution state machine

If provider replacement requires Core modification:

- The architecture is considered defective.

### 3. Deterministic Boundary Rule

Provider output:

- Has ZERO authority
- Is treated as candidate material
- Becomes authoritative ONLY when:
  - Bound to an artifact
  - Validated by stage rules
  - Persisted deterministically

Provider output MUST NOT:

- Mutate state directly
- Trigger stage transitions
- Bypass validation logic

### 4. Lock-In Prohibition

No document, contract, or implementation MAY:

- Require a specific provider permanently
- Assume provider-specific capabilities
- Embed provider-specific assumptions in artifact schemas

Forge MUST remain portable across cognitive providers.

---

## Operating Interfaces (Non-Authoritative Shells)

Forge Core MUST be operable through multiple shells.

Shells provide usability only and have ZERO execution authority.

### 1) CLI Shell (v1 Default)

- Primary interface for local execution
- Supports single-command start
- Supports status query (lossless rendering of status.json)
- Supports BLOCKED interaction via authorized control path

### 2) Local Dashboard Shell (v2 Candidate)

- Optional UI for monitoring
- Read-only by default
- May expose:
  - live status
  - artifact index
  - decision queue
- Must not mutate state directly

### 3) Remote Control Shell (Future)

- Optional API layer for product hosting
- Must enforce:
  - authenticated control artifacts
  - rate limiting
  - audit trails
- Must not bypass Core governance

### Shell Replacement Guarantee (Hard)

Adding or replacing a shell MUST NOT require any change to:

- stage logic
- artifact rules
- authority contracts
- execution determinism

---

## AI Operating System Layer (Above Forge Core)

A new layer called "AI Operating System Layer" is introduced above Forge Core.

### Purpose

This layer enables:
- natural language interaction with users
- idea discussion and refinement
- project planning and structuring
- documentation creation and iteration
- decision management and escalation

### Position in Architecture

The system is now composed of:

1. Human Interaction Layer (UI / Chat Interface)
2. AI Operating System Layer (Planning + Reasoning)
3. Forge Core (Execution + Verification)

### Responsibilities

The AI Operating System Layer is responsible for:
- understanding user intent
- managing conversation flow
- generating proposals and plans
- structuring documentation
- preparing execution-ready tasks

### AI Provider

This layer is powered by an external AI provider (e.g. OpenAI API).

The AI provider handles:
- natural language understanding
- reasoning and analysis
- proposal generation

### Strict Separation of Responsibility

The AI layer may:
- analyze
- propose
- plan
- structure

The AI layer may NOT:
- execute
- modify code directly
- bypass Forge pipeline

### Execution Authority

All execution authority remains strictly within Forge Core.

All execution must pass through:
- pipeline_definition
- decision gates
- artifact generation
- verification steps

### Design Principle

AI = Thinking System  
Forge = Execution System

They must remain strictly separated.

---

**End of Document**