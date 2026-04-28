# TASK-060 — Closure Realignment Contract

## Objective

Realign `code/src/modules/closureEngine.js`
with the authoritative closure governance defined in:

- `docs/03_pipeline/CLOSURE_AND_RELEASE_CONTRACT_v1.md`
- `docs/03_pipeline/SELF_BUILDING_SYSTEM_BLUEPRINT_v1.md`
- `docs/03_pipeline/MODULE_ORCHESTRATION_GOVERNANCE_v1.md`

This task exists to close the gap between
the currently implemented Closure module
and the required deterministic release behavior.

## Reason For Opening This Task

Current `progress/status.json` indicates:

- current_stage = `D`
- stage_progress_percent = `100`
- next_step = `READY — Module Flow Closure COMPLETE`

Therefore the previous execution cycle is CLOSED.

Any further work MUST start as a new task.

## Scope

This task applies ONLY to:

- `code/src/modules/closureEngine.js`
- `code/src/execution/task_registry.js` only if task bridge update becomes required
- Closure output artifacts under:
  - `artifacts/closure/`
  - `artifacts/release/`

## Mandatory Alignment Requirements

Closure Engine MUST be realigned so that it enforces all mandatory rules from the closure contract.

### 1. Activation Preconditions

Closure MUST execute only if:

- Execute completed successfully
  OR zero-gap auto-pass is explicitly supported and evidenced
- No active BLOCKED state exists
- All upstream required artifacts exist

If any precondition fails:
- Closure MUST halt fail-closed
- Exactly ONE blocking question MUST be produced

### 2. Mandatory Re-Verification

Closure MUST re-verify, at minimum:

- Audit artifact presence and validity
- Trace artifact presence and validity
- Gap artifact presence and validity
- Decision artifact presence and validity
- Execute artifact presence and validity

Closure MUST NOT silently pass merely because files exist.

Closure must explicitly confirm:

- No unresolved critical violations
- No unresolved orphan entities that violate closure contract
- Gap state is acceptable for final closure

### 3. Deterministic Validation

Closure MUST validate:

- `intake_snapshot.locked_snapshot_flag == true` if snapshot exists and is authoritative
- Required artifact namespaces are valid
- Decision artifacts are present and stable
- Deterministic release data can be produced from current repository state

### 4. Mandatory Outputs

Closure MUST generate all of the following:

- `artifacts/closure/closure_report.md`
- `artifacts/release/RELEASE_MANIFEST_v1.json`
- `artifacts/release/repository_hash_snapshot.json`

If any mandatory output is missing:
- Closure is invalid
- Task is not complete

### 5. Closure Report Content

`closure_report.md` MUST explicitly state:

- operating_mode
- repository_state
- verified modules
- gap status
- critical violation status
- deterministic confirmation status
- release artifact paths
- final closure outcome

### 6. Release Manifest Minimum Requirements

`RELEASE_MANIFEST_v1.json` MUST include at minimum:

- execution_id
- release_timestamp
- modules_executed
- gap_count
- critical_violations
- snapshot_hash
- deterministic_confirmation

### 7. Repository Hash Snapshot Minimum Requirements

`repository_hash_snapshot.json` MUST include at minimum:

- execution_id
- total_files
- repository_hash
- hash_algorithm
- captured_at

Hash generation must be deterministic.

### 8. Fail-Closed Enforcement

Closure MUST halt if any of the following are true:

- required artifact missing
- invalid operating mode
- unresolved critical violation
- invalid decision state
- invalid or missing release artifact
- deterministic snapshot cannot be produced

On halt:

- system enters BLOCKED
- exactly ONE blocking question is written
- no READY state may be emitted

### 9. Status Update Rule

Only after successful Closure completion may status be updated toward:

`READY — Module Flow Closure COMPLETE`

If closure validation fails,
that READY state MUST NOT be emitted.

## Out Of Scope

This task MUST NOT:

- invent new pipeline stages
- introduce a separate Verify module unless explicitly requested in a future task
- modify governance documents
- change stage model A-D
- refactor unrelated modules

## Completion Criteria

TASK-060 is complete only when:

1. `closureEngine.js` matches this contract
2. Required release artifacts are generated
3. Closure fails closed on missing prerequisites
4. Closure no longer reports success based only on file existence
5. Closure outputs are deterministic and traceable

## Status

Stage A — Contract Defined