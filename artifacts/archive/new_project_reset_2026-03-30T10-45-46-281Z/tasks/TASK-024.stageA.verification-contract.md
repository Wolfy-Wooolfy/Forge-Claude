# TASK-024 — Stage A Verification Contract (Stage D Authority)

## Purpose
Define the authority, boundaries, and behavior of Stage D
as a verification-only enforcement layer within HALO.

Stage D exists to VERIFY execution compliance.
Stage D does NOT decide, recommend, or execute.

## Authority Model

Stage D MAY:
- Verify artifact existence
- Verify artifact structure
- Verify deterministic rule compliance
- Produce PASS or FAIL outcomes
- Enforce execution abort on FAIL

Stage D MUST NOT:
- Make decisions
- Select between alternatives
- Modify execution paths
- Write to progress/status.json
- Create or mutate artifacts
- Invoke autonomy
- Execute code beyond verification scope

## Invocation Rules

Stage D MAY be invoked ONLY:
- After Stage C completion
- When verification is explicitly required
- When execution outcome must be validated

Stage D MUST NOT run:
- Automatically
- In background
- As part of autonomy loops
- Without explicit invocation

## Verification Nature

- Deterministic only
- Rule-based
- Binary outcomes (PASS / FAIL)
- No probabilistic logic
- No LLM-based reasoning

## Outputs

Stage D outputs:
- verification_result: PASS | FAIL
- verification_report (read-only)

Outputs are:
- Immutable
- Non-authoritative beyond verification scope

## Failure Handling

If Stage D returns FAIL:
- Execution MUST abort
- No retry unless explicitly defined
- No decision logged unless multiple valid paths exist

## Observability

- All verification steps logged
- Reports stored as artifacts
- No hidden state

## Exit Criteria

- Verification authority frozen
- No ambiguity remains
- No implementation yet
