# TASK-023 — Stage B Autonomy Skeleton (No Execution)

## Purpose
Define exact file placement and interfaces for a controlled autonomy loop
WITHOUT enabling execution logic.

## Skeleton Placement

### Autonomy Module Root
- Path: code/src/orchestrator/autonomy/

### Files (Skeleton Only)
1) autonomy_config.js
- Exposes:
  - DEFAULT_MAX_RUNTIME_MINUTES (30)
  - HARD_MAX_RUNTIME_MINUTES (60)

2) autonomy_entry.js
- Exposes:
  - start_autonomy_session({ max_runtime_minutes })
- Rules:
  - Must validate: opt-in flag + next_step starts with "Stage"
  - Must never run if next_step == IDLE
  - Must never invoke Stage D

3) autonomy_loop.js
- Exposes:
  - run_once()
- Rules:
  - Executes at most ONE deterministic advancement per call
  - Stops immediately on BLOCKED / FAIL / time limit

4) autonomy_logger.js
- Exposes:
  - log_action(type, payload)
- Rules:
  - stdout only, no files

## CLI Hook (Disabled by Default)
- Path: bin/halo-autonomy.js
- Behavior:
  - Requires explicit env var: HALO_AUTONOMY=1
  - Requires explicit max runtime argument (optional, capped)

## Constraints (Hard)
- No timers (setInterval / setTimeout)
- No schedulers
- No background loops
- No network
- No parallelism
- No state mutation outside progress/status.json
- No imports into existing runner unless explicitly planned

## Exit Criteria
- Skeleton approved
- No executable autonomy behavior exists
