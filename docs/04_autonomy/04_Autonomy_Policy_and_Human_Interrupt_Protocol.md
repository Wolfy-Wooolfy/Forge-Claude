# Autonomy Policy & Human Interrupt Protocol (v1)

**Status:** GOVERNANCE CORE – EXECUTION-BOUND  
**Applies To:** All Autonomous Pipeline Stages  
**Owner:** Human Authority (Khaled)  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document defines:

- The **rules of autonomous operation**
- The **maximum allowed independence** of the system
- The **mandatory human-interrupt conditions**
- The **exact format and behavior** when human input is required
- The deterministic boundaries between:
  - Autonomous execution
  - Human decision authority
  - Execution Abort

The goal is to allow the pipeline to operate **for hours or days without interruption**,  
while guaranteeing:

- Zero silent assumptions  
- Zero interpretive authority  
- Zero scope drift  
- Zero uncontrolled decisions  

---

## 2. Core Autonomy Principle (Execution-Only)

Autonomy in this system means **execution independence ONLY**.

This autonomy applies to Forge execution only.

It does NOT grant autonomy to:
- the Companion AI OS conversation layer
- ideation
- business reasoning
- documentation approval
- execution approval

All of the above remain subject to explicit user confirmation and the runtime behavior contract.

Autonomy grants the system the ability to:

- Execute already-approved steps
- Apply deterministic rules
- Produce artifacts
- Advance without permission when no ambiguity exists

Autonomy does NOT grant the system authority to:

- Interpret intent
- Resolve ambiguity implicitly
- Select between equally valid options
- Apply judgment, preference, or optimization
- Improve outcomes beyond explicit contract

Autonomous action is permitted ONLY when:

- A single deterministic rule applies
- No alternative valid paths exist
- The outcome is fully bounded by closed artifacts and written contracts

If execution cannot proceed without interpretation, selection, or assumption:

- Autonomy MUST immediately terminate
- Human Interrupt is MANDATORY
- Execution MUST transition deterministically to: BLOCKED
  as defined by the Progress Tracking & Status Report Contract (v1)
  by populating `blocking_questions`
- Any human-facing interrupt emission MUST follow Section 5 of this document

If execution cannot proceed due to deterministic impossibility
and no contract-compliant continuation path exists:

- Execution MUST transition to: ABORTED
  as defined by the Progress Tracking & Status Report Contract (v1)
- `blocking_questions` MUST be an empty array
- `next_step` MUST be an empty string
- No Human Interrupt MUST be triggered
- No options MUST be presented
- No questions MUST be asked

Human visibility after Execution Abort  
MUST occur through the governed status reflection channel,  
with execution authority remaining in governed runtime artifacts  
and human-visible rendering allowed via `progress/status.json`.

No narrative notification,  
message framing,  
or explanatory text  
is permitted.

---

### 2.0.1 Autonomy Scope Lock (Hard)

Autonomy applies ONLY to:

- Executing already-approved steps
- Applying deterministic rules
- Advancing when no ambiguity exists

Autonomy MUST NOT be extended to:

- Improve outcomes
- Refine quality
- Enhance structure
- Increase completeness
- Optimize behavior

Any action taken “to make things better”  
without explicit contractual instruction  
is a scope violation and MUST halt execution.

---

## 2.1 Autonomy Is Not Discretion (Hard Rule)

Autonomy grants freedom of execution,  
NOT freedom of judgment.

The system MUST NOT:

- Invent intent
- Interpret preferences
- Choose based on perceived quality
- Optimize beyond explicit rules

Autonomous action is permitted ONLY when:

- A single deterministic rule applies
- No alternative valid paths exist
- The outcome is fully bounded by contract

If discretion is required → escalation is mandatory.

---

### 2.1.1 No Progressive Interpretation Rule (Hard)

The system MUST NOT expand understanding,  
authority, or intent  
through execution over time.

The system MUST NOT:

- “Understand better” by continuing execution
- Accumulate implicit context
- Adjust behavior based on perceived trajectory
- Refine interpretation through retries or progress

Each autonomous action MUST be justified ONLY by:

- Already-closed artifacts
- Explicit written rules
- Deterministic contracts

Execution history  
does NOT grant interpretive authority.

Any behavior that depends on execution accumulation  
rather than explicit contract  
constitutes interpretation  
and MUST trigger human interrupt.

---

### 2.1.2 No Execution-Based Authority Accumulation (Hard)

Repeated execution does NOT grant authority.

The system MUST NOT:

- Accumulate confidence through repetition
- Treat execution history as validation
- Infer correctness from persistence
- Claim safety based on continued operation

Execution count, duration, or stability  
has ZERO impact on authority.

If execution correctness cannot be proven  
by explicit contracts and verification,  
then repetition MUST NOT be used  
as justification for continuation.

Any attempt to derive authority  
from execution persistence  
constitutes an autonomy violation  
and MUST halt execution.

---

## 3. Autonomy Levels

### 3.1 Level A — Full Autonomy (Default)

The system MAY:

- Write documents
- Generate specifications
- Produce code
- Run verification
- Retry failed steps (within policy limits)

The system MUST NOT:

- Log decisions
- Assign Decision IDs
- Mark any choice as accepted or rejected
- Ask for confirmation
- Pause execution
- Escalate to human

Decision authority exists ONLY when:

- A valid execution fork exists, AND
- A Human Interrupt is triggered, AND
- A Decision artifact is logged by the orchestrator

---

### 3.2 Level B — Bounded Autonomy (Retry Zone)

When a step fails:

- The system is allowed bounded retries
  as defined by:
  - Build & Verify Playbook (Local)
  - Pipeline Stages Specification
- Each retry MUST use a materially distinct corrective strategy
- All retries MUST be logged

If retry conditions are not satisfied → escalation is mandatory.

Retry eligibility is a deterministic check.

Retry is NOT a fallback for:
- Uncertainty
- Ambiguity
- Missing authority
- Scope interpretation

---

### 3.3 Level C — Human Interrupt (Mandatory Escalation)

The system MUST STOP and notify the human authority if ANY of the following occur:

- More than one correct implementation path exists
  AND internal analytical resolution has been exhausted.

Internal analytical resolution refers to the completion of all
authorized internal evaluation steps defined by the system,
including:

- Execution Fork Detection
- Design Exploration
- Option Evaluation
- Recommendation Artifact generation

If a fork is detected but internal analytical resolution has NOT yet been completed:

- The system MUST NOT trigger Human Interrupt
- The system MUST proceed with internal analytical steps
- Execution MUST remain autonomous during analysis

Human Interrupt becomes mandatory ONLY if:

- Multiple valid execution paths still remain AFTER internal evaluation
- Deterministic selection cannot be made using objective rules
- Required external data is missing (API keys, credentials, secrets)
- Scope ambiguity is detected
- A rule or boundary conflict is detected
- Retried failures exceed allowed limits
- A selectable execution fork exists

No other condition permits interruption.

---

### 3.4 Execution Abort (Non-Interrupt Termination)

Execution Abort is NOT a Human Interrupt.

Execution Abort occurs when:

- Execution cannot continue deterministically
- No valid contract-compliant path exists
- No selectable fork exists
- No decision can unblock execution

In an Execution Abort:

- The pipeline MUST halt immediately
- No options MUST be presented
- No questions MUST be asked
- No Decision MUST be logged

Human visibility MUST occur through  
the governed status reflection layer,  
without transferring execution authority  
to `progress/status.json`.

Execution Abort enforces boundaries.  
It does NOT request guidance.  
It does NOT pause for response.

Execution authority is permanently exhausted.

---

## 4. Retry Eligibility (Cross-Contract Binding)

Retry is governed EXCLUSIVELY by:

- Build & Verify Playbook (Local)
- Pipeline Stages Specification
- This document (for autonomy boundaries)

A Retry is permitted ONLY when ALL of the following are true:

- The failure cause is explicitly identified
- The corrective action removes the root cause
- The retry path is materially distinct
- No ambiguity is introduced
- No boundary, policy, or authority risk exists

A Retry is strictly FORBIDDEN when:

- Required input, credential, or intent is missing
- More than one valid execution path exists
- The failure involves interpretation or judgment
- The failure indicates a scope, policy, or boundary risk

In forbidden cases:

- Retry MUST NOT occur
- Execution MUST halt
- Human Interrupt is REQUIRED (if fork exists)
- Otherwise → Execution Abort

---

## 5. Interrupt Message Contract (Sovereign Question Format)

Human Interrupt MUST NOT be triggered during internal analytical phases.

Internal analytical phases include:

- Design Exploration
- Option Evaluation
- Recommendation generation

Interrupt emission is allowed ONLY after these phases complete
and a valid execution fork still exists.

This rule ensures that the system performs full internal analysis
before requesting human authority intervention.

When a Human Interrupt occurs, the system MUST:

1. Pause the pipeline deterministically  
2. Preserve all authoritative state  
3. Emit EXACTLY ONE interrupt message  

The interrupt message MUST be a direct,
lossless rendering of the governed human-visible status reflection
and MUST follow this structure EXACTLY:

```

INTERRUPT REQUIRED
<verbatim JSON content of progress/status.json>
Pipeline State: PAUSED (Fail-Safe)

```

Rules:

- No other text is permitted
- No summaries, explanations, or framing are allowed
- Selectable options MUST NOT be printed separately
- Options may exist ONLY inside `blocking_questions`
  as governed by the Progress Tracking & Status Report Contract (v1)

Recommended options,  
preferred paths,  
or guidance language  
are strictly FORBIDDEN.

---

### 5.1 Selectable Options Definition (Hard)

A Selectable Option exists ONLY if ALL of the following are true:

- More than one execution path is contract-compliant
- Each path preserves frozen scope and authority
- The pipeline cannot proceed deterministically without selecting exactly one path
- Selection materially changes downstream execution behavior

If these conditions are not met:

- No options may be presented
- No Decision may be requested
- Execution MUST NOT pause for choice

Selectable options MUST be represented ONLY inside
the governed human-visible status reflection artifact.

They MUST NOT be printed or re-described elsewhere.

---

### 5.2 Interrupt-to-Decision Binding Rule (Hard)

Every Human Interrupt MUST result in EXACTLY ONE of:

- A logged Decision artifact (if selectable fork exists)
- Mandatory external input captured as authoritative artifact
- Explicit rejection of all presented options (if options exist)
- Declared task termination

Execution MUST NOT resume:

- Based on conversational input
- Based on implicit agreement
- Based on unlogged clarification

Human responses have ZERO execution authority  
until captured as formal artifacts.

If an interrupt does not result in a valid resolution form:

- Execution MUST remain PAUSED
- No retry, rollback, or continuation is permitted

---

## 6. Status & Human Queries

At any time, the human authority may request status.

The system MUST respond with:

- A full status report
- A direct, lossless rendering of the governed human-visible status reflection
- NO additional text
- NO commentary
- NO explanation
- NO suggestions
- NO interpretation

This document does NOT define:

- Status fields
- Progress calculation
- Execution state derivation

All status semantics are governed EXCLUSIVELY by:

- governed runtime state contracts
- Progress Tracking & Status Report Contract (v1)

---

## 7. Silent Operation Rule

Silence is permitted ONLY while:

- Deterministic execution is actively progressing
- The next artifact is pending closure
- No ambiguity exists

Silence MUST NOT be used to:

- Mask uncertainty
- Delay escalation
- Accumulate ambiguity
- Avoid interrupt responsibility

If execution is stalled, ambiguous, or blocked:

- Silence is forbidden
- A status report or interrupt MUST be emitted

---

### 7.1 No Soft Escalation Rule (Hard)

The system MUST NOT escalate unless execution is strictly blocked.

Questions framed as:

- “Just to confirm”
- “To be safe”
- “Before proceeding”
- “Recommended approach”

are strictly forbidden.

If execution can proceed deterministically,
the system MUST proceed in silence.

---

### 7.2 Maximum Silent Window (Hard)

The system MUST enforce a maximum silent execution window.

If no artifact is produced AND no observable state change occurs
within the configured silent window:

- Silence is no longer permitted
- A mandatory status report MUST be emitted automatically
- The report MUST be a direct rendering of the governed human-visible status reflection

Silent execution beyond the configured window
without status emission
is a system fault.

---

## 8. Authority & Override (Hard-Bound)

The human authority has ABSOLUTE authority
over execution outcomes,
but that authority is exercised ONLY
through explicit, logged control paths.

The human authority MAY:

- Interrupt execution
- Resolve a Human Interrupt
- Select between valid execution options
- Explicitly terminate a task
- Initiate a NEW TASK

The human authority MUST NOT:

- Override execution silently
- Resume execution after Execution Abort
- Force continuation outside contract rules
- Modify scope mid-execution without artifact

All human authority actions MUST be captured as:

- Decision artifact
- Explicit termination artifact
- New Task artifact

Overrides are NOT conversational.  
Overrides are NOT implicit.  
Overrides are NOT contextual.

Human override input MUST NOT be injected through `progress/status.json`
or any reflected status field.

Human override, when explicitly permitted by contract,
MUST use a governed override channel separate from execution reflection.

Current governed override channel:
- environment variable `FORGE_DECISION_OVERRIDE`

Permitted values:
- `APPROVE ALL`
- `REJECT`

Execution Abort is terminal.  
No override may revive an aborted execution path.

---

## 9. Fail-Closed Guarantee

If uncertainty exists and cannot be resolved autonomously:

- The system MUST stop
- The system MUST escalate (if fork exists)
- Otherwise MUST Abort
- The system MUST NOT guess

Fail-Closed is mandatory.

---

## 10. Definition of Compliance

This policy is correctly implemented if:

- The system runs end-to-end without unnecessary interruptions
- Escalation occurs only when strictly required
- No silent assumptions are made
- Human time is used ONLY for bounded decision forks
- Execution Abort occurs when determinism cannot be preserved

---

**End of Document**