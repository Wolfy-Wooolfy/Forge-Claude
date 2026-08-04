# DECISION-2026-08-03-phase-55-hardening-batch

**Date:** 2026-08-03 (Step 0 posted + CTO review ACCEPTED WITH RULINGS + scoped D0 GO, same day)
**Status:** APPROVED — CTO-authored under owner delegation ("قرر بنفسك … موافق على توصياتك بأعلى درجات الاحترافية", 2026-08-03); Step 0 review ACCEPTED with rulings R-11..R-20
**Author:** CTO (Claude) + CC Step-0 findings, bidirectional Trust+Verify
**Phase:** PHASE-55 — HARDENING BATCH (zero new capability)
**Baseline:** tag `phase-54-complete` (annotated `e0a98826…`) → closure commit `9e35e46e`; origin/main `b498565` = two owner commits above closure (`.claude/settings.local.json` + stage_closure.md R-51 note — neither touches live code; CC-verified: `git diff 9e35e46e..HEAD --stat` = exactly those two files). SU baseline **376/0/5 (381), exit 0** · §ARC 10 · L2 81 · roles 13 · doctor 35 checks.

---

## 1. Problem / goal

PHASE-54 closed with six named backlog items. PHASE-55 takes the five hardening-class
ones as a scope-locked batch — no new capability, every item independently revertible:

- **W-1 SPEND VISIBILITY** (closes R-40/PHASE-54): every real provider call appears in
  ONE ledger the cap can read. Today the cap covers agent-ledger calls only; legacy
  Stage-A providers spend unmetered (proven live 2026-08-02). Plus a written
  RECOMMENDATION (no code) on ledger estimator accuracy.
- **W-2 OWNER ESCAPE ON NON-CONVERGENCE** (closes R-45/PHASE-54): a first build against
  a failing/unsatisfiable frozen test plan currently burns to ITERATION_CAP without ever
  consulting the owner. Detect non-convergence, route to the owner via the EXISTING
  review-gate surface.
- **W-3 ENVIRONMENT GUARD FOR S57** (closes R-14/PHASE-54): apply the sanctioned
  `requires_binary` pattern (scenario_runner.js:914-924; five docker scenarios use it).
- **W-4 RESTART-SAFE RUN_FORGE.bat**: pm2 "Process 0 not found" + TypeError on `pm2_env`
  at API.js:1718 when restarting over a dead pm2 entry.
- **W-5 DOCS + CONVENTION**: reword the "(LOCAL; no push/tag)" commit convention
  (factually wrong under this owner's push pattern — PHASE-54 stage_closure.md §8);
  update contract docs touched by W-1/W-2.

Execution order: W-1 → C1 → W-2 → C2 → W-3+W-4+W-5 → C3 → closure. One item at a time.

## 2. Rulings — verbatim record

### R-1..R-10 (PROMPT-STAGE-55 §1, CTO-authored 2026-08-03)

R-1  HARDENING ONLY. Zero new capability. Every work item must be independently
     revertible — no cross-item coupling, no shared refactor that makes W-3
     un-revertible without also reverting W-1.
R-2  TEST-FIRST MANDATORY. For every work item: write the failing test FIRST, run
     it, capture the RED output, THEN fix, then capture GREEN. The RED output is
     the evidence the defect existed. Paste both into the checkpoint file. A work
     item with no RED evidence is NOT done.
R-3  §ARC FROZEN AT 10. Any perceived need for a new exception => STOP-AND-REPORT
     immediately; decision artifact + owner approval BEFORE any code.
R-4  MOCK-DEFAULT / $0 throughout, with exactly ONE exception: the single W-1 real
     proof (~$0.02). That call requires separate explicit owner approval in chat
     with the estimate shown first. General delegation does NOT cover real spend.
     Run a $0 preflight/DRY before it.
R-5  W-2 IS NARROW. Forbidden: redesigning R-10 fail routing, changing
     ITERATION_CAP or its semantics, adding a new graph/state-machine state.
     Permitted: detecting non-convergence and routing to the owner in plain
     language using the EXISTING review-gate surface.
R-6  W-3 MUST DECLARE ITS GATE IMPACT. The closure SU count must be stated for
     both environments (Python present / Python absent) in the decision artifact
     and the closure checkpoint. Silent count drift = closure blocked.
R-7  W-4 IS VERIFIED BY EXECUTION, NOT BY READING. Proof = an actual
     stop → start → stop → start cycle with captured stdout, not a script diff.
R-8  LIVE-SURFACE LOCK. The file list agreed at Step 0 is binding. Touching any
     live file outside it => STOP-AND-REPORT before the edit, not after.
R-9  GITIGNORED-ARTIFACT RULE (carried from PHASE-54). Evidence living in
     gitignored paths (.env, progress/uid_pin.json, artifacts/health/,
     artifacts/projects/phase4*) is NOT verifiable from the zip. Paste the raw
     JSON and command tails INTO the checkpoint files so they become verifiable
     artifacts. Do not merely cite them.
R-10 REAL-PATH COVERAGE (carried from PHASE-54 §3). W-2 is owner-facing.
     It requires at least ONE scenario crossing the REAL entry point
     (in-process server, HTTP request, then the engine) in the S382 pattern —
     not only a direct-engine-call scenario. "Scenario green / real path broken"
     has now cost this project twice.

### R-11..R-20 (CTO Step-0 review, ACCEPTED WITH RULINGS, 2026-08-03)

R-11  W-1 SUCCESS PREDICATE IS THE CAP'S OWN NUMBER, NOT A ROW COUNT.
      After W-1, a legacy Stage-A call made while project P is active MUST increase
      cost_ledger.getTotalCost(P). "A row was appended" is NOT sufficient and is
      rejected as the S384 assertion. Sentinel-only project_id is REJECTED as the
      whole fix. Choose ONE and declare it:
        (i)  thread the real project_id to the seam via an ambient context set at
             the single entry point that already knows pid — permitted only if it
             costs at most ONE extra live file beyond openAiAdapter.js; or
        (ii) write the sentinel AND make the budget check include sentinel rows, so
             legacy spend counts against the ACTIVE project's cap. Conservative
             over-count is the correct error direction for a spend cap.
      If both exceed the single-seam constraint => STOP-AND-REPORT, do not absorb.
R-12  F-1 APPROVED. The seam is the client returned by getClient()
      (openAiAdapter.js:17-26); wrap chat.completions.create on it. This is a strict
      superset covering all three classes: the 3 callChatWithTool providers, the 8
      raw-client providers, and the v2 defineProvider path. Per-provider edits are
      REJECTED. openAiAdapter.js remains the only W-1 live file except as permitted
      by R-11(i)/(ii).
R-13  F-2 APPROVED. Wrap chat.completions ONLY. embeddings.create is NOT wrapped —
      KB embeddings are already metered in the KB ledger; wrapping would duplicate.
R-14  F-3 AMENDED — NO SILENT ZERO. Streaming rows ARE written, with tokens = 0 AND
      an explicit additive marker (e.g. tokens_unavailable: true) so a reader cannot
      mistake a zero for "this call was free". Do NOT modify the request body (no
      stream_options — that changes what is sent upstream). The decision artifact
      must state plainly: conversationalResponseProvider streaming spend is VISIBLE
      but NOT COSTED. Backlog item, declared, not silent.
R-15  CROSS-LEDGER DOUBLE VISIBILITY IS ACCEPTED AND MUST BE ENUMERATED BY NAME:
      ideaSynthesisProvider, reverseVisionProvider (v2 path, CTO-F-A) and
      credibility_scorer (your O-2). This is visibility across two ledgers, not
      double counting within the one the cap reads. Name all three in the artifact
      and state the expected effect on future gate deltas.
R-16  W-2 EXACT PREDICATE (written as a predicate per the E-5 lesson). The escape
      fires when ALL of:
        (a) mvpLoop.isMvpEnabled(state) === true
        (b) state.mvp_loop.status === "BUILDING"
        (c) the harness verdict is FAIL
        (d) `outstanding` is falsy — the existing R-10 branch (conversationEngine.js
            :2588-2603) TAKES PRECEDENCE and stays byte-identical
        (e) iterationCount >= 1, where iterationCount is the variable bound at
            conversationEngine.js:2314 from the graph's iteration_count.
            It is explicitly NOT state.mvp_loop.iteration, which mvpLoopEngine.js
            :41-45 defines as a DISPLAY ECHO and never an enforcement source.
      On fire: call _mvpEnterOwnerReview with kind "FAIL_REVIEW" and return the same
      shape as the R-10 branch. When (e) is false: fall through to the existing
      loop_back path, byte-identical. Rationale for >= 1: A-5 keeps its one free
      self-repair attempt; the owner is consulted on the SECOND failure, long before
      the cap. Your alternatives (every first FAIL; assertion-id fingerprint) are
      recorded and rejected — the first over-interrupts, the second adds comparison
      state and brushes R-5.
R-17  W-3 IS DECIDED BY MEASUREMENT, NOT ASSUMPTION (PHASE-54 lesson: presence is
      not validity — probe it). Before committing the value, run env.probe_binary
      for BOTH "pip3" and "pip" on the owner's machine ($0) and paste both raw
      results into C3. Pick a value that probes SUCCESS; if both succeed use "pip3"
      because it mirrors the adapter's primary choice (pip_adapter.js:22). Widening
      requires_binary to an array is a capability change and is FORBIDDEN by R-1 —
      log "requires_binary cannot express pip3-OR-pip" to backlog.
R-18  W-4 MUST INVENTORY TASK SCHEDULER FIRST (CTO-F-B). Read
      scripts/service/windows_task_scheduler_install.bat and resurrect_hidden.vbs
      and state, in C3, whether the scheduled task binds port 3100 and whether your
      proposed sequence fights it. If restart-safety turns out to require
      reconciling pm2 with a Task-Scheduler-owned process, that is scope growth =>
      STOP-AND-REPORT. Do not absorb it into W-4.
R-19  F-7 RESOLVED. R-2 (RED-before-GREEN) is satisfied for W-4 by the executed
      restart transcript (failing cycle = RED, passing cycle = GREEN) per R-7. R-2
      is FORMALLY WAIVED for W-5 only, on the grounds that prose has no executable
      RED; it is replaced by before/after quoted text in C3 plus the corrected
      numbers. Record this waiver as an amendment in the artifact.
R-20  CONFIRMATIONS. O-1: correct — KB ledger is OUT of W-1 scope; KB spend is
      already metered with its own budget guard. F-6: recommendation text only,
      ZERO estimator code this phase; your three-mechanism analysis
      (_adapter_contract:101-107 chars/4 + output=2x + $5/$15; agent_tools:22-37
      gpt-4o at $5/$15 vs the real $2.50/$10; providerTrace:7-12 correct but on the
      unused path) is accepted as the written finding. F-5: confirmed independently
      — 24_MVP_LOOP_CONTRACT.md:214 says N=10 / closure 375 while the actual closure
      was N=11 / 376, and S383 is missing from the table at :204-211. Both are W-5
      targets. O-3: APPROVED — the injection seam has in-repo precedent
      (conversationEngine.js:413, and opts._client in embedding_engine.js:35 /
      retrieval.js:107); it is an established pattern, not a new one. O-4: the
      restart cycle will drop the owner's server — request a time window from the
      owner in C3 before running it, do not just run it. O-5: mitigation accepted.

## 3. Step-0 record (posted 2026-08-03; CTO verified line-level, zero refuted claims)

### 3.1 Repo verification — matched the CTO's GitHub verification exactly (no F-#)

Tag `phase-54-complete` = annotated `e0a98826…` peeling to `9e35e46e…`; origin/main
`b498565` two non-live-code commits above; working tree clean; main == origin/main;
`git diff 9e35e46e..HEAD --stat` = `.claude/settings.local.json` + stage_closure.md only.

### 3.2 W-1 root-cause map (CC, confirmed)

- **Metered path:** `reg.invoke("agent.invoke")` → L3 Step 1.8
  (agent_budget_rule.js:46-97 → budget_enforcer.checkBudget →
  cost_ledger.getTotalCost:107-115) → agent_tools.js books a ledger row on EVERY
  outcome (:121/:142/:191/:215) → `artifacts/agent/cost_ledger.jsonl`. The agent
  adapters use their own `https.request` (agents/adapters/openai_adapter.js:26) —
  they never touch the providers' client.
- **Unmetered path:** conversationEngine.js:1137 → ideationEngine.expandIdea (:53)
  → `new IdeationExpansionProvider()` (:74; also refinementLoopOrchestrator.js:84)
  → executeTask → callChatWithTool (ideationExpansionProvider.js:206) →
  `client.chat.completions.create` (openAiAdapter.js:155). Zero appendEntry, zero
  createTrace anywhere on that chain.
- **2026-08-02 live evidence CONFIRMED from code + persisted ledger:** last morning
  rows 08:34-08:35Z (real-a end); zero rows in the 09:00-09:18Z window containing the
  real ideation expansion (09:17:58Z per R-38); `artifacts/llm/metadata/` gains files
  only via `createTrace`, which only `defineProvider` invokes
  (providerContract.js:185/:255) — the 12 legacy providers never pass through it.
  (The stray-turn `ideation_log.json` was archived by the R-41 reset to
  `artifacts/spikes/phase54_gate10/real_attempt_archive/` — consistent.)
- **Legacy surface = three classes** (third named by CTO-F-A):
  1. via `callChatWithTool`: ideationExpansionProvider:206,
     intentClassificationProvider:61, openAiRequirementDiscoveryProvider:144;
  2. raw `getClient()` + `chat.completions.create`:
     conversationalResponseProvider:203-204 (streaming) + :242-245,
     businessAnalysisProvider:84-85, documentationReviewProvider:84-85,
     openAiOptionsProvider:102-103, openAiExecutionFilesProvider:91-92,
     openAiDocumentationProvider:47-48, projectReviewProvider:92-93,
     researchProvider:84-85;
  3. v2 `defineProvider` path (providerContract.js:203 → callChatWithTool →
     getClient at openAiAdapter.js:129): ideaSynthesisProvider.js:108,
     reverseVisionProvider.js:170 (CC-verified by grep).
  All three classes converge on the `getClient()` singleton (openAiAdapter.js:15-26)
  — the R-12 seam.
- **Estimator finding (F-6, recommendation-only per R-20):** three conflicting
  mechanisms — `_adapter_contract.estimateCost` (:101-107; chars/4, output=2×input,
  "openai" at $5/$15 per 1M, 4-dp rounding zeroes small calls — the "$0 for
  gpt-4o-mini" mechanism); `agent_tools._estimateCostUsd` (:22-37; gpt-4o at $5/$15
  vs the real $2.50/$10); `providerTrace.PRICING_TABLE` (:7-12; correct prices, unused
  path). Inflated rates × doubled-output assumption ⇒ the observed ~2.5-4.0x.

### 3.3 W-2 seam (CC, confirmed)

Decision point: the runTests FAIL branch, conversationEngine.js:2588-2603 (existing
R-10 `outstanding` condition) falling through to blind `orchestration.loop_back`
(:2606) until cap (:2618-2649). Presentation surface reused as-is:
`_mvpEnterOwnerReview` (:2243) with kind `FAIL_REVIEW`
(mvpLoopEngine.assembleMvpReport:358-422 already renders failing assertions in plain
language). `BUILDING → AWAITING_OWNER_REVIEW` is already legal
(mvpLoopEngine.js:37). Confirmed in writing: R-10 NOT redesigned (its branch stays
byte-identical and takes precedence), ITERATION_CAP untouched (single source
conversation_graph.js:19, boot-locked strict ===5 at _registry.js:55-57), NO new
graph state, NO new mvp_loop status. Predicate fixed by R-16; iterationCount binding
at conversationEngine.js:2314 CC-verified.

### 3.4 W-3 (CC, confirmed) — value decided by R-17 measurement

S57 (`S57_pkg_install_pip_tier1.json`, type direct_tool, pkg.install pip) carries no
`requires_binary`. Pattern: scenario_runner.js:914-924 (probe :891-900); the five
declarers are S58/S62/S65/S67/S68 ("docker" = the 5 baseline skips). Value chosen per
R-17 after probing BOTH "pip3" and "pip" on the owner's machine; if both succeed →
"pip3" (mirrors pip_adapter.js:22 primary). Backlog: `requires_binary` cannot express
pip3-OR-pip (array form forbidden by R-1).

### 3.5 W-4 (CC, confirmed; amended by CTO-F-B/R-18)

RUN_FORGE.bat:13-16 `taskkill /F` kills the port-3100 listener outside pm2's
knowledge; :34 `pm2 start ecosystem.config.js` over the existing dead "forge" entry
(id 0) → "Process 0 not found" + TypeError on `pm2_env` at API.js:1718. Proposed
restart-safe sequence (pending the R-18 Task-Scheduler inventory): (1) tolerant
`pm2 delete forge` FIRST (in-repo precedent INSTALL_FORGE.bat:78) — stops management
+ autorestart and clears the dead entry; (2) port-orphan cleanup (non-pm2 orphans
only); (3) `pm2 start ecosystem.config.js --update-env`. EPERM self-heal block
(:18-31) unchanged. **R-18 (CTO-F-B): before any edit, inventory
scripts/service/windows_task_scheduler_install.bat + resurrect_hidden.vbs — Task
Scheduler is the declared sole boot mechanism (INSTALL_FORGE.bat:73-80) and may own
port 3100 at boot; if reconciliation with a Task-Scheduler-owned process is required,
STOP-AND-REPORT (scope growth).**

### 3.6 W-5 (CC, confirmed)

The "(LOCAL; no push/tag)" convention has NO file home — it lives in commit messages
+ the correction note (stage_closure.md:169-193). New wording adopted for PHASE-55
commit messages and recorded here as the convention's durable home:
**"(CC pushed nothing; the owner may push independently — control point: annotated
tag)"**. Contract-doc targets: docs/12_ai_os/24_MVP_LOOP_CONTRACT.md (F-5 drift:
:214 says N=10/closure 375 vs actual N=11/376; S383 absent from the :204-211 table;
plus the W-2 owner-escape addendum) and docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md
(§4/§5 ledger + budget semantics gain the W-1 legacy-metering + sentinel-inclusion
statements).

### 3.7 CTO-F findings (Step-0 review)

| # | Finding | Disposition |
|---|---|---|
| CTO-F-A | Third seam class: v2 defineProvider path (providerContract.js:203) — ideaSynthesisProvider + reverseVisionProvider already write `artifacts/ai/cost_ledger.jsonl` via providerTrace (:81); wrapping meters them into the agent ledger too | Accepted; enumerated by name per R-15 |
| CTO-F-B | W-4 has a third supervisor: Task Scheduler (INSTALL_FORGE.bat:73-80 — "sole boot mechanism … pm2 interactive-only"); on a booted machine port 3100 is plausibly Task-Scheduler-owned and RUN_FORGE.bat's taskkill kills it, pm2 starts a competitor | R-18: inventory first; reconciliation = STOP-AND-REPORT |
| CTO-F-C | The cap is per-project: getTotalCost(project_id) filters by project_id (:107-115); budget_enforcer.js:43 calls it with a specific project — a sentinel-only fix delivers ZERO cap closure | R-11: success predicate = the cap's own number; choice (i)/(ii) required |

### 3.8 CC findings F-1..F-9 and open questions O-1..O-5 — dispositions

| # | Substance | Disposition |
|---|---|---|
| F-1 | Legacy surface is 3 classes; true single seam = wrapping the client returned by getClient() | APPROVED (R-12); per-provider edits REJECTED |
| F-2 | Wrap chat.completions only; embeddings already metered in KB ledger | APPROVED (R-13) |
| F-3 | Streaming (conversationalResponseProvider:203-204): usage unavailable | AMENDED (R-14): rows written with tokens=0 + additive `tokens_unavailable: true` marker; no request-body mutation; streaming spend VISIBLE but NOT COSTED — declared backlog |
| F-4 | Ledger schema requires project_id; seam has none | Superseded by R-11 (sentinel-only REJECTED; choice (ii) declared in §6) |
| F-5 | 24_MVP_LOOP_CONTRACT.md §9 drift (N=9/N=10 vs actual N=11; S383 missing) | CONFIRMED independently (R-20); W-5 target |
| F-6 | Three conflicting estimators (analysis in §3.2) | Accepted as the written finding (R-20); recommendation text only, zero code |
| F-7 | R-2 satisfaction for W-4/W-5 without SU | RESOLVED (R-19): W-4 = executed transcript; W-5 = formal waiver + before/after quoted text |
| F-8 | (Step 0.5) R-14 marker survives validation but NOT persistence — see §6.2 | CONFIRMED by CTO; RESOLVED option (a) per R-22 (additive field in the record builder; SU must read it BACK from the JSONL) |
| F-9 | (Step 0.5) reverse_vision via agent.invoke would double-count WITHIN the agent ledger — see §6.4 | CONFIRMED by CTO (E-1 erratum on R-15); RESOLVED option (a) per R-23 (accept + enumerate + R-23(2) measurement in C1 + backlog item) |
| O-1 | KB ledger out of W-1 scope | CONFIRMED (R-20) |
| O-2 | credibility_scorer cross-ledger double visibility | ACCEPTED + enumerated (R-15) |
| O-3 | S384 needs a test-only injection seam in openAiAdapter | APPROVED (R-20; in-repo precedent conversationEngine.js:413, opts._client) |
| O-4 | R-7 restart cycle drops the owner's server | Request a time window from the owner in C3 first (R-20) |
| O-5 | Session shell may be PATH-stripped | Prefixed-PATH mitigation accepted (R-20) |

## 4. SU plan + closure-gate arithmetic (R-6)

**N = 4** — numbering starts S384:

| SU | Item | RED (defect proof before fix) | GREEN |
|---|---|---|---|
| S384 | W-1 | **Upgraded per R-11:** with project P active, a hermetic legacy Stage-A call completes and the cap's own number is UNCHANGED | Same call; the cap's number increases by the row's `cost_usd_actual` (exact assertion mechanics per the §6.1 choice) |
| S385 | W-2 (direct) | Mock first build fails twice consecutively → today: blind loop_back, no owner presentation | R-16 predicate fires → `mvp_review_pending` + FAIL_REVIEW report |
| S386 | W-2 (real path, R-10) | Same behavior driven through HTTP → processMessage (S382 pattern) | Same predicate through the real entry point |
| S387 | W-3 | Meta-lock (S340 pattern): S57 declares no `requires_binary`; plus environmental RED: S57 under Python-stripped PATH = FAIL | Declaration present; stripped-PATH run = SKIP |

W-4: RED/GREEN = executed restart transcripts (R-7/R-19). W-5: R-2 formally waived
(R-19 amendment, recorded here); replaced by before/after quoted text in C3.

**Closure-gate arithmetic, both ways (R-6):**

| Environment | Pass | Fail | Skip | Total |
|---|---|---|---|---|
| pip present (owner machine today) | **380** (376+4) | 0 | **5** | 385 |
| pip absent | **379** (S57 → SKIP) | 0 | **6** | 385 |

## 5. Live-surface lock (R-8 — binding; any file outside this list = STOP-AND-REPORT)

| Item | Live files |
|---|---|
| W-1 | **Superseded by the §6.5 R-8 re-bound (final):** `code/src/providers/_contract/openAiAdapter.js` + `code/src/runtime/agents/budget_enforcer.js` + `code/src/runtime/agents/cost_ledger.js` (additive only, per R-22/R-21) |
| W-2 | `code/src/ai_os/conversationEngine.js` (the :2588-2603 region only); `code/src/ai_os/mvpLoopEngine.js` contingent (likely zero change; any touch pre-announced) |
| W-3 | `code/src/testing/scenarios/S57_pkg_install_pip_tier1.json` (one line) |
| W-4 | `RUN_FORGE.bat` (INSTALL_FORGE.bat: no change) |
| W-5 | `docs/12_ai_os/24_MVP_LOOP_CONTRACT.md` + `docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md` (docs, not code) |
| D0 / infra | this artifact · `PROMPT-STAGE-55.md` (root) · `progress/status.json` · `artifacts/decisions/_phase_55_checkpoints/*` · test infra: S384-S387 + helpers + additive `mock_responses.json` keys as needed |

## 6. Step 0.5 addendum (CC declaration per the scoped GO — W-1 code awaits CTO GO on this)

### 6.1 R-11 choice: **(ii)** — sentinel + budget-check inclusion

**Reason.** Option (i) (ambient project_id context) fails on two grounds: (a) there is
no SINGLE entry point that knows pid for all three seam classes — legacy providers are
invoked from conversationEngine, ideationEngine, refinementLoopOrchestrator, apiServer
endpoints, documentation/review flows — so one extra live file cannot achieve full
attribution and a sentinel fallback would be needed anyway; (b) a module-level ambient
pid is RACY under the server's concurrent async requests (two projects chatting
concurrently → misattribution), and the robust fix (AsyncLocalStorage threading) is a
design change out of hardening scope. Option (ii) is deterministic, race-free, exactly
ONE extra live file (`budget_enforcer.js`), and its error direction — ALL legacy spend
counting against the ACTIVE project's cap check — is the conservative over-count R-11
explicitly blesses.

**Design:** the seam books legacy rows under sentinel project_id `_legacy_stage_a`;
`budget_enforcer.checkBudget` computes
`totalSpent = getTotalCost(project_id) + getTotalCost("_legacy_stage_a")`.
**Declared limitation (recorded plainly):** per-project attribution of legacy spend is
NOT achieved — every project's cap check absorbs the global legacy total; correct
error direction for a spend cap, wrong direction for per-project accounting. Full
attribution needs pid threading through 11 providers = out of single-seam scope.

**S384 assertion mechanics under (ii)** (the "cap's own number"): GREEN asserts BOTH
(1) `getTotalCost("_legacy_stage_a")` increased by the row's `cost_usd_actual`, AND
(2) `checkBudget(P, …)` crosses a seeded vision-cap threshold BECAUSE of that row
(pre-call below 80%, post-call ≥95% ⇒ DENIED) — i.e. the number the cap reads moved.
RED: same call today leaves both unchanged (checkBudget stays allow).

**Complete W-1 live-file list implied (supersedes Step-0 §e W-1 row; re-binds R-8):**
`code/src/providers/_contract/openAiAdapter.js` + `code/src/runtime/agents/budget_enforcer.js`
(+ `code/src/runtime/agents/cost_ledger.js` +1 additive line IFF F-8 is ruled option (a)).

### 6.2 R-14 marker vs the validator — F-8 (NEW finding)

`cost_ledger._validateEntry` (:28-35) checks ONLY project_id / provider / model /
outcome and does NOT reject unknown fields — the marker does not trip validation:

```js
function _validateEntry(entry) {
  if (!entry || typeof entry !== "object") return ["entry must be an object"];
  const errs = [];
  if (typeof entry.project_id !== "string" || !entry.project_id)  errs.push("project_id required");
  if (typeof entry.provider   !== "string" || !entry.provider)    errs.push("provider required");
  if (typeof entry.model      !== "string")                        errs.push("model required");
  if (!VALID_OUTCOMES.includes(entry.outcome))                     errs.push("outcome must be one of: " + VALID_OUTCOMES.join(", "));
  return errs;
}
```

**BUT (F-8):** `appendEntry` builds the persisted record from a FIXED field list
(:47-60) with no spread of `entry` — an unknown `tokens_unavailable` field passes
validation and is then silently DROPPED, never written. R-14's marker therefore cannot
persist without one additive line in `cost_ledger.js`'s record builder. Options:
(a) permit `cost_ledger.js` +1 additive line (carry `tokens_unavailable: true` when
set; schema additive, §ARC module touched but reusing its own sanctioned write path —
no new §ARC); (b) drop the marker (violates R-14's no-silent-zero). **Recommendation:
(a).** Awaiting ruling — cost_ledger.js is NOT touched before it.

### 6.3 One-line implementability confirmations

- **R-12:** implementable as written — `getClient()` singleton (openAiAdapter.js:15-26)
  is the sole client constructor (grep: zero `new OpenAI(` elsewhere); wrapping
  `chat.completions.create` on the returned client covers all three classes
  (callChatWithTool consumes the same client at :129).
- **R-13:** implementable as written — the wrap targets `chat.completions.create`
  only; `embeddings.create` callers (embedding_engine.js:44, retrieval.js:110) remain
  untouched.
- **R-15:** implementable as written — enumeration CC-verified by grep:
  `defineProvider` users are exactly ideaSynthesisProvider.js:108 +
  reverseVisionProvider.js:170; plus credibility_scorer (callChatWithTool:103, KB
  ledger row :157). Expected gate-delta effect: future real-run agent-ledger deltas
  gain rows for these three surfaces that previous phases' deltas did not contain
  (idea-synthesis / reverse-vision / credibility calls become agent-ledger-visible);
  historical comparisons must account for it. **Caveat: see F-9 for reverse_vision.**
- **R-16:** implementable as written — all five predicate terms bind to existing
  variables in scope at the :2588 site (`state`, `runOutput.overall_status`,
  `outstanding`, `iterationCount` from :2314); `_mvpEnterOwnerReview` accepts the
  same arguments the R-10 branch passes.

### 6.4 F-9 (NEW finding) — reverse_vision via agent.invoke would double-count WITHIN the agent ledger

`agent_tools.js` has a provider_id routing branch (:93-160) whose only registered
target is `reverse_vision` (`_PROVIDER_MODULES`, :12-14). That branch ALREADY books an
agent-ledger row (:142) for the call. reverseVisionProvider is a `defineProvider`
provider whose handler reaches `callChatWithTool` → the wrapped client — so after W-1
the SAME OpenAI call would book a SECOND agent-ledger row (sentinel) plus the
providerTrace `artifacts/ai` row. R-15's "not double counting within the one the cap
reads" holds for ideaSynthesis and credibility_scorer but NOT for
reverse_vision-via-agent.invoke: under §6.1(ii) the cap check would count that call
twice (real-pid row + sentinel row). Options: (a) ACCEPT + enumerate (zero extra live
files; conservative over-count direction; reverse_vision is intake-only and rare);
(b) suppress the seam booking inside the provider_id branch via a call-scoped marker
(adds `agent_tools.js` to the live list + reintroduces ambient-state complexity).
**Recommendation: (a).** Awaiting ruling.

## 6.5 CTO review of D0 + Step 0.5 addendum (2026-08-04) — D0 VERIFIED; W-1 GO granted, scope re-bound

F-8 and F-9 both CONFIRMED line-level by the CTO. D0 verified from a fresh zip
(commit `eed8f30d` local; $0; no push, no tag).

### ERRATUM E-1 (CTO; detected by CC via F-9)

R-15's clause "visibility across two ledgers, not double counting within the one
the cap reads" is **WRONG** for reverse_vision invoked via agent.invoke. It holds
for ideaSynthesisProvider and credibility_scorer only. R-15 is amended accordingly.
Attribution: CTO. Detected by: CC (F-9) — the second time in two phases that CC has
falsified a CTO ruling before it reached code.

### CTO-F-D — the R-11(ii) design as written is a delayed denial of service

`getTotalCost("_legacy_stage_a")` reads every matching row ever written, from a
JSONL that never resets, and the §6.1 design added that unbounded total to EVERY
project's cap check. budget_enforcer.js:34-55 compares projected/cap with
DEFAULT_MAX_TOTAL_USD = 50.00. Therefore: once cumulative legacy spend crosses a
project's cap, every NEW project returns BUDGET_EXCEEDED before its first call —
a guaranteed future outage of the owner's own tool. `cost_ledger.readEntries`
already supports `filter.since` — the bound is cheap. Resolved by R-21.

### R-21..R-24 (CTO, 2026-08-04 — verbatim)

R-21  LEGACY CONTRIBUTION MUST BE LIFETIME-BOUNDED TO THE PROJECT.
      Required property: the legacy amount added to project P's cap check counts
      ONLY legacy spend that occurred within P's own lifetime. An unbounded global
      total is REJECTED. Mechanism is yours to choose (filter.since already exists;
      a project creation/first-activity timestamp is the natural bound —
      budget_enforcer._readVisionCaps already reads project files). Declare the
      chosen bound and its exact predicate in the artifact. If no bound is
      implementable within the re-bound file list => STOP-AND-REPORT.
      SU consequence: S384 must ALSO assert the bound — a legacy row written BEFORE
      project P existed must NOT appear in checkBudget(P). Without that assertion
      the bound is unproven.
R-22  F-8 RESOLVED — OPTION (a) APPROVED. One additive field in the record builder
      in cost_ledger.js. This is a §ARC module but the change reuses its own
      declared write path: NO new §ARC, ledger remains at 10. Option (b) is REJECTED
      because it violates R-14's text. BINDING: the SU must read the field BACK from
      the persisted JSONL, not merely assert appendEntry returned. Presence is not
      validity — a marker asserted from the return value and absent from disk is the
      exact defect you just found.
R-23  F-9 RESOLVED — OPTION (a) ACCEPTED, with three bindings:
      (1) Name it explicitly in the artifact: reverseVisionProvider invoked via
          agent.invoke double-counts in the cap's own ledger under (ii).
      (2) BOUND IT BY MEASUREMENT, NOT ASSERTION. Report in C1: how many
          reverse_vision calls occur per project lifecycle, their typical cost, and
          the resulting worst-case cap inflation as a percentage of
          DEFAULT_MAX_TOTAL_USD. If a single intake can plausibly push a real
          project past 80%, come back — the answer changes. The R-37 precedent is
          why this is a measurement and not a shrug: an over-counting cap already
          nearly aborted a legitimate run in PHASE-54.
      (3) Backlog item recorded.
      Option (b) is REJECTED: it reintroduces call-scope ambient state — the exact
      thing R-11 rejected as racy — for a rare path. Trading a bounded deterministic
      over-count for a race in the metering layer is a bad trade.
R-24  A-2 APPROVED — CITATION VERIFIED. I checked it rather than accepting it:
      DECISION-2026-07-29-phase-54-iterative-mvp-loop.md:125-128 and the closure
      artifact line 101 both record R-16 as "next_phase may not say PENDING-DECISION
      while the phase is in progress". Applying the established convention and
      disclosing it is correct behavior, not scope creep. No erratum needed.

### R-8 RE-BOUND — W-1 live file list (supersedes §5's W-1 row and §6.1's list)

1. `code/src/providers/_contract/openAiAdapter.js`   (the seam wrapper)
2. `code/src/runtime/agents/budget_enforcer.js`      (sentinel inclusion + R-21 bound)
3. `code/src/runtime/agents/cost_ledger.js`          (additive ONLY: R-22 marker
   field in the record builder + whatever pass-through R-21's bound requires)

Three live files. Anything else => STOP before the edit. Each independently
revertible per R-1 — how, stated in C1.

### S384 final assertion set (per the W-1 GO)

(a) `getTotalCost("_legacy_stage_a")` increases by the row's `cost_usd_actual`;
(b) `checkBudget(P, …)` crosses a seeded vision-cap threshold because of that row —
the number the cap reads actually moved;
(c) R-21 bound holds: a legacy row predating P is excluded from `checkBudget(P)`;
(d) R-22: the streaming marker is present when read BACK from the persisted JSONL.

### R-21 bound — chosen mechanism + exact predicate (CC declaration)

**Bound = P's first-activity timestamp in the agent ledger itself.** Rationale: it
needs zero new file dependencies (the ledger is already being read), is
deterministic, and covers the intake window (reverse_vision runs before any vision
exists, so a vision-timestamp bound has a hole exactly there; the vision-lock
timestamp also postdates Stage-A ideation spend).

**Predicate as implemented:**
`legacy_total(P) = Σ cost_usd_actual over rows r where r.project_id === "_legacy_stage_a" AND r.ts >= min{ r'.ts : r'.project_id === P }`;
**if P has no ledger rows at all, `legacy_total(P) = 0`** — a brand-new project can
never be blocked by historical legacy spend (this kills the CTO-F-D outage by
construction). Declared limitation: legacy spend occurring before P's first
agent-ledger row (e.g. P's own pre-pipeline ideation turns) is not counted against
P's cap; the direction is under-count for that window only, bounded-correct
afterwards.

### 6.6 CTO verification of C1 (2026-08-04) — W-1 VERIFIED AND ACCEPTED; W-2 GO

- **CTO-F-E (correction, applied in C1 §6 and here):** the R-23(2) figure as first
  reported used the seam-priced $0.005245 and understated the required WORST case
  by ~1.84x. Corrected: worst case = **max(observed) = $0.009665** ⇒ **0.01933%**
  of the $50.00 default cap / **0.96650%** of a $1.00 cap per intake — stated
  explicitly as max(observed), not a mean. Disposition unchanged (R-23(a) holds;
  three orders of magnitude below the 80% threshold). Same error class as F-6 —
  recorded rather than excused.
- **R-25 (verbatim disposition):** the residual R-21 gap — legacy spend before
  P's first agent-ledger row (e.g. a fresh project's pre-pipeline ideation turns)
  is VISIBLE in the ledger but NOT capped — is **ACCEPTED, W-1 NOT reopened**:
  (a) R-21's required property (lifetime-bounded, no delayed denial of service)
  is met and the residual is disclosed at the code seam; (b) the delta is real —
  before W-1 that spend was invisible everywhere AND ungated, after W-1 it is
  always visible and gated from first agent activity onward; (c) a
  project-creation-timestamp bound would grow the live-file list mid-item and
  break R-1's independent revertibility for a small magnitude. **Bindings:**
  (1) backlog item BY NAME: *"R-25 pre-first-activity legacy spend is visible but
  not capped — bound is first-activity, not project creation"*; (2) **W-5 MUST
  state this in OWNER-FACING plain language** — the owner must not believe the
  cap covers a project's pre-build ideation when it does not.
- **Real proof:** shape accepted; NOT authorized yet — awaiting the owner's
  explicit yes relayed by the CTO. When approved: run, then APPEND evidence to C1
  as a dated addendum (no rewriting of existing C1 sections), reporting BOTH the
  ledger delta AND the real cash.
- **W-2 GO:** granted; predicate = R-16 unchanged; R-5 + R-10 (real-path S386,
  S382 pattern) still bind. Expected count after W-2: **379/0/5 (384)**.
  W-2 live-file list confirmed pre-code: `code/src/ai_os/conversationEngine.js`
  ONLY (the :2588-2603 FAIL-branch region); mvpLoopEngine.js ZERO touches — any
  perceived need = STOP before the edit per R-8.

### 6.7 Named backlog items raised by W-1 (none fixed in this phase)

1. **R-23 reverse_vision double-count in the cap's ledger** — reverseVisionProvider
   invoked via agent.invoke books twice (agent_tools :142 + the seam) under (ii);
   measured worst case 0.01933% of the default cap per intake (max(observed),
   CTO-F-E-corrected).
2. **R-25 pre-first-activity legacy spend is visible but not capped — bound is
   first-activity, not project creation.** Owner-facing disclosure mandatory in
   W-5.
3. **R-14 streaming spend is VISIBLE but NOT COSTED** —
   conversationalResponseProvider streams book tokens 0 + `tokens_unavailable`;
   costing them needs usage capture that must not mutate the request.
4. **R-17 `requires_binary` cannot express pip3-OR-pip** (single-string field;
   array form = capability change, forbidden this phase).
5. **R-18(c) INSTALL_FORGE.bat boot-model comment is STALE** (found during the W-4
   inventory): ":72-75 declares Task Scheduler the sole boot mechanism, but since
   PHASE-49 W-D the AtLogOn task only runs `pm2 resurrect` over a dump the
   installer itself just emptied (`pm2 delete forge` + `pm2 save --force`, :78-79)
   — a fresh install does NOT auto-start Forge at boot. Fixing it (correct the
   comment, or save the dump at install) changes boot behavior = its own decision;
   NOT absorbed into W-4 (which touches RUN_FORGE.bat only and preserves the dump
   bit-for-bit)." **MEASURED 2026-08-04 (CTO-ordered, read-only): dump.pm2 = `[]`
   (2 bytes, empty array) while `pm2 list` shows the owner's live forge process
   (id 0, uptime 23h) — a logon resurrect currently restores NOTHING on this
   machine; raw output in C3 §R-18 measurement addendum.**
6. **F-6 SHARPENED per CTO-F-G (closure review): two pricing tables now write ONE
   ledger** (`artifacts/agent/cost_ledger.jsonl`) — the W-1 seam's
   `LEGACY_PRICING_PER_1M` in `code/src/providers/_contract/openAiAdapter.js`
   (longest-prefix-first; gpt-4o at the CORRECT $2.50/$10.00; non-zero default)
   vs `agent_tools._estimateCostUsd` (`code/src/runtime/tools/agent_tools.js:22-37`,
   gpt-4o at $5/$15 ≈ 2x over) and `_adapter_contract.estimateCost`
   (`code/src/runtime/agents/_adapter_contract.js:101-107`, chars/4 + output=2×in
   + 4-dp rounding → $0 for small calls); `providerTrace.PRICING_TABLE`
   (`code/src/providers/_contract/providerTrace.js:7-12`) correct but v2-path-only.
   The seam's table is the correct one; the agent path over-estimates in the safe
   direction for a cap. Reconcile toward the seam's table in the estimator phase.
7. **CTO-F-F: workspace_path drive-letter case churn** — a restart flips
   `workspace_path` "D:" ↔ "d:" across 36 tracked `project_state.json` files
   depending on invocation case; harmless, pollutes diffs; the closure commit
   excludes them (explicit-paths rule; no `git add -A` / `git add .`).

### W-1 real-proof authorization status

NOT authorized. Proposed at C1 with the estimate; the CTO takes it to the owner as
a separate approval. Mock-only / $0 for all W-1 test work.

## 7. Checkpoints + stop-and-report

C1 after W-1 → `_phase_55_checkpoints/stage_spend_mid.md` · C2 after W-2 →
`stage_loop_mid.md` · C3 after W-3+W-4+W-5 → `stage_preclosure.md`. Each: HARD STOP,
owner fresh LOCAL-folder zip, CTO verification GO; RED+GREEN evidence embedded per
R-2; raw gitignored evidence pasted per R-9. Stop-and-report triggers per
PROMPT-STAGE-55 §4 verbatim (any new §ARC need · breaking project_state schema
change · any change to R-10 fail routing or ITERATION_CAP · role-registry growth ·
any SU regression · any live file off-list · any real spend without a fresh owner
"أيوه" · scope creep · any item larger than scoped).

## 8. Closure gate (PROMPT-STAGE-55 §5, deterministic)

1. SU exact count both ways per §4 (380/0/5 of 385 pip-present; 379/0/6 of 385
   pip-absent).
2. Track A greps clean · doctor 35 checks 0 FAIL · §ARC 10 · L2 81 · roles 13
   reported unchanged.
3. RED-then-GREEN pasted per item (W-4 transcript per R-7).
4. W-1 real proof executed with owner approval; ledger delta AND real cash reported.
5. Closure artifact + status.json flip + closure checkpoint.
6. Closure commit LOCAL until CTO push GO after fresh-zip closure-diff; annotated tag
   `phase-55-complete` on the CLOSURE COMMIT HASH, not HEAD.

## 9. Budget

Kill bar **$3.00**. Mock-default / $0 throughout; sole exception = the single W-1
real proof (~$0.02), separate owner approval in chat with the estimate shown FIRST,
$0 preflight/DRY before it. Ledger delta AND real cash reported for every real call.
**Spend to date this phase: $0.**

## 10. Amendments

- **A-1 (R-19):** R-2 formally WAIVED for W-5 only — prose has no executable RED;
  replaced by before/after quoted text in C3 plus the corrected numbers.
- **A-2 (field convention):** with `current_task` flipped to
  PHASE-55-HARDENING-BATCH, `next_phase` moves to `PHASE-56-PENDING-DECISION` in the
  same D0 commit — applying PHASE-54's R-16 ruling (the single source of truth may
  not state a phase simultaneously in progress and pending decision). Disclosed, not
  silent.
- **Commit-message convention (effective this phase, pending W-5 doc placement):**
  "(CC pushed nothing; the owner may push independently — control point: annotated tag)".
