# TASK-047 — Module Flow Bridge (Intake)

## Purpose
Bridge execution from TASK-based runtime into MODULE-based flow by executing Intake module runtime.

## Contract
- MUST be executable via `current_task = "TASK-047: MODULE FLOW — Intake"`
- MUST write artifacts ONLY under `artifacts/intake/`
- MUST NOT write into IMMUTABLE-LEGACY namespaces

## Outputs
- artifacts/intake/repository_inventory.json
- artifacts/intake/intake_snapshot.json
- artifacts/intake/entrypoint_classification.md