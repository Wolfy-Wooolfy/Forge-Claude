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

---

## AMENDMENT A-1 — Scope lock + closure gate (2026-06-22)

> Status: APPROVED. Owner ratification: Khaled — "موافق على توصياتك طالما باعلى درجات الاحترافية" (2026-06-22), following the CTO §0 probe + independent verification against commit bedf6721.
> Supersedes the scope-deferred §3/§6 wording of the PROPOSAL above (originals preserved per the amendment-append rule).

### A-1.1 — §0 probe outcome (independently CTO-verified)
The existing L5b surface is materially more complete than the PROPOSAL assumed. Verified PRESENT and wired END-TO-END on the live pipeline:
- L2 tools builtproject.run_scenarios + builtproject.read_report.
- Harness core: scenario_loader.js, harness_runner.js, verdict_aggregator.js, loopback_signal.js + 8 assertion types.
- conversationEngine.runTests at RUN_TESTS: dep-install -> bridge test_plan -> builtproject.run_scenarios -> overall_status PASS advances to REVIEWER_CODE_AND_SECURITY; FAIL routes through orchestration.loop_back to BUILDER (cap-aware; ESCALATE at cap). No advance on FAIL = a real block + loopback. Proven with a real gpt-4o run in the PHASE-28/29 Gate #10.
- test_designer agent role is the sanctioned test-plan generator; the designTests stage produces test_plan.json.
- §ARC mapping (doc18): §ARC-3 = harness_runner.js (child_process.spawn); §ARC-10 = verdict_aggregator.js + loopback_signal.js (fs writes into the EXTERNAL built-project forge_tests/ root).

Verified ABSENT: projectTestPlanProvider.js, builtProjectTestEngine.js, executeEngine.js, docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md, the run_after_each_module.sh referenced illustratively in the Blueprint, and — the key capability gap — ANY owner-facing surface for the test report (no endpoint, no view; the report is reachable only via the read_report tool).

### A-1.2 — Corrections to the PROPOSAL (supersede §3 / §6)
- §3 "believed present (partial)" -> CORRECTED: the harness EXECUTION layer is COMPLETE and live, not partial. PHASE-42 is a hardening + documentation + owner-evidence phase.
- §6 "possibly one new provider (projectTestPlanProvider)" -> CORRECTED: projectTestPlanProvider is intentionally RETIRED, superseded by the test_designer role. PHASE-42 adds NO new provider and NO new §ARC entry; §ARC stays frozen at 10.

### A-1.3 — Ruling G1 (per-build vs per-module) — owner-ratified
The Blueprint L5b text says "after each module". The implemented model is PER-BUILD (materializer writes all plan files in one buildProject pass; runTests runs once at RUN_TESTS). RULING: ratify PER-BUILD as the accepted v2.0 model. PER-MODULE (incremental build + per-module test runs) is DEFERRED to the Iterative Build Loop phase (Roadmap PHASE-10). Recorded as a dated Blueprint addendum (STEP A.2). Rationale: per-build is proven end-to-end with a real LLM call; per-module is an architectural rework of the live build path and belongs to the iterative-build phase.

### A-1.4 — Locked scope
STEP A (documentation/governance; ZERO live code):
1. This amendment (A-1).
2. Blueprint dated addendum: ratify per-build for v2.0; per-module -> Iterative Build Loop (PHASE-10); mark run_after_each_module.sh as illustrative-only.
3. NEW authority doc docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md documenting (a) the as-built harness and (b) the CONTRACT for the owner-facing test-report read surface that STEP B implements.

STEP B (capability + closure):
4. Implement the owner-facing test-report read surface to the contract in (3): a READ-ONLY endpoint returning the latest built-project test report (overall_status, totals, per-scenario verdicts) sourced via reg.invoke("builtproject.read_report") / tools.fs — NO direct fs on the live surface (Track A).
5. A minimal owner-readable render of that report (non-React; must not pre-empt the PHASE-13 frontend rework).
6. status.json cosmetic reconcile (current_task; runtime_health.self_test_last_result label; last_updated) — gated on NO SU/doctor assertion referencing those fields (STOP-AND-REPORT if any).
7. >= 1 new deterministic SU scenario locking the owner-facing surface.

### A-1.5 — Deterministic closure gate (PHASE-42)
ALL must hold:
- SU suite: 325 -> (325 + N) pass / 0 fail / 5 skip, where N = new scenarios added in STEP B (exact number recorded at STEP-B closure). No regression.
- forge-doctor: 35 checks / 0 FAIL.
- Track A grep clean on the live surface (no new fs.*Sync / child_process / fetch / new OpenAI on apiServer/ai_os/runtime outside tool homes + frozen §ARC-1..10).
- 20_BUILT_PROJECT_TEST_CONTRACT.md present; Blueprint addendum present; this amendment present.
- status.json updated; checkpoint written.
- Mock-only, $0 (no LLM calls).

### A-1.6 — Track A constraint (binding for STEP B)
The owner-facing endpoint lives on the live surface (apiServer) and MUST source the report via reg.invoke / the read_report tool. Direct fs.* on the live surface is a Track A violation. §ARC stays frozen at 10.
