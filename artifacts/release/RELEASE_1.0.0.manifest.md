# HALO Personal Autonomous Pipeline — Release Manifest

**Release:** 1.0.0  
**Type:** CORE RUNTIME FREEZE  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Scope

This release freezes the **Core Orchestrator Runtime** for the HALO
Personal Autonomous Pipeline.

Included scope:
- Deterministic execution only
- No autonomy
- No decisions
- No background loops

---

## 2. Included Components (Authoritative)

### Runtime
- `code/src/orchestrator/stage_transitions.js`
- `code/src/orchestrator/status_writer.js`
- `code/src/orchestrator/runner.js`
- `bin/halo-run.js`

### Verification
- `verify/smoke/stage_transitions_smoke.js`
- `verify/smoke/status_writer_smoke.js`
- `verify/smoke/runner_smoke.js`

### Documentation & Artifacts
- `artifacts/stage_B/orchestrator_stage_transitions.md`
- `artifacts/stage_B/orchestrator_status_writer.md`
- `artifacts/stage_B/orchestrator_runner.spec.md`
- `artifacts/stage_C/core_runtime.closure.md`
- `artifacts/stage_C/runtime_runbook.md`

---

## 3. Exclusions (Explicit)

This release does NOT include:
- Autonomy
- Decision logic
- Scheduling
- Retries
- Long-running execution
- Stage D components

---

## 4. Integrity Rules

- Any change to files listed above INVALIDATES this release
- Extensions require a new release manifest
- This manifest is the authoritative definition of Release 1.0.0

---

## 5. Verification Status

All included components:
- Are spec-defined
- Are deterministic
- Have passing smoke tests

---

END
