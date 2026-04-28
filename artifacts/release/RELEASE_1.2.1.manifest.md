# RELEASE 1.2.1 — Manifest

**Status:** FINAL — EXECUTION-BOUND  
**Release Type:** Patch (Execution Engine Integration Fix)

## What Changed

- Integrated deterministic task execution engine into runner
- Restricted execution to TASK-* names only
- Preserved smoke test compatibility
- Fixed unexpected task execution during tests

## Files Modified

- code/src/orchestrator/runner.js

## Files Added

- release_1.2.1.hashes.json

## Verification

- Smoke tests: PASS
- Integrity: PASS (release_1.2.1.hashes.json)
- Pre-Run Check: PASS
- Fail-Closed preserved

## Notes

This release stabilizes the deterministic task execution engine
without introducing autonomy, scheduling, recursion, or authority expansion.