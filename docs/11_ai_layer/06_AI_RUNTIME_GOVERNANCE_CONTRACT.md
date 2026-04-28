# AI Runtime Governance Contract

## Purpose

This contract defines the strict runtime governance rules for any AI-driven interaction within the system.

It ensures that:

- AI is used for reasoning, proposal, and structuring only
- AI NEVER executes changes directly
- All execution is delegated to Forge Core through approved execution packages

---

## Core Principles

### 1. No Direct Execution from Conversation

Under NO circumstances should any action be executed directly from:

- Chat interface
- AI responses
- External workspace prompts

All actions MUST go through:

→ Proposal → Approval → Execution Package → Forge Core

---

### 2. AI Role is Non-Executable

The AI layer is strictly responsible for:

- Understanding user intent
- Structuring requests
- Generating proposals
- Assisting in decision-making

The AI layer is NOT responsible for:

- Writing directly to files
- Triggering execution
- Bypassing governance
- Modifying system state

---

### 3. Mandatory Execution Flow

Every action must follow this sequence:

1. Proposal generation
2. Decision / Approval (role-based if required)
3. Execution package creation
4. Execution through Forge Core
5. Verification
6. Closure

Any deviation from this flow is considered a violation.

---

### 4. Governance Enforcement

If any of the following occurs:

- Attempted direct file modification
- Skipping approval
- Skipping verification
- Execution outside Forge Core

The system MUST:

→ BLOCK execution immediately

---

### 5. Contract Authority

This contract OVERRIDES:

- Conversation behavior
- Workspace behavior
- AI provider behavior
- UI-triggered actions

If any component conflicts with this contract:

→ This contract MUST be enforced

---

## Final Rule

AI can THINK  
AI can PROPOSE  
AI can ASSIST  

BUT:

AI can NEVER EXECUTE