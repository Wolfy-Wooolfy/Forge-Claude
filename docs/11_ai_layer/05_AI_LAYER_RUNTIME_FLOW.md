# AI Layer Runtime Flow Specification

## 1. Purpose

Define the exact runtime behavior of the AI Layer from user interaction to execution.

This ensures:
- deterministic flow
- no ambiguity
- full compatibility with Forge pipeline

---

## 2. End-to-End Flow

```

User Input
↓
Chat Engine
↓
Context Builder
↓
Analysis Engine
↓
Proposal Engine
↓
User Approval
↓
Decision Interface
↓
Forge Pipeline
↓
Execute
↓
Verify

```

---

## 3. Detailed Flow

### Step 1: User Input

User provides:
- idea
- question
- request

---

### Step 2: Chat Processing

System:
- interprets intent
- determines mode:
  - analysis
  - proposal
  - execution request

---

### Step 3: Context Building

System:
- scans project
- selects relevant files
- builds context artifact

Output:
- context snapshot

---

### Step 4: Analysis

System:
- reads context
- identifies:
  - structure
  - issues
  - opportunities

Output:
- analysis artifact

---

### Step 5: Proposal

System:
- generates structured proposal
- defines:
  - what to change
  - why
  - impact

Output:
- proposal artifact

---

### Step 6: Draft Preparation (Optional)

System:
- converts proposal into draft changes
- prepares execution-ready structure

Output:
- draft artifact

---

### Step 7: User Approval

User:
- reviews proposal/draft
- approves or rejects

---

### Step 8: Decision Packet Creation

System:
- converts approved draft into Decision Packet

Output:
- artifacts/decisions/decision_packet.json

---

### Step 9: Forge Execution

Forge:
- Decision Gate
- Backfill
- Execute
- Verify

---

### Step 10: Result Feedback

System:
- returns execution result
- logs outcome

---

## 4. Mode Switching

### Analysis Mode
- stops at Step 4 or 5
- no execution

### Proposal Mode
- stops at Step 5 or 6

### Execution Mode
- continues to Step 10

---

## 5. Failure Rules

If any step fails:

- Missing context → STOP
- Invalid analysis → STOP
- Proposal unclear → ASK
- No approval → BLOCK
- Verify fails → FAIL

---

## 6. Enforcement

System MUST:

- never skip steps
- never auto-execute
- always require approval

---

## 7. Observability

Each step must produce:

- artifact
- log
- trace reference

---

## 8. Final Rule

Execution is NOT the default.

Thinking is the default.

---
