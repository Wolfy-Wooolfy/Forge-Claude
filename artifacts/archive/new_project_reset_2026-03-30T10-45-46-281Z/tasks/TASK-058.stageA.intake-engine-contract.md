# TASK-058 — Intake Engine Contract

## Objective

Implement Intake Engine to allow Forge to receive project requests
and start autonomous execution.

## Intake Source

Forge reads project requests from:

artifacts/intake/project_request.json

## Request Structure

A request may contain:

- project_name
- description
- repository_path
- documentation_path
- codebase_path

## Responsibilities

Intake Engine must:

1. Read project_request.json
2. Validate request structure
3. Determine if repository exists
4. Pass data to classification system

## Classification

Using TASK-057 rules, Intake Engine must classify request as:

BUILD
or
IMPROVE

## Output

Intake Engine must produce:

artifacts/intake/intake_report.md
artifacts/intake/intake_context.json

## Execution Trigger

After classification Forge must start pipeline automatically.

## Status

Stage A — Contract Defined