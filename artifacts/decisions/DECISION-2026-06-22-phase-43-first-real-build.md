# DECISION-2026-06-22 — PHASE-43: First Real End-to-End Build (Demonstrable) — PROPOSAL

> Status: PROPOSED (scope + cost ceiling DEFERRED to §0 probe -> STEP-A amendment -> owner ratification)
> Date: 2026-06-22
> Author: CTO advisor
> Owner trigger: Khaled — "جاهز" (2026-06-22), following PHASE-42 TRULY CLOSED (tag phase-42-complete -> d3ed119).
> Chain: appends to the PHASE-42 closure chain. Supersedes nothing.

## 1. Context
PHASE-42 is TRULY CLOSED: the owner-facing built-project test-report surface is live (endpoint + viewer + S333/S334 + authority doc). The full conversation pipeline is COMPLETE (PHASE-34: OWNER_INTENT -> ... -> QUALITY_JUDGE -> DEPLOYMENT_OR_END -> LIVE_DELIVERABLE -> COMPLETE), and one real idea->COMPLETE build was already proven with a real gpt-4o Gate #10 call. What does NOT yet exist: a FULL, real, polished end-to-end build of a meaningful project that an outside reviewer could inspect and conclude only world-class engineers could have built it.

## 2. Objective
Drive one real idea -> ... -> COMPLETE build end-to-end with a real provider, producing: a working generated project + the owner-readable test report (the PHASE-42 surface) showing it passes + concrete evidence. First "demonstrable capability" milestone (Track B), now that the owner-evidence layer exists.

## 3. Decision (this proposal)
Open PHASE-43 to perform the above. EXACT SCOPE IS NOT LOCKED HERE; deferred to:
- §0: a READ-ONLY ($0) inventory of the real-build capability (pipeline states, provider selection, the prior Gate #10 cost profile, the build/test/report flow, candidate demo projects + cost estimates, gaps/risks).
- STEP-A amendment (A-1), authored after the probe and owner-ratified, fixing: the demo project, the "real" bar (built+tested? deployed?), the COST CEILING, and the deterministic closure gate.

## 4. Cost discipline (BINDING)
- §0 is mock/read-only: ZERO real LLM calls, $0.
- Real-provider runs are DEFERRED to a later STEP and require a SEPARATE, EXPLICIT owner cost-approval in chat at that point, with an estimated $ shown FIRST. Kill-bar $3 for the phase. No real key/call before that explicit approval.

## 5. Track A / §ARC
Expected: test-infra + minor wiring. A real provider call already routes through the sanctioned openAiAdapter (§ARC). Any NEW side-effect home or §ARC entry -> STOP -> amendment -> owner approval. §ARC frozen at 10 unless explicitly amended.

## 6. Closure gate (placeholder — finalized in A-1)
Deterministic, post-probe. Will include: a real idea->COMPLETE build producing a working project whose owner-readable test report PASSES, within the approved cost ceiling; Track A clean; status.json updated; checkpoint written; the run's real cost recorded.

## Amendment log
- (pending) A-1 — scope + cost ceiling + closure gate, authored after the §0 probe, owner-ratified.

---

## AMENDMENT A-1 — Scope Lock + Cost Ceiling + Closure Gate (owner-ratified)

> Ratified by owner Khaled in chat (2026-06-22): "موافق على توصياتك طالما باعلى درجات الاحترافية".
> Authored by CTO advisor after the §0 read-only probe. Appends to the PROPOSAL above; the PROPOSAL text is preserved unchanged.

### A-1.1 Demo project (scope lock)
A **Notes API** — a small REST backend: notes with title, body, category, tags[]; create/read/update/delete; list with filter-by-category + keyword search (title/body); input validation with structured error responses; **pure-JS in-memory storage (NO sqlite / no native deps)**. Target ~10–12 files, ~10–15 generated test scenarios. The owner-intent text fed at OWNER_INTENT is fixed in the STEP-A driver (see A-1.4).

### A-1.2 "Real" bar
COMPLETE = built + tested + an owner-readable test report showing PASS, rendered in the browser (Gate #10). **Live deployment is OUT of scope** for PHASE-43 (deployment_enabled=false; Gate 3 skipped). Rationale: the deployment leg is independently proven (PHASE-34 real run); excluding it bounds the first full real build from a new idea. A real deploy may be its own later phase.

### A-1.3 Cost ceiling (BINDING)
- Expected ~$0.20–0.50 for one clean full build.
- SOFT-STOP at $1.50 cumulative real spend for the run: STOP and report — do not continue.
- HARD KILL at $3.00 (phase kill-bar).
- Builder loopback cap = 2 (structural churn bound).
- The STEP-B real run requires a SEPARATE explicit owner spend-approval in chat (estimate shown first) before any real LLM call.

### A-1.4 Execution structure
- STEP A (mock, $0): build + dry-run the full-build driver (idea→COMPLETE, deployment-skip, gate auto-approve, loopback cap=2, trace+report capture); satisfy vision-lock + budget L3 prerequisites; prove the full chain walks clean in mock. NO real LLM calls.
- MID checkpoint → CTO verification.
- STEP B (REAL, gated): flip provider to openai, run the build once, capture the build dir + real last_report.json + actual cost. Requires the separate spend-approval.

### A-1.5 Deterministic closure gate
PHASE-43 is CLOSED only when ALL hold:
1. A real idea→COMPLETE build of the Notes API completed with provider=openai (gpt-4o), reaching the COMPLETE terminal state.
2. Real generated code on disk under artifacts/projects/<id>/ (not mock stubs); generated files match the generated spec.
3. RUN_TESTS produced a real last_report.json with overall_status=PASS (all generated scenarios pass).
4. The owner-readable report renders in the browser via GET /test-report.html?project_id=<id> — green PASS card, X/Y scenarios (Gate #10, owner-confirmed).
5. Actual real spend recorded (cost_ledger + status.json) and within the cost ceiling.
6. Track A clean (no new live-surface side effects; §ARC=10 frozen).
7. status.json next_phase advanced; STEP-A + STEP-B checkpoints written; a closure note records the idea, build, cost, and Gate #10 confirmation.

### A-1.6 Track A constraint
The full-build driver and any seeds are test-infra/spike (scripts/** + per-project artifacts), OUT of the Track A live-surface scope (apiServer.js + ai_os/** + runtime/**). No live-surface code is modified by PHASE-43. The real LLM call routes through the sanctioned openAiAdapter (§ARC). Any new side-effect home or §ARC entry → STOP → amendment → owner approval.
