# TASK-057 — Intake Classification Contract

## Objective
Define deterministic classification rules for incoming projects.

Forge must classify every intake into one of two modes:

BUILD
IMPROVE

## Classification Inputs

Forge may inspect:

- project_request.json
- repository structure
- existing documentation
- existing codebase

## Classification Rules

### BUILD Mode

Forge selects BUILD when:

- no codebase exists
- no documentation exists
- the request describes a new system

BUILD Mode allows Forge to:

- create documentation
- create architecture
- generate code
- run verification
- produce closure artifacts

### IMPROVE Mode

Forge selects IMPROVE when:

- a repository already exists
- documentation exists
- code exists

IMPROVE Mode allows Forge to:

- audit documentation
- repair documentation
- detect code/documentation gaps
- run verification
- improve implementation
- re-verify and close

## Fail-Closed Rule

If classification cannot be determined deterministically,
Forge must enter BLOCKED state and ask a blocking question.

## Status

Stage A — Contract Defined