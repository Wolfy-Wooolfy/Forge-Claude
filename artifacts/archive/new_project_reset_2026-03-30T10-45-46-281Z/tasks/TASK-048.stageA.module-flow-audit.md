# TASK-048 — Module Flow Bridge (Audit)

## Purpose
Bridge execution from TASK-based runtime into MODULE-based flow by executing Audit module runtime.

## Contract
- MUST be executable via `current_task = "TASK-048: MODULE FLOW — Audit"`
- MUST validate the outputs of Intake under `artifacts/intake/`
- MUST NOT write into IMMUTABLE-LEGACY namespaces

## Inputs
- artifacts/intake/repository_inventory.json
- artifacts/intake/intake_snapshot.json
- artifacts/intake/entrypoint_classification.md

## Outputs
- artifacts/audit/audit_findings.json
- artifacts/audit/audit_report.md
- artifacts/audit/audit_error.md (ONLY if FAIL)