# Forge — Quickstart

**Release:** 1.0.0  
**Mode:** Deterministic (Non-Autonomous)

---

## What You Get

- Deterministic pipeline runtime
- Strict stage transitions
- Full status tracking
- Smoke-tested core
- Integrity-locked release

Autonomy is optional (disabled by default). No decisions. No background loops.

---

## Requirements

- Node.js 18+
- Project root as working directory

---

## Run in 2 Minutes

1) Inspect current state:
- `cat progress/status.json`


2) Prepare a transition (example):
Set `next_step` to include a target stage label, e.g.:
- "next_step": "Stage C"


3) Run the pipeline:
- `node bin/halo-run.js`


4) Verify:
- `node verify/smoke/runner_smoke.js`


---

## Pre-Run Gate (Recommended)

Before running the pipeline:
- `node tools/pre_run_check.js`

This verifies:
- All smoke tests
- Optional integrity lock

---

## Integrity (Optional but Recommended)

Generate hashes once:
- `node tools/integrity.js generate > release_1.0.0.hashes.json`


Verify later:
- `node tools/integrity.js verify release_1.0.0.hashes.json`


Any mismatch invalidates the release.

---

## What This Does NOT Do

- No autonomy
- No retries
- No scheduling
- No decisions
- No Stage D components

---

## Next Evolutions (Require Explicit Directive)

- Stage D
- Autonomy inside Stage C
- New Release (1.1.0)

---

END
