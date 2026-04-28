# User Interaction Flow (Conversational Execution Model)

---

## Overview

The expected user interaction flow is:

1. user opens or selects a project
2. system loads project context
3. conversation begins in the active project context
4. system clarifies and refines the idea or review request
5. system performs business reasoning and research if needed
6. system presents options and recommendations
7. user accepts, rejects, or adjusts direction
8. system builds and refines documentation
9. user approves documentation
10. system prepares execution package
11. user explicitly approves execution
12. Forge executes
13. Forge verifies
14. system delivers result and run instructions if needed

This flow must remain understandable to a non-technical user.

---

## Conversation Capabilities

Forge must support:

### 1. Idea Discussion

User:
"I want to build a game where players mine resources"

Forge:
- understands idea
- asks clarification questions
- suggests improvements
- identifies risks
- proposes variations

---

### 2. Business Exploration

User:
"Will this make money?"

Forge:
- analyzes monetization models
- estimates revenue potential
- suggests improvements
- compares alternatives

---

### 3. Decision Support

User:
"Should I use ads or subscriptions?"

Forge:
- presents options
- explains pros/cons
- gives recommendation
- asks for user decision

---

### 4. Iterative Refinement

User:
"Remove ads, keep subscriptions"

Forge:
- updates full plan
- maintains consistency
- re-evaluates impact

---

### 5. Autonomous Documentation Phase

Forge must:

- generate full structured documentation
- validate it internally
- iterate multiple times
- detect inconsistencies
- resolve gaps

WITHOUT user intervention unless needed

---

### 6. Execution Phase

After documentation is approved:

Forge must:

- generate execution plan
- create files
- modify code
- validate output
- iterate until complete

---

### 7. Continuous Verification

Forge must:

- verify each step
- detect errors
- fix issues
- re-run steps if needed

---

### 8. Final Delivery

Forge must deliver:

- complete project
- ready to run
- with clear instructions

---

## User Control Points

User must be involved ONLY when:

- multiple options exist
- decisions are required
- clarification is needed

Otherwise:

Forge proceeds autonomously.

---

## Multi-Project Support

System must support:

- multiple projects
- separate contexts
- independent execution flows

User must be able to:

- switch projects
- run multiple executions
- track progress per project

---

## Language Support

Forge must support:

- Arabic
- English
- natural mixed language

All outputs must be:

- clear
- conversational
- human-friendly

---

## Experience Goal

Forge must behave like:

→ a smart technical partner

NOT:

→ a coding tool
→ a command system

---

## Strict Rule

At no point should the user be required to:

- understand code
- interact with files
- perform technical operations

Forge handles everything.