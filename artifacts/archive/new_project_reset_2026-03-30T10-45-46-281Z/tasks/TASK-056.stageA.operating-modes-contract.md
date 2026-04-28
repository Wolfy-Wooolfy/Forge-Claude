# TASK-056 — Forge Operating Modes Contract

## Objective
Define the official operating modes of Forge after completion of the first full module flow cycle.

## Approved Modes

### 1. Build Mode
Forge may start from idea, request, or partial requirements and autonomously produce:
- documentation
- implementation
- verification
- closure artifacts

### 2. Improvement Mode
Forge may start from an existing project and autonomously:
- read and validate documentation
- refine documentation until compliant
- compare docs against code
- detect gaps
- run verification and tests
- improve implementation
- re-verify and close

## Governing Rule
Both modes are official and equally valid.
Forge must determine the correct mode from intake inputs.
If mode cannot be determined deterministically, Forge must enter BLOCKED and ask one blocking question.

## Execution Implication
Future Intake Engine must classify every incoming project into one of:
- BUILD
- IMPROVE

## Status
Stage A — Contract Defined