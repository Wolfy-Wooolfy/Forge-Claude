# RELEASE 1.1.1 — Manifest

**Status:** FINAL — EXECUTION-BOUND  
**Release Type:** Patch (Integrity + Stage-C internal step acknowledgement)

## What Changed

- Stage C internal step acknowledgement (schema-safe) in orchestrator runner
- Pre-run check now accepts an explicit hashes file argument and fail-closes on integrity mismatch

## Files Added

- release_1.1.1.hashes.json
- artifacts/release/RELEASE_1.1.1.manifest.md

## Files Modified

- code/src/orchestrator/runner.js
- tools/pre_run_check.js

## Verification

- Smoke tests: PASS
- Integrity: PASS (release_1.1.1.hashes.json)
- Pre-Run Check: OK

## Notes

This release does not add autonomy loops, decisions, scheduling, or any new execution authority.