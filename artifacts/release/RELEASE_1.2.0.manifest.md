# RELEASE 1.2.0 — Manifest

**Status:** FINAL — EXECUTION-BOUND  
**Release Type:** Minor (Bounded Multi-Step Execution)

## What Changed

- Added explicit --max-steps support to halo-run CLI
- Deterministic bounded multi-step execution
- Default max_steps = 1 (backward compatible)
- No autonomy expansion introduced

## Files Modified

- bin/halo-run.js

## Files Added

- artifacts/tasks/TASK-029.stageA.multi-step-contract.md
- artifacts/tasks/TASK-029.stageB.skeleton.md
- artifacts/tasks/TASK-029.stageC.verify.md
- release_1.2.0.hashes.json

## Verification

- Smoke tests: PASS
- Integrity: PASS (release_1.2.0.hashes.json)
- Pre-Run Check: PASS
- Fail-Closed preserved

## Notes

This release introduces deterministic bounded execution only.
No decision logic, scheduling, recursion, or background execution was added.