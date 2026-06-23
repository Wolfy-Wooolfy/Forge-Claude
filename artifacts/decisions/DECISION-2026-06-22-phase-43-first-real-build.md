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

---

## AMENDMENT A-2 — Remediation (F1+F2) + A-1.6 live-surface amendment (owner-ratified)

> Ratified by owner Khaled in chat (2026-06-22): "موافق على توصيتك طالما باعلى درجات الاحترافية" (the remediate-then-re-run path). Authored by CTO after the §R.0 probe (localized both findings; confirmed SU blast-radius). Appends to A-1; preserves prior text.

### A-2.1 Findings (CTO-verified)
- F1 (test_designer self-containment): T-3/T-4 emit update/delete on /notes/1 with setup=start_server only + a phantom "populated_db" fixture; harness seeds nothing → correct code returns 404 → fail. Root: (a) harness setup runs only start_server; (b) test_designer prompt doesn't require self-contained scenarios.
- F2 (scope fidelity): idea_summary.json + vision.md carry full scope (title, body, category, tags, filter-by-category, keyword search); architect_design.json is the FIRST drop (generalized to "filtering and searching", no fields). spec_writer can't recover (input = {design, project_id} only); builder built the reduced spec (drifted body→content). Root: architect generalized the scope. Structural contributors (BACKLOG, not fixed here): architect OUTPUT_SCHEMA has no slot for entity fields/features/endpoints; spec_writer never receives the intent.

### A-2.2 Remediation (minimal-diff, SU-safe)
- F1-harness (the ONLY Track A live file touched): code/src/runtime/builtproject/harness_runner.js — ADD an additive branch in the setup-actions loop: if action.type === "http_request" → await _httpRequest(action) (reuse existing helper). start_server unchanged. No new §ARC; §ARC stays 10.
- F1-test_designer prompt (docs/10_runtime/18b_ROLE_PROMPTS.md § test_designer_v2, APPEND-to-tail): every scenario self-contained; for any op on an existing resource (update/delete/get-by-id), setup.actions must first create it via an http_request POST and target the returned id; no reliance on a pre-populated store or phantom fixture.
- F2-architect prompt (§ architect_v1, APPEND-to-tail): preserve owner scope literally — enumerate the entity's fields and name each specific capability (filter-by-<field>, keyword-search-on-<fields>) explicitly in design_summary/data_flow/integration_points; never collapse to generic "filtering and searching"; preserve owner field names verbatim.
- F2-spec_writer prompt (§ spec_writer_v1, APPEND-to-tail): derive acceptance_criteria covering every data field and every specific capability in the design; preserve field names; do not drop or rename.

### A-2.3 SU-safety (CTO-verified)
All three prompt edits are APPEND-TO-TAIL only. test_designer is TAG-matched (safe regardless). architect_v1 (1407 chars) + spec_writer_v1 (1514 chars) exceed 500, so tail-append leaves prompt[0:500] unchanged → S83/S85/S86/S88 stay green. No SU scenario asserts prompt content. The harness change is additive (existing branches unchanged) and must keep S120–S127 + S333/S334 green; a focused deterministic test proves the new setup http_request branch executes.

### A-2.4 A-1.6 amendment
A-1.6 ("no live-surface code modified") is amended: the remediation modifies exactly ONE Track A live file — harness_runner.js (additive, reusing _httpRequest, no new §ARC) — plus role prompts in docs/ (append-only, not runtime code). Guard: full SU suite stays green (+ the new harness test) and forge-doctor 35/0.

### A-2.5 Execution + closure
Fix pass is $0 (edits + SU re-run in mock + mock full-build dry-run). The STEP-B real re-run (real spend ~$0.16, same A-1.3 envelope: soft-stop $1.50 / hard-kill $3 / cap=2) requires a fresh explicit owner spend-approval. Closure gate A-1.5 unchanged: real idea→COMPLETE FULL-SCOPE build (category/tags/filter present), last_report PASS, owner Gate #10 green, cost within ceiling, §ARC=10, SU green.

### A-2.6 Honest caveat
The prompt-tune is the minimal-diff path to the green and is likely sufficient, but structurally fragile (scope rides as prose through a schema with no field slot; spec_writer is intent-blind). If the real re-run still drops scope, the durable fix (structured key_features/data_entities slot in architect OUTPUT_SCHEMA and/or passing intent to spec_writer) is a deeper, separately-scoped change (backlog).

---

## AMENDMENT A-3 — JSON-reliability hardening (owner-ratified)

> Ratified by owner Khaled in chat (2026-06-22): "موافق على توصيتك" + directive "مش عايز نسيب اي حاجة فيها مشاكل — أعلى درجات الاحترافية" (close the class properly, not a band-aid). Authored by CTO after the post-A-2 real re-run + CTO verification. Appends to A-2; prior text preserved.

### A-3.1 Finding (CTO-verified)
Post-A-2 real re-run cleared architect→spec→reviewer→cost→env→Gate1 and stopped at TEST_DESIGN. F2 (scope fidelity) RESOLVED at the design/spec layer (architect_design + spec carry body/category/tags/filter-by-?category=/keyword-?q=; body→content drift fixed; 7 concrete ACs). New blocker: test_designer real gpt-4o output was unparseable JSON (~14KB / 3524 tokens, syntax slip near line 568). Root (CTO-verified in openai_adapter.js): the gpt-4o role request sends {model, messages} only — no response_format (no JSON-mode guarantee) and no max_tokens (default cap risks truncation). Real spend this run $0.156 (cumulative PHASE-43 ≈ $0.317; within ceiling).

### A-3.2 Remediation (robust — closes the JSON-reliability class)
code/src/runtime/agents/adapters/openai_adapter.js (the only live file touched by A-3; §ARC-sanctioned):
- (a) Add response_format: { type: "json_object" } to the gpt-4o (non-reasoning) role request → forces structurally valid JSON, eliminating syntax slips. Precondition CTO-verified: all role prompts contain "json".
- (b) Add explicit max_tokens: 8000 to the gpt-4o role request (mirrors the reasoning path's max_completion_tokens) → prevents truncation of large outputs.
- The reasoning (gpt-5*) dialect already sets max_completion_tokens and is unchanged. No new §ARC; §ARC stays 10.

### A-3.3 SU-safety
SU is mock-only and does not exercise the real openai_adapter request path, so the change cannot alter mock outputs; the full SU suite must still pass (confirming no load/wiring break). Real effect is validated only by the real re-run. All roles already emit/parse JSON (aligned with json_object), so none regresses.

### A-3.4 Known structural fragility (NOT fixed here — A-4 after the green)
F2 was fixed via prompt (A-2), which relies on LLM discipline; the underlying fragility remains: architect OUTPUT_SCHEMA has no structured slot for entity fields/features/endpoints (scope rides as prose); spec_writer never receives the intent. A durable structural fix (key_features/data_entities slot in the architect schema; and/or passing intent to spec_writer) is recommended as a dedicated pass (A-4) AFTER the pipeline first reaches an end-to-end full-scope green — hardening a proven baseline rather than big-bang.

### A-3.5 Execution + closure
A-3 implementation + SU re-verify is $0. The next real re-run (~$0.16, same A-1.3 envelope) requires a fresh explicit owner spend-approval. Closure gate A-1.5 unchanged.
