# HALO Pipeline — Runtime Runbook (Stage C)

**Stage:** C  
**Scope:** Core Orchestrator Runtime (Non-Autonomous)  
**Status:** FINAL — EXECUTION-BOUND  

---

## 1. Purpose

This runbook defines how to operate and verify the HALO
Personal Autonomous Pipeline **Core Runtime Skeleton**.

It applies ONLY to:
- Deterministic execution
- No autonomy
- No decisions
- No loops

---

## 2. Components Overview

Implemented runtime components:

- Stage transition validator  
  `code/src/orchestrator/stage_transitions.js`

- Status writer  
  `code/src/orchestrator/status_writer.js`

- Orchestrator runner (minimal)  
  `code/src/orchestrator/runner.js`

---

## 3. Authoritative State File

All execution state is read from and written to:

progress/status.json


Rules:
- Full overwrite only
- No partial updates
- Schema enforcement is mandatory

---

## 4. How to Run (Manual)

### 4.1 Prepare State
Edit `progress/status.json` to include:
- `current_stage`
- `next_step` containing a target stage label (e.g., "Stage C")

### 4.2 Execute Runner
From project root:

node code/src/orchestrator/runner.js

Expected behavior:
- If `next_step` encodes a valid transition → stage updates
- If not → no-op (safe exit)

---

## 5. Verification

Available smoke tests:
- `verify/smoke/stage_transitions_smoke.js`
- `verify/smoke/status_writer_smoke.js`
- `verify/smoke/runner_smoke.js`

All tests MUST pass before any extension.

---

## 6. What This Runtime Does NOT Do

Explicit exclusions:
- No autonomy
- No retry logic
- No decision-making
- No scheduling
- No background execution

These require explicit future design.

---

## 7. Extension Boundary

Any of the following REQUIRE a new explicit directive:
- Autonomy
- Decision logic
- Long-running execution
- Stage D opening

---

## 8. CLI Execution (Recommended)

A minimal CLI entrypoint is provided for deterministic execution.

From project root:
- `node bin/halo-run.js`


Behavior is identical to invoking the runner directly.

---

## 9. Integrity Verification

Generate checksums (one-time, freeze values):
- `node tools/integrity.js generate > release_1.0.0.hashes.json`


Verify integrity later:
- `node tools/integrity.js verify release_1.0.0.hashes.json`


Any mismatch MUST be treated as a release invalidation.

---

## Dry-Run Mode

Run the pipeline without writing any state:
- `HALO_DRY_RUN=true node bin/halo-run.js`

This validates transitions and logs intent only.

---

## Dry-Run Verification

Smoke test:
- `node verify/smoke/runner_dry_run_smoke.js`

This confirms validation occurs without any state mutation.

---

END
