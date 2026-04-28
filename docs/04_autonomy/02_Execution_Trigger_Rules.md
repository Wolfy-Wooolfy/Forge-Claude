# Execution Trigger Rules

---

## Overview

This document defines when Forge is allowed to:

- start execution
- continue execution
- pause execution
- require user input

---

## Core Principle

Execution must be:

→ Safe  
→ Controlled  
→ Intent-driven  

---

### AI OS Companion Trigger Alignment

Execution must not be triggered from conversation alone.

Before execution begins, all of the following must exist:

- approved documentation state
- approved execution package
- explicit user approval
- clearly identified project context

If any of the above is missing, execution must remain blocked.

---

## Execution Modes

### 1. Manual Execution Mode

Execution starts ONLY when:

- user explicitly requests execution

Example:
"Start building the project"

---

### 2. Assisted Execution Mode

Execution starts when:

- user intent strongly implies execution
- system confirms before starting

Example:
User: "Build it"
Forge: "Do you want me to start execution?"
User: "Yes"

---

### 3. Autonomous Execution Mode

Execution starts automatically when:

- intent is clear
- no ambiguity exists
- no decisions required

---

## Execution Start Conditions

Execution is allowed ONLY if:

- project context is complete
- no missing critical information
- no unresolved decisions

---

## Mandatory Pause Conditions

Execution MUST pause when:

### 1. Multiple Strategies Exist

- system finds multiple valid approaches
- user decision required

---

### 2. Ambiguity Detected

- unclear requirements
- conflicting inputs

---

### 3. Risk Detected

- financial impact
- irreversible changes

---

### 4. External Dependency Needed

- API key
- credentials
- integrations

---

## Automatic Continuation Conditions

Execution continues automatically when:

- no decision required
- clear path exists
- previous step validated

---

## Retry Logic

If execution fails:

1. analyze failure
2. propose fix
3. retry automatically (if safe)

---

## Hard Stop Conditions

Execution MUST stop when:

- repeated failure occurs
- critical system error
- user rejects continuation

---

## User Override

User can:

- force execution
- pause execution
- cancel execution

---

## Transparency Rule

Forge must always:

- explain what it's doing
- explain why it's doing it
- explain next step

---

## Safety Rule

Forge must NEVER:

- execute destructive actions without confirmation
- overwrite critical data without approval
- make financial decisions autonomously