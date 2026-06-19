# PHASE-40 · STEP B — CLOSURE CHECKPOINT (C2 cross-project write isolation)

**Date:** 2026-06-19 · **Status:** CLOSED (LOCAL commit; push/tag await CTO closure-diff + GO) · **Cost:** mock-only, **$0**
**Decision:** [DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation.md](../DECISION-2026-06-19-phase-40-c2-cross-project-write-isolation.md) (AMENDMENT 1=design approval · 2=mid-review · 3=closure)
**Mid-checkpoint (code + RED proof):** [step_a_mid.md](step_a_mid.md)

---

## 1. §A.3a — SEAM-BREADTH trace + decision

**Trace question:** is there ONE common production dispatch point through which the pipeline-stage
operations flow with a known project id?

**Finding — NO.** Evidence:
- The 10 pipeline stages are 10 SEPARATE apiServer endpoints, each calling its own conversationEngine
  method ([apiServer.js:1885-1951](../../../code/src/workspace/apiServer.js#L1885-L1951)):
  `formalize-spec`→formalizeSpec, `review-spec`→reviewSpec, `estimate-cost`→estimateCost,
  `env-report`→reportEnv, `design-tests`→designTests, `run-tests`→runTests, `review-project`→reviewProject,
  `document-project`→documentProject, `judge-quality`→judgeQuality, `deploy-project`→deployProject.
- Each route reads its own `body` via `readBody(req)` inside the single `http.createServer` handler
  ([apiServer.js:1589](../../../code/src/workspace/apiServer.js#L1589)); there is no early uniform
  project-id parse and no production loop runner (the loop advances endpoint-by-endpoint; the full-loop
  test scenarios use test helpers, not a production runner).

**Decision (per CTO ruling): buildProject-only seam + PHASE-41 follow-up.** Did NOT wire 10 individual
seams (CTO forbade). buildProject — the primary/structural write path (materializes arbitrary codegen;
S327-covered) — keeps the try/finally ambient seam. Remaining pipeline-stage coverage = scoped PHASE-41
follow-up. **Justification:** structural-confinement (each stage derives its write path from its own
`body.project_id`, e.g. `"artifacts/projects/" + normalizeProjectId(projectId) + "/orchestration/..."`, so it
cannot write cross-project) + PHASE-36 C1 fail-closed regression risk + defense-in-depth-only marginal value.
No seam was wired-then-reverted (none was attempted, since no clean single seam exists) → zero orchestration
risk introduced.

## 2. §A.3b — REAL-createProject test (DONE) + nesting check

**(a) Real-flow test S332** — drives the ACTUAL createProject via an in-process apiServer (POST
/api/projects/create), isolated temp root + ephemeral port + full teardown (S225/S228 pattern →
zero workspace pollution). Helper:
[phase40_real_create_test_helper.js](../../../code/src/testing/helpers/phase40_real_create_test_helper.js).
Flow: create A (becomes active) → create B WHILE A active → asserts `seam_present`,
`project_a_created`, `project_b_created_while_a_active`, `b_state_written` (B's project_state.json present +
correct id). Proves the PHASE-40 seam does NOT break real creation and the carve-out holds on the real flow
(B activated before its init-writes, apiServer.js:883-885; createProject runs in the ambient-null window).
Isolated run: **S332 PASS**.

**(b) Nesting check** — `grep createProject(` → only [apiServer.js:871](../../../code/src/workspace/apiServer.js#L871)
(definition) and [apiServer.js:1968](../../../code/src/workspace/apiServer.js#L1968) (the `/api/projects/create`
route handler). NO createProject call site is inside conversationEngine.buildProject / _buildProjectImpl →
creation is never nested under an ambient set by the buildProject seam. **Confirmed.**

## 3. §B.1 — FULL SU SUITE (mock, $0)
```
node --max-old-space-size=4096 bin/forge-test.js  → EXIT=0
ALL PASS — 325 passed, 0 failed, 5 skipped (330 total)   duration: 333664ms
```
321 baseline + 4 new (S329, S330, S331, S332) = 325 pass. No FAIL. The 5 skips are the pre-existing
environmental skips (unchanged). S326/S327/S328 + orchestration cluster S139/S140/S145-S156 all GREEN
(verified in the §A mid-run and in this full suite).

## 4. §B.2 — forge-doctor + Track A + §ARC
**(a) forge-doctor:**
```
node bin/forge-doctor.js  → EXIT=0
✓ HEALTHY — 0 critical, 6 warning      (35 checks; 6 known non-blocking warnings)
```
**(b) Track A (edited LIVE files):**
- `permissionRules.js` — grep `new OpenAI|require('openai')|child_process|fetch(|fs.*Sync(write|append|mkdir|unlink|rm)` → **0**.
- `permissionPolicy.js` — only fs hits = L31-32, the **pre-existing §ARC-9 permission-audit append** (untouched).
- `conversationEngine.js` — 0 fs writes; the single `child_process` token is a STRING inside a `NODE_BUILTINS`
  whitelist ([conversationEngine.js:1454](../../../code/src/ai_os/conversationEngine.js#L1454)) — data, not a call. My edit added only a lazy
  `require(permissionPolicy)` + the wrapper.
- `scenario_runner.js` / `phase40_real_create_test_helper.js` — test infrastructure (not live surface).
- **Net: my edits introduced ZERO new forbidden patterns.**

**(c) §ARC count:** `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md:371` → "§ARC count = **10** (§ARC-1 .. §ARC-10)".
**Unchanged — no new exception needed.**

## 5. §B.3 — status.json
next_phase → `PHASE-41-PENDING-DECISION`; PHASE-40 closure summary PREPENDED (prior history retained);
self_test fields → 325/0/5 (330). `node -e JSON.parse(...)` → **VALID; next_phase= PHASE-41-PENDING-DECISION; pass= 325**.

## 6. The mechanism (net production deltas)
| File | Change |
|---|---|
| `permissionPolicy.js` | `active_project` closure var (null default) + `setActiveProject`/`getActiveProject` (parallel to active_mode); pass `active_project` into `checkScope` |
| `permissionRules.checkScope` | new 6th param `ambientActiveProject`; unified rule `activeRef = ctx.active_project_id \|\| ambientActiveProject \|\| null` → deny `SCOPE_CROSS_PROJECT` when set and `<P> !== activeRef` (backward-compatible; reason/message unchanged) |
| `conversationEngine.buildProject` | thin wrapper = entry-point seam: `setActiveProject(projectId)` / try / `_buildProjectImpl(body)` / finally `setActiveProject(null)` (no leak, no body re-indent); `_getSeamPolicy()` lazy require |
| `scenario_runner._runDirectTool` | test-infra hook: `scenario.active_project` → `policy.setActiveProject` (+ finally clear) |

Exact code blocks: see [step_a_mid.md §3](step_a_mid.md).

## 7. Controls
| Scenario | Type | Asserts | Result |
|---|---|---|---|
| S329 | direct_tool | ambient=A, NO ctx, write→B ⇒ DENIED / SCOPE_CROSS_PROJECT | GREEN (RED-proven) |
| S330 | direct_tool | ambient=A, write→A ⇒ SUCCESS (no over-fire) | GREEN |
| S331 | direct_tool | ambient null, ctx-less write→new project ⇒ SUCCESS (carve-out) | GREEN |
| S332 | module_call | REAL createProject via in-process apiServer: create B while A active ⇒ created + state written | GREEN |
| S326/S327/S328 | — | PHASE-36 C2/C3 unchanged | GREEN |
| S139/S140/S145-S156 | — | orchestration cluster | GREEN |

**RED proof (S329):** neutralized `|| ambientActiveProject` in checkScope → S329 `status: expected DENIED, got SUCCESS` / `reason: undefined` (the exact deferral-(a) hole); term restored, GREEN re-confirmed.

## 8. Byproducts (NOT staged)
`progress/status.json` legitimate PHASE-40 edit IS staged. NOT staged: `artifacts/llm/decision_log.json`
(+1 test_apiserver_s25 entry) and untracked `artifacts/projects/test_apiserver_s28/` — leakage from a
full-suite run accidentally launched then stopped during STEP A. Selective staging per CTO ruling (3).

**STOP — awaiting CTO closure-diff verification + push GO. No push, no tag without GO.**
