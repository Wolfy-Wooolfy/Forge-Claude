# Docs-to-Code Coverage Map — Core Runtime
Document ID: DOC-AUD-08_10
Status: EXECUTION-BOUND
Scope: Coverage mapping for core runtime + tooling + verify smoke

## 1) Purpose

This document provides a deterministic mapping between:
- Documentation clauses (docs/**)
and
- Implemented code entrypoints (code/**, bin/**, tools/**, verify/**)

It exists to:
- Prevent undocumented runtime behavior
- Prevent documented-but-unimplemented requirements
- Enable gap audits without human interpretation

## 2) Coverage Map — Runtime Entrypoints

### 2.1 bin/forge-autonomous-run.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.1.A)
Implements:
- Governed autonomous pipeline execution
- Entry resolution from authoritative runtime artifacts
- Forge/orchestration state synchronization

### 2.2 Legacy runtime wrappers
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.1.B)
Implements:
- Compatibility status-driven execution wrappers
- Direct status-based run/step tooling when explicitly invoked

## 3) Coverage Map — Orchestrator

### 3.1 code/src/orchestrator/runner.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.2)
Implements:
- Control loop + bounded sequencing

### 3.2 code/src/orchestrator/stage_transitions.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.2)
Implements:
- Stage transition and gate enforcement

### 3.3 code/src/orchestrator/status_writer.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.2)
Implements:
- Governed mutations to the progress/status reflection

## 4) Coverage Map — Task Execution

### 4.1 code/src/execution/task_registry.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.2)
Implements:
- Handler resolution contract

### 4.2 code/src/execution/task_executor.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 2.2)
Implements:
- Handler result validation
- Contract enforcement for execution results

## 5) Coverage Map — Tooling

### 5.1 tools/pre_run_check.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 3.1)
Implements:
- Pre-run readiness validation
- Fail-closed gating (PASS required)

### 5.2 tools/integrity.js
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 3.2)
Implements:
- Baseline integrity verification
Baseline reference:
- release_local_v2.hashes.json

## 6) Coverage Map — Verify Smoke

### 6.1 verify/smoke/*
Covered by:
- docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md (Section 4.1)
Implements:
- Bounded functional smoke checks for runtime modules

## 7) Open Gaps (Declared)

1) Verify outputs specified under docs/09_verify/* that do not have producing code under verify/** remain pending as documentation-to-code gaps.
2) Memory Engine implementation is specified conceptually but no corresponding code module exists in current code state.

## 8) Non-authority Clause

This document does not override the governed runtime authority model.
`progress/status.json` is a reflection/output artifact and MUST remain aligned with higher-authority runtime artifacts.