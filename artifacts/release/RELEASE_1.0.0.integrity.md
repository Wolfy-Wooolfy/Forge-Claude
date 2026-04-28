# HALO Core Runtime — Integrity Lock

**Release:** 1.0.0  
**Type:** FILE INTEGRITY SNAPSHOT  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Purpose

This document defines the integrity baseline for
HALO Personal Autonomous Pipeline — Release 1.0.0.

Any modification to the files listed here
MUST be treated as a release invalidation.

---

## 2. Integrity Scope

The following files are integrity-locked:

### Runtime
- `code/src/orchestrator/stage_transitions.js`
- `code/src/orchestrator/status_writer.js`
- `code/src/orchestrator/runner.js`
- `bin/halo-run.js`

### Verification
- `verify/smoke/stage_transitions_smoke.js`
- `verify/smoke/status_writer_smoke.js`
- `verify/smoke/runner_smoke.js`

### Artifacts
- `artifacts/stage_B/orchestrator_stage_transitions.md`
- `artifacts/stage_B/orchestrator_status_writer.md`
- `artifacts/stage_B/orchestrator_runner.spec.md`
- `artifacts/stage_C/core_runtime.closure.md`
- `artifacts/stage_C/runtime_runbook.md`
- `artifacts/release/RELEASE_1.0.0.manifest.md`

---

## 3. Hash Algorithm

- Algorithm: **SHA-256**
- Encoding: hex
- Line endings: LF
- Hashes are calculated on raw file bytes

---

## 4. Hash Table

| File | SHA-256 |
|-----|--------|
| (to be generated once and frozen) | |

> NOTE: Hash values MUST be generated once,
inserted here, and never modified.
Any mismatch = integrity violation.

---

## 5. Verification Rule

Integrity verification is a **manual or scripted** process.
No runtime component performs integrity checks.

---

END
