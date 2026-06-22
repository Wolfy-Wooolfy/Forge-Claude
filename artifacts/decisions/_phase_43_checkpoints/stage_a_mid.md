# PHASE-43 — STEP A MID CHECKPOINT (driver + prereqs + mock full-chain dry-run)

> Date: 2026-06-22 · Mode: MOCK only, $0, ZERO real LLM calls · LOCAL commit only (no push/tag).
> Decision chain: [DECISION-2026-06-22-phase-43-first-real-build.md](../DECISION-2026-06-22-phase-43-first-real-build.md) (PROPOSAL + AMENDMENT A-1).
> Status: STEP A complete → awaiting CTO verification before STEP B (the gated REAL run).

## 1. What STEP A delivered (mock, $0)
A single parameterized full-build driver that walks the genuine conversation pipeline
OWNER_INTENT → COMPLETE for the Notes API demo, proven end-to-end in MOCK, plus a verifier
that proves the PHASE-42 owner test-report surface renders. No live-surface code touched.

## 2. Driver
- **Location:** [scripts/spikes/phase43_notes_api_full_build.js](../../../scripts/spikes/phase43_notes_api_full_build.js)
- **How it drives:** in-process `createConversationEngine({root})` + per-hop engine method calls
  (`confirmIdea`, `reviewSpec`, `estimateCost`, `reportEnv`, `respondGate`, `designTests`,
  `buildProject`, `runTests`, `reviewProject`, `documentProject`, `judgeQuality`, `deployProject`,
  `finalizeDeliverable`) — the same methods the apiServer endpoints mirror. This is the gate28
  per-hop pattern extended all the way to the COMPLETE terminal (gate28 stopped at RUN_TESTS).
  Chosen over the HTTP-endpoint path because the engine methods ARE the product logic the
  endpoints wrap (4-line mirrors), and the per-hop form gives deterministic per-hop assertions
  + trace. The report-render proof DOES use the real HTTP endpoint (see §5).
- **Provider flag (single, NOT hardcoded):** `PHASE43_MODE=mock` (default) | `real`.
  - mock: `provider:"mock"` + existing scenario-tagged mock fixtures per hop; `runTests` verdict
    FORCED via `_test_force_run_scenarios_result` + `_test_skip_npm_install`.
  - real (STEP B): loads `.env`, `provider:"openai" model:"gpt-4o"` at EVERY hop, NO scenario_ids,
    NO seeding, real npm install + real `builtproject.run_scenarios`.
  - `PHASE43_FORCE_TEST_FAIL=1` (mock only): forces RUN_TESTS FAIL to exercise the loopback cap.
- **Fixed owner-intent** (A-1.4) fed at OWNER_INTENT: the Notes API text, verbatim, in the driver.
- **Builder loopback cap = 2:** driver-side guard `DRIVER_LOOPBACK_CAP` wrapping buildProject→runTests;
  on RUN_TESTS FAIL → `orchestration.loop_back` → BUILDER, retried up to the cap then STOP. The
  engine's own `ITERATION_CAP = 5` (conversation_graph, contract §13.2.2); the driver guard is
  intentionally tighter to bound demo churn/cost.
- **Deployment skip → Gate 3 skipped:** `deployProject({deployment_enabled:false})` →
  `shouldSkipGate3` → `advance_state(VACUOUS_SKIP)` → LIVE_DELIVERABLE (no deployment role, no
  Gate 3); then `finalizeDeliverable` → COMPLETE. Confirmed from conversationEngine.js:2761-2786.

## 3. vision-lock + budget L3 prerequisites (PHASE-32/33 lesson)
**Mechanism (verified in code):** the L3 `agent_budget_rule` ([code/src/runtime/permission/rules/agent_budget_rule.js](../../../code/src/runtime/permission/rules/agent_budget_rule.js)) gates every `agent.invoke`:
- **Vision (Section A):** for a NON-mock provider it calls `visionEngine.readVisionSync(project_id)`;
  no frontmatter → DENY `VISION_NOT_FOUND`; `vision_locked!==true` → DENY `VISION_NOT_LOCKED`.
  (reverse_vision role exempt.) **Bypassed entirely when provider==="mock".**
- **Budget (Section B):** `provider==="mock"` returns allow immediately. For non-mock, estimates
  cost and calls `budget_enforcer.checkBudget`; defaults to **$50 total / $5 per-iteration** caps
  when the vision carries no budget fields, and the rule treats checkBudget throws as non-blocking.
  A ~$0.20–0.50 build is ~1% of the $50 cap → allow.

**How the prereq is satisfied (the key finding):** the GENUINE entry point `confirmIdea(AFFIRM)`
writes the locked `vision.md` ITSELF from `idea_summary.json`
(conversationEngine.js:699-759, `vision_locked:true`) BEFORE any role.invoke. So the real run's
first agent call already sees a locked vision. PHASE-32/33 hit `VISION_NOT_FOUND` only because
gate34 SEEDED states via `advance_state` and bypassed confirmIdea — this driver does not.
- **Path written:** `artifacts/projects/phase43_notes_api/vision.md` (by confirmIdea).
- **Driver assertion:** after H1 the driver reads vision.md and asserts `vision_locked:true`
  (`trace.vision_locked`), and STOPs otherwise. Mock run confirmed `vision_locked:true = true`.
- **No new side-effect location, no new §ARC entry** required for either prereq.

## 4. Mock dry-run result ($0)
Two runs, both reproducible:

**(a) Clean walk — `node scripts/spikes/phase43_notes_api_full_build.js` → verdict COMPLETE:**
- States walked (on-disk `get_status` after each leg): ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE →
  REVIEWER_SPEC → COST_ESTIMATE → ENV_REPORT → TEST_DESIGN → BUILDER → RUN_TESTS →
  REVIEWER_CODE_AND_SECURITY → DOCUMENTATION → QUALITY_JUDGE → DEPLOYMENT_OR_END →
  LIVE_DELIVERABLE → **COMPLETE** (terminal).
- Gates: **G1 APPROVE** (ENV_REPORT→TEST_DESIGN), **G2 APPROVE_SHIP** (QUALITY_JUDGE→DEPLOYMENT_OR_END).
- Deployment-skip: `deployProject(deployment_enabled:false)` → `skipped:true` → LIVE_DELIVERABLE
  (Gate 3 NOT hit). finalize → COMPLETE.
- Materializer wrote files to disk; RUN_TESTS advanced PASS (4/4 forced) → REVIEWER_CODE_AND_SECURITY.
- Evidence: `artifacts/spikes/phase43_notes_api/phase43_trace.json` (untracked; reproducible).

**(b) Loopback cap demo — `PHASE43_FORCE_TEST_FAIL=1 node …` → STOP DRIVER_LOOPBACK_CAP_REACHED:**
- BUILD attempt 1 → RUN_TESTS FAIL (1/4) → `orchestration.loop_back` → BUILDER → BUILD attempt 2 →
  RUN_TESTS FAIL → driver cap=2 reached → STOP. Confirms block-on-failure + bounded churn.

## 5. Mock approach used (honest disclosure)
- **Genuinely driven engine methods** (real engine + existing scenario-tagged mock fixtures from
  `mock_responses.json`, matched by `mock|<model>|scenario:<TAG>`):
  reviewSpec (S102), estimateCost (S104), reportEnv (S107), designTests (S100),
  buildProject (builder+materializer S327 — materializes `app.js`, a recognized PHASE-30 entry),
  runTests (forced verdict), reviewProject (reviewer S102 + security S96, both no-BLOCKER → APPROVE),
  documentProject (S110), judgeQuality (S116), plus both gates, the deployment-skip, and finalize.
- **Seeded (mock only) — 2 hops:** `architect_design.json` + `spec.json` are written directly
  (Notes-themed, schema-shaped) and the state advanced, because architect & spec_writer have NO
  scenario-tagged mock in `mock_responses.json` (only role-test prompt-prefix keys) and **A-1.6
  forbids editing `code/src/runtime/**`** (the mock file lives there). confirmIdea STILL runs
  genuinely (it writes the locked vision.md). In **REAL mode (STEP B)** these two hops run
  genuinely via confirmIdea(architect)+formalizeSpec — no seeding. This is plumbing validation,
  not a production Notes API (that is STEP B), exactly as A-1.4/§A.4 permit.
- **Report seed:** because mock forces the RUN_TESTS verdict, no `last_report.json` is written by
  the harness; the verifier seeds a PASS report to prove the owner surface. STEP B's real run
  writes the genuine report.

**Owner test-report surface RENDERS** — `node scripts/spikes/phase43_verify_report.js`:
- in-process apiServer (port 0; prod 3100 untouched) →
  `GET /api/ai-os/project/test-report?project_id=phase43_notes_api` → **200, overall_status=PASS, 4/4**.
- `GET /test-report.html` → **200** (6033 bytes; viewer served).
- Owner URL: `/test-report.html?project_id=phase43_notes_api`. verdict: RENDERS.
- Evidence: `artifacts/spikes/phase43_notes_api/report_endpoint_verify.json` (untracked; reproducible).

## 6. Track A confirmation (§A.5)
- `git status --short -- code/src/workspace/apiServer.js code/src/ai_os/ code/src/runtime/` → **EMPTY**
  (NO live-surface file changed; `mock_responses.json` was NOT edited).
- Only NEW files: the two spike drivers (`scripts/**`), the decision artifact (A-1 append), this
  checkpoint, and untracked per-project/spike output under `artifacts/**`.
- §ARC unchanged = **10** (doc 18 untouched). L2=80, roles=13, doctor=35 (status.json; suite NOT
  run in STEP A). No new side-effect home; the STEP-B real LLM call routes through the sanctioned
  openAiAdapter (§ARC).

## 7. Local commit
- Selective add (NO `-A`): the decision artifact (A-1 append), `phase43_notes_api_full_build.js`,
  `phase43_verify_report.js`. Commit SHA: **f80f6d4** (parent: 602f570 "U" → f0462f6 §0 proposal →
  f80f6d4 STEP A). This checkpoint is a follow-up bookkeeping commit on top. LOCAL only — NO push, NO tag.
- NOT committed (untracked, reproducible): `artifacts/projects/phase43_notes_api/` (generated demo
  project + seeded report) and `artifacts/spikes/phase43_notes_api/` (trace + endpoint evidence).

## 8. STOP — awaiting CTO verification before STEP B
STEP B (the REAL gpt-4o build) requires a SEPARATE explicit owner spend-approval in chat (estimate
shown first; ~$0.20–0.50 expected, SOFT-STOP $1.50, HARD-KILL $3.00 — A-1.3). No real LLM call has
been made. NO surprise encountered: both L3 prereqs are satisfied by the genuine confirmIdea path
(no new §ARC), and the driver reaches COMPLETE.
