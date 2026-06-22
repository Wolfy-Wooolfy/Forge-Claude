# DECISION-2026-06-22 — PHASE-42: Built-Project Test Harness (L5b) — PROPOSAL

> Status: PROPOSED (scope DEFERRED to §0 probe -> STEP-A scope amendment -> owner ratification)
> Date: 2026-06-22
> Author: CTO advisor
> Owner trigger: Khaled — "go PHASE-42" (2026-06-22), after independent CTO verification of the post-PHASE-41 snapshot.
> Chain: appends to the PHASE-41 closure chain. Supersedes nothing.

## 1. Context
PHASE-41 (Fixture Engine / D1 Ephemeral Overlay Root) is TRULY CLOSED (HEAD bedf6721,
tag phase-41-complete, GitHub-raw verified). State at open: SU 325/0/5 (330),
forge-doctor 35/0-FAIL, L2=80, roles=13, §ARC=10 (frozen). next_phase=PHASE-42-PENDING-DECISION.
Strategic objective: move from infrastructure-hardening to demonstrable capability (Track B).
The first capability milestone is L5b — the Built-Project Test Harness — per Blueprint Part B
(L5b) / Part D.2 and Roadmap PHASE-8.

## 2. Why now
A non-technical owner cannot evaluate generated code directly. The harness makes each built
project arrive WITH deterministic, owner-readable evidence that it works: a test report, plus
a block-on-failure -> loopback discipline so the pipeline does not advance past a failing module.

## 3. Decision (this proposal)
Open PHASE-42 to COMPLETE/EXTEND the EXISTING partial L5b surface into a full Built-Project
Test Harness. Partial L5b is believed already present (to be confirmed by the §0 probe):
builtproject tools (run_scenarios / read_report), the _reference_todo_api/forge_tests fixtures,
scenarios S120-S127, a test_designer role, and designTests/runTests pipeline stages.
EXACT SCOPE IS NOT LOCKED BY THIS PROPOSAL. It is deferred to:
- §0: a READ-ONLY probe producing an "exists vs missing" inventory.
- STEP-A scope amendment (A-1), authored after the probe and owner-ratified, which fixes the
  deliverables + the deterministic closure gate.

## 4. §0 deliverables (read-only)
1. This proposal artifact (committed LOCAL).
2. A read-only inventory of the existing L5b surface (items a-h in the §0 prompt).
3. A Step-0 summary with a gap read. NO code, NO scope-lock, NO suite run.

## 5. Cost
Mock-only, $0. No LLM calls in §0. Real-provider runs (if ever needed for a later demo) are a
separate phase and require explicit owner approval in chat. Kill bar $3/phase.

## 6. Track A
Expected later: test-infra + possibly one new provider (projectTestPlanProvider) + executeEngine
wiring. Any new side-effect home or §ARC entry -> STOP -> amendment -> owner approval before code.
§ARC stays frozen at 10 unless explicitly amended.

## 7. Cosmetic reconcile (scheduled — NOT done in §0)
At STEP-A opening, a single status.json reconcile will fix three non-authoritative drifts:
current_task frozen at PHASE-36; runtime_health.self_test_last_result label one phase behind;
last_updated older than the latest doctor run/artifact. Authoritative fields
(next_phase / next_step / last_completed_artifact) are unaffected.

## 8. Closure gate (placeholder — finalized in A-1)
Deterministic, specified post-probe. Will include: exact new/changed SU scenario count; a demo
built project that (i) gets a generated test plan, (ii) fails on a planted bug -> module does NOT
advance, (iii) passes after fix -> advances; Track A grep clean; decision artifact closed;
status.json updated; checkpoint written.

## Amendment log
- (pending) A-1 — STEP-A scope + closure gate, authored after the §0 probe, owner-ratified.
