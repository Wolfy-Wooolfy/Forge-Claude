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

---

## AMENDMENT A-4 — Build-quality root fix: materializer AC-starvation + id-coherence (owner-directed)

> Owner directive (2026-06-22): "مش عايز نسيب اي حاجة فيها مشاكل — أعلى درجات الاحترافية" + "موافق". Authored by CTO after the §S probe + CTO verification of the build code. Appends to A-3; prior text preserved.

### A-4.1 Findings (CTO-verified by reading code)
Post-A-3 re-run reached RUN_TESTS with a full 9-scenario suite, FAIL 5/9. Two roots:
- ROOT-1 (materializer AC-starvation): the code-writer is the MATERIALIZER (the builder is a planner only). _buildCodegenPrompt (materializerEngine.js) feeds the LLM only file paths + spec.scope (one sentence) + design.design_summary (one sentence) — NEVER spec.acceptance_criteria (CTO-verified: 0 occurrences in materializerEngine.js). So code is written blind to the 7 ACs → no GET /:id route (AC-4), no 404-on-missing for PUT/DELETE (AC-5/6). Supersedes A-3.4's architect-schema hypothesis: the real gap is the materializer's starved codegen prompt.
- ROOT-2 (id-coherence): test_designer assumes /notes/1 (A-2's "first id=1") but the materializer emitted id: Date.now() → mismatch. The harness has no setup-response capture and no templating (CTO-verified) — a scenario cannot use the id its own create-first POST returned.
Real spend re-run #2 $0.19965 (cumulative PHASE-43 ≈ $0.516; within ceiling).

### A-4.2 Remediation (fixes all 4 at root; SU-safe)
- §S.3 — Materializer codegen enrichment (materializerEngine.js _buildCodegenPrompt; runtime/** live, prompt-construction): ADD the FULL spec.acceptance_criteria (verbatim) + each file's plan description into the codegen prompt, with a directive to implement EVERY acceptance criterion completely — every route (incl. GET /:id), every status code (incl. 404 on missing for GET/PUT/DELETE), and a data layer that signals found/not-found so handlers can 404. Keep the existing scope/design_summary; ADD the ACs. SU-safe (materializer mocks TAG-matched).
- §S.2 — id-coherence structural: (a) harness_runner.js (runtime/** live, additive, backward-compatible): capture each setup http_request response into a context; resolve placeholders (e.g. {{created.id}}) in the execution URL/body from that context; literal URLs without a placeholder behave exactly as before. (b) test_designer prompt (18b, append-to-tail, TAG-safe): mutation/get-by-id scenarios target the id returned by their create-first setup (via the placeholder), never a hardcoded /1.

### A-4.3 SU-safety + Track A
materializer + builder + test_designer SU mocks are TAG-matched → prompt/codegen edits SU-safe. Harness change additive + backward-compatible (templating fires only on a placeholder). Live files touched by A-4: materializerEngine.js + harness_runner.js (both runtime/**; prompt-construction/additive; no forbidden patterns). No new §ARC; §ARC=10. Guard: full SU suite green + forge-doctor 35/0.

### A-4.4 Sequencing — §S.1 (loopback self-correction) → A-5
buildProject re-invokes with identical inputs and never reads last_report.json/loopback_signal.json (CTO-verified: 0 occurrences) → the loopback rebuild re-rolls blind (why 6/9→5/9). This self-correction defect WILL be fixed as A-5 (feed failing assertions from last_report.json into the rebuild's codegen). Sequenced AFTER A-4 for risk isolation — the A-4 materializer enrichment likely makes the FIRST build correct (loopback may not fire for this demo); the blind-rebuild defect is fixed regardless in A-5.

### A-4.5 Execution + closure
A-4 implementation + SU re-verify is $0. The next real re-run (~$0.16, same A-1.3 envelope) requires a fresh explicit owner spend-approval. Closure gate A-1.5 unchanged.

---

## AMENDMENT A-6 — Runnable server-entry contract + scope discipline (owner-directed)

> Owner directive: highest-professionalism / fix every issue properly. Authored by CTO after real re-run #3 + CTO verification of the generated code. Appends to A-4. A-5 (loopback self-correction) remains deferred and is sequenced AFTER A-6. Prior text preserved.

### A-6.1 Real re-run #3 result (CTO-verified)
Single-attempt real build (cap=1), $0.17874 (cumulative PHASE-43 ≈ $0.695; within ceiling). Stopped at RUN_TESTS with ENTRY_UNRESOLVED — 0/9 scenarios ran. Two findings:
- GOOD — A-4 succeeded at the code level (CTO-verified by reading generated src/NotesAPI.js + InMemoryStorage.js): GET /notes/:id → 404-on-missing, PUT /:id → 404, DELETE /:id → 404; data layer signals found/not-found (read→null, update/delete→null/false). All four prior failures (T-4/T-6/T-7/T-9) are fixed in the generated code. The AC-enrichment reached the materializer and was honored.
- BLOCKER (new, upstream) — the spec produced a router-only library: src/NotesAPI.js exports a router (module.exports = router) with NO bootstrap file that creates the app and calls app.listen(PORT). files_to_create had no entry/server file (it had NotesAPI router, InMemoryStorage, ValidationModule, helpers/serializer [over-scoped file persistence — violates the in-memory non-goal], test/NotesAPITest [a test file the build should not emit]). The L5b harness spawns a server + makes HTTP requests; with no runnable entry it fails entry-derivation → ENTRY_UNRESOLVED. Re-run #2 happened to emit src/server.js with .listen (ran); #3 did not. The pipeline has no contract that an HTTP-service build is runnable via a conventional entry — structural non-determinism.

### A-6.2 Remediation — runnable server-entry contract (SU-safe; build-side)
- architect_v1 (18b, append-to-tail, prompt[0:500] preserved): the design for an HTTP API / web service MUST include a runnable server-entry component (a bootstrap that creates the app, mounts all routes/handlers, listens on a port). Respect stated non-goals strictly (in-memory storage ⇒ NO file-persistence/backup components); do not add files/features outside the declared scope.
- spec_writer_v1 (18b, append-to-tail, prompt[0:500] preserved): files_to_create MUST include the entry/server file using the harness-recognized convention (per A-6.3), whose purpose is to create the app, mount all routes, and listen on process.env.PORT || <default>. Honor non-goals (in-memory ⇒ no persistence files). Do NOT include test files in files_to_create — testing is the harness's responsibility.
- materializer directive (materializerEngine.js, live, SU-safe — tag-matched): reinforce — the entry/server file must instantiate the app, mount all routes, and call app.listen(process.env.PORT || <default>) so the project boots; in-memory only (no file writes for data).

### A-6.3 Entry-convention alignment (implementation prerequisite)
Before editing prompts, read the entry-derivation logic (source of ENTRY_UNRESOLVED) and record its accepted conventions (file names such as src/server.js / src/index.js, and/or package.json "main", and/or a .listen scan). The spec_writer instruction names the SAME convention the harness accepts, so the produced entry is discoverable.

CTO-verified (conversationEngine.js:1419-1440): the entry is derived from the build_manifest by (1) an ENTRY_PRIORITY filename match — src/index.js, src/server.js, src/app.js, index.js, server.js, app.js (priority order); else (2) a `.listen(` scan — exactly one manifest .js containing the substring `.listen(`; else (3) ENTRY_UNRESOLVED. package.json "main" is NOT consulted. The chosen instruction pins src/server.js, which resolves on the ENTRY_PRIORITY filename branch ALONE (content-blind — the priority match short-circuits before the `.listen(` fallback scan is reached). The required app.listen(process.env.PORT || 3000) is for actual RUNNABILITY (so the derived entry boots when the harness spawns it), enforced by prompt — the harness does not verify `.listen(` for a priority-named entry. [Adversarial-review strengthening] Because entry-EXISTENCE otherwise rests solely on spec_writer listing src/server.js, the materializer directive is made SELF-HEALING: if the plan contains no entry file, the codegen ALSO generates src/server.js with the bootstrap — defense-in-depth so a single spec_writer miss does not recur ENTRY_UNRESOLVED.

### A-6.4 SU-safety + Track A
architect/spec_writer SU mocks are prompt[0:500]-matched → appends are append-to-tail (prompt[0:500] byte-identical; guard S83/S85/S86/S88 green). The materializer is tag-matched → its directive addition is SU-safe. Live file touched by A-6: materializerEngine.js only (prompt-construction; no forbidden patterns). No new §ARC; §ARC=10. Guard: full SU suite green + forge-doctor 35/0.

### A-6.5 Sequencing + execution
A-6 is sequenced BEFORE A-5. A-6 implementation + SU re-verify is $0. The next real re-run #4 (cap=1, single attempt — loopback still blind until A-5) requires a fresh explicit owner spend-approval (~$0.16). Run protocol unchanged: first build is the only real chance; if it stops or returns <9/9, STOP and inspect.

---

## AMENDMENT A-7 — Per-role engine timeout tuning (owner-directed)

> Owner directive: fix every issue properly / cost is not the deciding factor. Authored by CTO after real re-run #4 + CTO verification of the timeout layering. Appends to A-6. A-5 (loopback self-correction) remains deferred and is now sequenced AFTER the next diagnostic run (re-run #5) so it can be designed against real failure data. Prior text preserved.

### A-7.1 Real re-run #4 result (CTO-verified)
Single-attempt real build (cap=1), $0.0937 (cumulative ≈ $0.789; within ceiling). Stopped at TEST_DESIGN with test_error TEST_DESIGNER_TIMEOUT — BEFORE reaching BUILDER, so A-6's server-entry fix was not exercised. CTO-verified:
- The engine wraps each role call in a 30s Promise.race (conversationEngine.js); the designTests call hit the 30s ceiling before the real gpt-4o response returned. NOT a JSON/parse failure (A-3 json_object works — designTests succeeded in re-run #2/#3). The richer full-scope spec (post-A-6) + normal gpt-4o latency pushed test-plan generation past 30s; the call was abandoned in-flight (no ledger row, ~$0 wasted).
- The 30s Promise.race pattern is present on ELEVEN role calls (CTO-verified): ARCHITECT, SPEC_WRITER, REVIEWER (x2), BUILDER, DOCUMENTATION, QUALITY_JUDGE, COST_ESTIMATOR, TEST_DESIGNER, ENV_REPORT, DEPLOYMENT — all 30000ms. Critically BUILDER_TIMEOUT (the materializer codegen path, the largest single output) is also 30s — a designTests-only fix would just move the timeout to the materializer on re-run #5.
- The adapter HTTP timeout is 60s (openai_adapter.js, input.budget_ms || 60000) — looser than the engine's 30s, so the engine pre-empts.

### A-7.2 Remediation — comprehensive per-role timeout tuning (SU-safe)
- conversationEngine.js: raise ALL eleven per-role Promise.race timeouts from 30000ms to 150000ms (consistent across roles; the engine timeout must be ≥ the adapter timeout so the adapter's own timeout/retry governs the network wait, with the engine as a backstop).
- openai_adapter.js: raise the per-call HTTP timeout default from 60000ms to 120000ms (input.budget_ms || 120000) so the largest generation (materializer codegen) completes within the adapter network timeout.
- Net: engine 150s ≥ adapter 120s; both comfortably exceed observed generation times. Tuning constants only; no behavior/logic change.

### A-7.3 SU-safety + Track A
SU runs against the instant mock adapter → every role call resolves immediately, far inside any timeout → raising the timeouts cannot change any SU outcome. Guard: identify any SU scenario asserting a *_TIMEOUT path and preserve it; the full suite must stay 327/0/5. Live files touched by A-7: conversationEngine.js + openai_adapter.js (timeout constants; no forbidden patterns). No new §ARC; §ARC=10.

### A-7.4 Sequencing + execution
A-7 is the immediate blocker (without it the pipeline cannot reach BUILDER, so A-6 cannot be exercised). A-5 is sequenced AFTER re-run #5 so it can be designed against real failure data (the exact failing assertions). A-7 implementation + SU re-verify is $0. The next real re-run #5 (cap=1, single attempt — loopback still blind) requires a fresh explicit owner spend-approval (~$0.16). Run protocol unchanged: first build is the only real chance; if it stops or returns <9/9, STOP and inspect.

---

## AMENDMENT A-8 — Spec/design completeness: ID scheme, tags, response formats (owner-directed)

> Owner directive: fix every issue properly. Authored by CTO after real re-run #5 + CTO verification of the reviewer findings. Appends to A-7. A-5 (loopback self-correction) remains sequenced after the next run (re-run #6) so it can be designed against real build-failure data. Prior text preserved.

### A-8.1 Real re-run #5 result (CTO-verified)
Single-attempt real build (cap=1), $0.03294 (cumulative ≈ $0.822; within ceiling). A-7 worked — architect, spec_writer, and reviewer all completed within 150s (no timeout; prior blocker resolved). Stopped at REVIEWER_SPEC, verdict REJECTED → ESCALATED, 3 BLOCKER findings (CTO-verified from the trace):
- BLOCKER-1 (tags): acceptance criteria reference a `tags` field, but the design does not specify how tags are stored/validated.
- BLOCKER-2 (ID assignment): neither spec nor design specifies how new-note IDs are generated. Same root as the id-coherence issue A-4 addressed at the build level.
- BLOCKER-3 (response formats): the design does not specify the JSON structure for CRUD success/error responses.
- Plus WARN (scalability) + INFO (input sanitization).
Note: reviewSpec verdict is non-deterministic across runs (APPROVED_WITH_CONCERNS in re-run #2/#3/#4; REJECTED here). reviewSpec ESCALATED is a reviewer-gate before BUILDER — distinct from the RUN_TESTS→BUILDER loopback (A-5 does not apply here).

### A-8.2 Remediation — spec/design completeness (SU-safe; prompts-only)
- architect_v1 (18b, append-to-tail, prompt[0:500] preserved): the design MUST specify (a) the ID-generation scheme — server-assigned, a sequential integer starting at 1 (auto-generated, never user-supplied); (b) how every declared field (including tags) is stored, validated, and serialized; (c) the JSON response shape for success AND error on every operation.
- spec_writer_v1 (18b, append-to-tail, prompt[0:500] preserved): the acceptance_criteria + spec MUST carry the same — server-assigned sequential-integer IDs, tags handling/validation, and success/error JSON response formats — so design and spec are internally consistent (no omission for the reviewer to reject).

### A-8.3 Why this also helps downstream
A specified server-assigned sequential-integer ID scheme (a) removes BLOCKER-2; (b) gives the materializer a concrete id contract (reinforcing A-4 route quality); (c) aligns with the harness — both A-4's {{created.id}} and a literal /notes/1 resolve when the first created id is 1. tags + response-format specification removes BLOCKER-1/3 and improves the build contract.

### A-8.4 SU-safety + Track A
architect/spec_writer SU mocks are prompt[0:500]-matched → appends are append-to-tail (prompt[0:500] byte-identical; guard S83/S85/S86/S87/S88 green). NO live code file is touched by A-8 (prompts only, in 18b_ROLE_PROMPTS.md) — Track A live surface unchanged. No new §ARC; §ARC=10. Guard: full SU suite green + forge-doctor 35/0.

### A-8.5 Sequencing + execution
A-8 removes the reviewer-gate blocker so re-run #6 can reach BUILDER + RUN_TESTS with a reviewer-passing, complete spec. A-5 (test-failure loopback) is sequenced after re-run #6 so it is designed against real build-failure data from a complete-spec build. A-8 implementation + SU re-verify is $0. The next real re-run #6 (cap=1, single attempt — loopback still blind) requires a fresh explicit owner spend-approval (~$0.16). Run protocol unchanged.

---

## AMENDMENT A-9 — Reviewer (spec phase) calibration (owner-directed)

> Owner directive: fix every issue properly. Authored by CTO after real re-run #6 + CTO verification that A-8 took effect yet the reviewer rejected on new/invented grounds. Appends to A-8. A-5 (loopback) remains sequenced after the first run that reaches BUILDER. Prior text preserved.

### A-9.1 Real re-run #6 result (CTO-verified)
Single-attempt real build (cap=1), $0.03701 (cumulative ≈ $0.879). Stopped at REVIEWER_SPEC, verdict REJECTED → ESCALATED (2nd consecutive). CTO-verified:
- A-8 WORKED: the reviewer no longer raises the re-run-#5 BLOCKERs (ID scheme, tags, error-response existence) — the spec now carries AC-6 (server-assigned sequential IDs from 1) + tags + AC-7 (error responses).
- The reviewer (phase A) found DIFFERENT BLOCKERs and rejected: (1) validation constraints for non-title fields "ambiguous" @ AC-1; (2) "duplicate validation for unique fields like title, if applicable" @ spec — an INVENTED requirement (the owner/vision never stated title is unique; the "if applicable" hedge confirms the reviewer is unsure it even applies); (3) exact error-JSON structure not specified @ AC-1/AC-7. Plus WARN (in-memory scalability).
- Verdict is over-strict + non-deterministic: APPROVED_WITH_CONCERNS in re-run #2/#3/#4, REJECTED in #5/#6. Adding spec detail (the A-8 pattern) does not reliably satisfy it — it finds a new "BLOCKER" each pass, including requirements never requested.

### A-9.2 Root cause
Not a spec/architect deficiency curable by more detail (whack-a-mole). Root = the reviewer's severity calibration: it classifies "could be more detailed / unstated-but-plausible / reasonable-default unspecified" as BLOCKER (→ REJECTED → ESCALATED, which stops the pipeline) and invents requirements outside the stated scope. The reviewer_v5 prompt's severity/anti-fabrication discipline is scoped to Phase B (code review); the Phase A (spec review) responsibilities ("identify edge cases not covered", "security/scalability concerns not addressed") lack the same BLOCKER discipline. Known reviewer-strictness backlog item; now on the critical path (reviewer gate blocked two consecutive runs before BUILDER).

### A-9.3 Remediation — surgical reviewer (spec phase) calibration (SU-safe; prompts-only)
Append-to-tail (after the protected 500-char prefix, before "Output format:" — the reviewer_v5 convention) a Phase-A severity clause to reviewer_v5 in 18b:
- BLOCKER is reserved for issues that genuinely block a correct implementation: an internal contradiction (spec vs design), an acceptance criterion with no corresponding design/capability, or ambiguity so severe the build cannot proceed.
- "Would benefit from more detail," "consider edge case X," or "the exact format/constraint is unspecified but a reasonable default exists" → WARN/INFO → verdict APPROVED_WITH_CONCERNS (pipeline advances, concerns recorded), NOT BLOCKER.
- The reviewer MUST NOT invent requirements the owner/vision/spec did not state (no uniqueness, auth, persistence, or field constraints never requested). Review against the stated scope and non-goals, not an idealized superset.
- Real gap-detection preserved: genuine missing capabilities and contradictions remain BLOCKER (the ID-scheme gap from re-run #5 would still be a BLOCKER).

### A-9.4 Why this is safe
The calibration re-classifies severity; it does not blind the reviewer. The downstream RUN_TESTS gate (L5b harness) is the actual correctness gate — a build that does not meet the acceptance criteria fails the tests regardless of the reviewer verdict. An over-strict reviewer that REJECTs buildable specs is a worse failure mode for the goal than advancing with recorded concerns. Genuine contradictions/missing-capabilities still block.

### A-9.5 SU-safety + Track A
Reviewer SU mocks (S89/S90 prompt-prefix-matched; bridge S261–S266 TAG-matched) return canned verdicts → the calibration text cannot change a mock outcome; the append is after the protected 500-char prefix (prompt[0:500] byte-identical) — verified. NO live code file touched (prompts only, 18b) — Track A live surface unchanged. No new §ARC; §ARC=10. Guard: full SU suite green + forge-doctor 35/0.

### A-9.6 Sequencing + execution
A-9 unblocks the reviewer gate so re-run #7 can reach BUILDER + RUN_TESTS with a complete, reviewer-passing spec. A-5 (build loopback) is sequenced after re-run #7 (designed against the real build-failure data we will finally see). A-9 implementation + SU re-verify is $0. The next real re-run #7 (cap=1) requires a fresh explicit owner spend-approval (~$0.16). Run protocol unchanged.

---

## AMENDMENT A-10 — Endpoint-path coherence: serve exactly the AC-declared paths (owner-directed)

> Owner directive: fix every issue properly. Authored by CTO after real re-run #7 — the FIRST run to reach RUN_TESTS — + CTO verification of the generated code. Appends to A-9. A-5 (build loopback) is now data-ready (clean RUN_TESTS failure data from this run) and is the committed next durable step. Prior text preserved.

### A-10.1 Real re-run #7 result (CTO-verified) — BREAKTHROUGH
Single-attempt real build (cap=1), $0.18678 (cumulative ≈ $1.087). FIRST run to reach RUN_TESTS. All prior gates passed (CTO-verified from generated code + trace): A-9 ✅ reviewSpec APPROVED_WITH_CONCERNS (advanced); A-7 ✅ designTests no timeout; A-6 ✅ proper src/server.js entry (app + app.listen(process.env.PORT||3000)) booted; A-8 ✅ data layer uses server-assigned sequential int from 1 (this.currentId=1; const id=this.currentId++), not Date.now(); A-4 ✅ 404-on-missing in routes + data layer signals not-found + the fail-closed {{created.id}} resolver correctly errored on the 404'd create. RUN_TESTS executed: 10 scenarios, FAIL — 3 pass / 4 fail / 3 error.

### A-10.2 Root cause — a single endpoint base-path mismatch
All 7 non-passing scenarios trace to ONE defect (CTO-verified): src/server.js mounts the router at /api (app.use('/api', notesRouter)) while src/routes/notes.js defines routes with the /notes prefix (router.post('/notes', …)). The build serves /api/notes, but the acceptance criteria + generated test scenarios use /notes → every /notes request 404s. T-1/T-2/T-6/T-10 FAIL (404); T-3/T-4/T-5 ERROR (create-first 404'd → {{created.id}} unresolved, A-4 fail-closed = correct); T-7/T-8/T-9 PASS for the wrong reason (everything 404s). The materializer invented an /api base-path prefix the ACs never declared. The build is otherwise high-quality — one coherence bug from green.

### A-10.3 Remediation — endpoint-path coherence (SU-safe)
- materializer directive (materializerEngine.js _buildCodegenPrompt; live, SU-safe — tag-matched): the served paths MUST exactly equal the AC-declared paths. When mounting a router in the entry file, the mount path combined with the router's route paths MUST equal the AC-declared paths. Do NOT introduce a base-path/version prefix (e.g. /api, /v1) unless the ACs explicitly include it. If the ACs say POST /notes, the app must serve POST /notes (not /api/notes).
- spec_writer_v1 (18b, append-to-tail, prompt[0:500] preserved): the spec must state the exact endpoint base path; absent an explicit owner/vision request for a prefix, the base path is root (no /api, no version prefix).

### A-10.4 SU-safety + Track A
The materializer SU mocks are tag-matched → the directive addition is SU-safe. The spec_writer append is append-to-tail (prompt[0:500] preserved; guard S86/S87/S88 green). Live file touched: materializerEngine.js only (prompt-construction; no forbidden patterns). No new §ARC; §ARC=10. Guard: full SU suite green + forge-doctor 35/0.

### A-10.5 Sequencing + execution
A-10 targets the single remaining defect with high confidence. A-5 (build loopback self-correction) is now data-ready (this run produced the clean RUN_TESTS failure data) and is the committed next durable step. A-10 implementation + SU re-verify is $0. The next real re-run #8 (cap=1) requires a fresh explicit owner spend-approval (~$0.16). Run protocol unchanged.

---

## CLOSURE — PHASE-43 COMPLETE ✅

> Closed 2026-06-28. The A-1.5 closure gate is met: a real idea→COMPLETE full-scope build with an owner-confirmed PASS report. CTO-verified + owner Gate #10 browser-confirmed.

### Closure evidence (A-1.5)
- Real idea→COMPLETE with openai/gpt-4o (re-run #8, loop 25c3cb10): OWNER_INTENT → ARCHITECT → SPEC_WRITER → reviewSpec APPROVED → COST → ENV (Gate 1 APPROVE) → TEST_DESIGN → BUILDER → RUN_TESTS PASS 9/9 → REVIEWER_CODE_AND_SECURITY → DOCUMENTATION → QUALITY_JUDGE (Gate 2 APPROVE_SHIP) → DEPLOYMENT (skipped, deployment_enabled=false) → LIVE_DELIVERABLE → COMPLETE.
- Full scope: the generated Notes API implements CRUD + category filter (?category=) + keyword search (?q= on title/body) + title validation + server-assigned sequential IDs from 1 + 404-on-missing. Real code on disk (src/server.js, notesRouter.js, notesController.js, notesStorage.js), not stubs.
- RUN_TESTS PASS 9/9 (T-1..T-9: create 201, list array, get-by-id 200, get/update/delete not-found 404, update 200, delete 204, invalid-title 400). Confirmed via the trace's embedded report + the report endpoint (http 200, PASS 9/9, per-scenario assertions).
- Gate #10 (the only true closure gate): owner opened http://127.0.0.1:3100/test-report.html?project_id=phase43_notes_api and confirmed the green PASS 9/9 card (report ran_at 2026-06-28T08:28:13.806Z).
- Cost: $0.29544 for the passing run; cumulative PHASE-43 real spend ≈ $1.382 (within the $3 ceiling).
- Track A clean throughout (live surface = 4 cumulative files: conversationEngine.js, openai_adapter.js, harness_runner.js, materializerEngine.js); §ARC frozen at 10; SU 327/0/5.

### The journey (8 real runs, 10 amendments — each real run surfaced one gate)
A-1 (demo scope) · A-2 (self-containment F1 + scope-fidelity F2) · A-3 (JSON-mode reliability) · A-4 (materializer AC-enrichment: route quality + id-coherence) · A-6 (runnable server-entry + self-healing) · A-7 (per-role timeout tuning) · A-8 (spec completeness: ID scheme + tags + response formats) · A-9 (reviewer spec-phase calibration) · A-10 (endpoint-path coherence). Each fix is a durable improvement to Forge's real-build path.

### Forward backlog (owner-gated; not blocking closure)
- A-5 (build loopback self-correction) — committed durable-robustness item; deferred throughout PHASE-43 because the milestone was reached on the first passing attempt (the loopback never fired). Data-ready (clean RUN_TESTS failure data captured in re-runs #2/#7).
- RUN_FORGE.bat does not start the server (owner runs INSTALL_FORGE.bat) — minor ops item to diagnose.
- The build is LLM-generated (non-deterministic); A-2..A-10 harden the common path; a different idea/run may surface new coherence gaps — A-5 is the general convergence net.
- Existing backlog: cross-project C2 coverage, Anthropic provider switch (pending key), reviewer/security prompt-tuning continuation.

PHASE-43 status: CLOSED. next_phase: PHASE-44-PENDING-DECISION.
