# AI Layer Architecture Specification

## 1. Overview

The AI Layer is an upper layer built on top of Forge Core.

It introduces:
- reasoning capabilities
- project analysis
- conversational interaction

While delegating execution strictly to Forge.

---

## 2. High-Level Architecture

```

User (Web UI)
↓
AI Layer (NEW)

* Chat Engine
* Context Builder
* Analysis Engine
* Proposal Engine
  ↓
  Decision Interface
  ↓
  Forge Core (EXISTING)
* Decision Gate
* Backfill
* Execute
* Verify

```

---

## 3. Core Components

### 3.1 Chat Engine

Responsible for:
- handling conversation
- maintaining session context
- understanding user intent

Input:
- user message

Output:
- structured intent
- response text

---

### 3.2 Context Builder

Responsible for:
- scanning project files
- selecting relevant files
- preparing context for analysis

Sources:
- code/
- docs/
- artifacts/

Output:
- structured context package

---

### 3.3 Analysis Engine

Responsible for:
- reading project structure
- identifying gaps
- generating insights

Mode:
- read-only

Output:
- analysis report

---

### 3.4 Proposal Engine

Responsible for:
- converting analysis into actions
- suggesting improvements
- preparing execution-ready drafts

Output:
- proposal
- optional draft (NOT executed)

---

### 3.5 Decision Interface

Responsible for:
- converting proposals into Decision Packets
- sending to Forge pipeline

---

## 4. Data Flow

### Analysis Flow

```

User → Chat → Context Builder → Analysis Engine → Response

```

### Proposal Flow

```

User → Chat → Context → Analysis → Proposal Engine → Proposal Output

```

### Execution Flow

```

User Approval → Decision Interface → Forge → Execute → Verify

```

---

## 5. Mode Separation

### Analysis Mode
- read-only
- no file writes
- no execution

### Execution Mode
- requires approval
- uses Forge only

---

## 6. Boundaries

AI Layer:
- cannot write files directly
- cannot bypass Decision Gate

Forge:
- does not perform reasoning
- executes only approved actions

---

## 7. Core Capabilities (Not Extensions)

The following are core parts of the AI Layer and not optional extensions:

### 7.1 Project Memory System

The system must:

- persist project state across sessions
- maintain decisions, docs, and execution status
- restore context when a project is reopened

### 7.2 Long-Term Context Handling

The system must:

- maintain structured context per project
- prevent context loss between sessions
- support version tracking and rollback

### 7.3 Multi-Project Awareness

The system must:

- isolate memory per project
- allow switching between projects
- maintain active project context at all times

### 7.4 Behavioral Consistency

All AI Layer behavior must align with:

docs/12_ai_os/19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md

No capability may violate that contract.

---

## 8. Failure Rules (FAIL-CLOSED)

- If context is missing → do not analyze
- If proposal is unclear → do not execute
- If approval is missing → block execution
- If ambiguity exists → request clarification

---

## 9. Integration Rule

AI Layer MUST integrate with Forge via:

- Decision Packet only
- No direct file operations allowed

---
