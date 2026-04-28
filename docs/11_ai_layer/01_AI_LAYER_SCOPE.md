# AI Layer Scope — Phase Definition

## 1. Purpose

Introduce a new AI Layer on top of Forge Core to enable:

- Natural language discussion (idea exploration before execution)
- Project understanding and analysis
- Proposal generation before execution
- Controlled transition from discussion → execution

This layer MUST NOT break or bypass Forge governance.

---

## 2. Scope of This Phase

The AI Layer is the reasoning and conversational layer above Forge.

Its scope includes:

- understanding user intent
- maintaining conversation context
- clarifying vague inputs
- developing ideas
- performing business-aware reasoning
- handling research and uncertainty transparently
- building and refining documentation
- preparing execution packages
- explaining Forge execution and results to the user

The AI Layer is NOT a direct execution layer.
All execution must remain governed by Forge.

---

## 3. Modes of Operation

The system will now support two distinct modes:

### 1) Analysis Mode (NEW)
- Read-only
- No file writes
- Produces:
  - summaries
  - insights
  - proposals

### 2) Execution Mode (EXISTING)
- Uses Forge pipeline
- Requires:
  - Decision Packet
  - Approval
  - Verify PASS

---

## 4. Transition Rules

System MUST follow:

- Discussion → Analysis → Proposal → Approval → Execution

Forbidden:

- Discussion → Execution (direct)

---

## 5. Governance Constraints

- AI Layer MUST NOT write directly to filesystem
- All execution MUST go through:
  Forge → Decision Gate → Backfill → Execute → Verify

- AI Layer acts as:
  - Advisor
  - Analyzer
  - Proposal generator

NOT as executor

---

## 6. Output Types

AI Layer can produce:

- Conversation responses
- Analysis reports
- Improvement proposals
- Draft execution plans (pending approval)

---

## 7. Success Criteria

This phase is complete when:

- User can discuss ideas naturally
- System can analyze project structure
- System can propose improvements
- No execution happens without approval
- Full compatibility with Forge governance is preserved

---

## 8. Non-Goals

- Replacing Forge execution engine
- Removing approval requirements
- Ungoverned execution without explicit approval and Forge control