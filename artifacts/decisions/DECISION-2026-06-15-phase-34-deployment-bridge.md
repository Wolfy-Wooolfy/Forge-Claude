# DECISION — PHASE-34: DEPLOYMENT Bridge (`deployProject`) + `finalizeDeliverable` — ★ PIPELINE COMPLETE ★

**Decision ID:** DECISION-2026-06-15-phase-34-deployment-bridge
**Date:** 2026-06-15
**Status:** CLOSED (LOCAL — pending CTO closure-diff verify + push GO)
**Owner approval:** CTO "PHASE-34 CLOSURE (LOCAL ONLY) — Gate #10 verified by CTO — PIPELINE COMPLETE" (2026-06-15, verbatim in session); real-API spend approved by owner in chat before STEP B.
**Phase predecessor:** PHASE-33 CLOSED (judgeQuality QUALITY_JUDGE + Gate 2), tag `phase-33-complete` @ `15a79ab`.
**Real spend (this phase):** **$0.01728** (one real gpt-4o deployment completion; finalize is deterministic, no LLM). Kill bar $3.00/phase; single-call signal $0.30. Cumulative real spend ≈ **$0.637**.

---

## 0. ★ MILESTONE — THIS PHASE CLOSES THE PIPELINE ★

DEPLOYMENT is the **last bridge**. With PHASE-34 the **full conversation graph is wired
end-to-end**:

```
OWNER_INTENT → ARCHITECT_DESIGN → SPEC_WRITER_FORMALIZE → REVIEWER_SPEC → COST_ESTIMATE →
ENV_REPORT →(Gate 1)→ TEST_DESIGN → BUILDER → RUN_TESTS → REVIEWER_CODE_AND_SECURITY →
DOCUMENTATION → QUALITY_JUDGE →(Gate 2)→ DEPLOYMENT_OR_END →(Gate 3)→ LIVE_DELIVERABLE → COMPLETE
```

Gate #10 proved **idea → terminal COMPLETE** with a real gpt-4o call — the first time the owner
can reach a terminal `COMPLETE` state end-to-end. No pipeline bridges remain; PHASE-35+ is
backlog/enhancement only.

---

## 1. Deliverables

Two cooperating functions + one finalization function in `code/src/ai_os/conversationEngine.js`,
plus two 4-line mirror endpoints in `code/src/workspace/apiServer.js`. **No graph/gates/role
changes** — wiring only.

### 1.1 `deployProject()` — at `DEPLOYMENT_OR_END`, two paths
- **SKIP path (LOCK-4 + LOCK-6):** `deployment_enabled === false` (body-driven, via the **reused**
  `approval_gates.shouldSkipGate3({ deployment_enabled })`) → `orchestration.advance_state(to:
  "LIVE_DELIVERABLE", transition_type:"VACUOUS_SKIP")` (the same mechanism as
  `e2e_loop_helper.runS156`). No role, no gate. `shouldSkipGate3` skips **only** on explicit
  `=== false`; missing/null/undefined/true → gated (so Gate 3 is exercised by default).
- **GATED path (default):** state guard `DEPLOYMENT_OR_END` (else `WRONG_STATE`) → read
  `spec.json` + `architect_design.json` (REQUIRED → `INPUT_NOT_FOUND`) + best-effort optional
  `env_report.json` → `role.invoke("deployment", …, provider:"openai", model:"gpt-4o")` (LOCK-3;
  the role's own default is `anthropic`, overridden — owner has no `ANTHROPIC_API_KEY`), 30s timeout
  → on SUCCESS persist `deployment_plan.json` **before** returning → `{ gate_pending:3,
  advanced:false }`. **No `advance_state`** — every gated `DEPLOYMENT_OR_END` edge has a non-null
  Gate 3 `gate_check`; only the owner's Gate 3 response moves the loop. The deployment role is
  **ADVISORY** — it produces a deployment PLAN, not a live deploy (bridge-only; **no `deploy.*`
  execution tool exists or is invoked**). No `build_manifest` dependency → **no RULING-9 branch**.

### 1.2 `respondGate()` — extended to `gate_id ∈ {1, 2, 3}`
`_GATE_RESPONSES[3] = ["APPROVE","REJECT"]`, `_GATE_HOST_STATE[3] = "DEPLOYMENT_OR_END"`. Gate 3
`APPROVE` → `LIVE_DELIVERABLE`; `REJECT` → `ESCALATED` (`next_state` owned by `orchestration.respond`
→ `fireGate` → `_NEXT_STATE`, reused unmodified). **LOCK-1:** Gate 3 `APPROVE` requires
`selected_target`; `respondGate` forwards `body.selected_target` into `orchestration.respond`
**conditionally** (`Object.assign`, only when present).

### 1.3 `finalizeDeliverable()` — `LIVE_DELIVERABLE → COMPLETE` (LOCK-5)
The pipeline-completing step. A **distinct, explicit** function + endpoint — NOT folded into the
Gate 3 APPROVE handler (the owner sees `LIVE_DELIVERABLE` before `COMPLETE`). State guard
`LIVE_DELIVERABLE` else `WRONG_STATE`. **Reuses `summary_writer.writeSummary()`** (consumed, NOT
rewritten): persist `orchestration_summary.md` **before** advancing (matches the graph trigger
"orchestration_summary.md written; audit trail finalized"), then
`orchestration.advance_state(to:"COMPLETE", "NORMAL")`. `writeSummary` throw → `SUMMARY_WRITE_FAILED`.

**Endpoints:** `POST /api/ai-os/project/deploy-project`, `POST /api/ai-os/project/finalize-deliverable`
(both new 4-line mirrors); existing `respond-gate` now accepts `gate_id:3` + `selected_target` (no change).

---

## 2. DEPLOYMENT_OR_END transitions + finalization — all covered

| Transition / step | Scenario | Proof |
|---|---|---|
| `deployment_enabled=false` → VACUOUS_SKIP → LIVE_DELIVERABLE | **S315** | advance + skipped:true + VACUOUS_SKIP row (role_invoked null) + no plan written |
| gated: role SUCCESS → persist → `gate_pending:3`, `advanced:false`, loop STAYS DEPLOYMENT_OR_END | **S316** | deployment_plan.json on disk; graph unchanged |
| Gate 3 APPROVE (+selected_target) → LIVE_DELIVERABLE | **S317** | advanced_to LIVE_DELIVERABLE + GATE_APPROVE row gate 3 — **positive LOCK-1 proof** |
| Gate 3 REJECT → ESCALATED | **S318** | advanced_to ESCALATED + GATE_REJECT row gate 3 |
| finalize: LIVE_DELIVERABLE → COMPLETE | **S323** | orchestration_summary.md written + graph COMPLETE + advanced_to COMPLETE |

---

## 3. Fail-closed taxonomy + guards

All fail-closed paths return `{ ok:true, advanced:false, <err>:<CODE> }` (no write, no advance).

- **deployProject:** `PROJECT_NOT_FOUND / NO_LOOP_ID / GET_STATUS_FAILED / WRONG_STATE /
  INPUT_NOT_FOUND / DEPLOY_PARSE_FAILED` (INVALID_ROLE_OUTPUT) `/ DEPLOYMENT_FAILED` (other reason via
  `metadata.reason`) `/ DEPLOY_WRITE_FAILED / SKIP_ADVANCE_FAILED`.
- **finalizeDeliverable:** `WRONG_STATE / SUMMARY_WRITE_FAILED / FINALIZE_ADVANCE_FAILED`.

| Scenario | Coverage | Result |
|---|---|---|
| S319 | deploy WRONG_STATE (parked at QUALITY_JUDGE) — no role/write/advance | GREEN |
| S320 | deploy INPUT_NOT_FOUND (spec/design absent) — no role/write/advance | GREEN |
| S321 | role-failure **two variants**: (a) mock non-JSON → INVALID_ROLE_OUTPUT → `DEPLOY_PARSE_FAILED`; (b) non-object spec → role INVALID_INPUT (other reason) → `DEPLOYMENT_FAILED` | GREEN |
| S322 | Gate 3 APPROVE **without** `selected_target` → fail-closed (fireGate throws → `gate_error`, no advance, no GATE_APPROVE row) — **negative LOCK-1 proof** | GREEN |
| S324 | finalize wrong-state (parked at DEPLOYMENT_OR_END) → WRONG_STATE, no summary, no advance | GREEN |

---

## 4. LOCKS — applied and verified

- **LOCK-1 (selected_target — this phase's silent-break trap):** forwarded **conditionally** (only
  when present). Positive proof **S317** (APPROVE+target → LIVE_DELIVERABLE); negative proof **S322**
  (APPROVE without target → fireGate throws → `gate_error`, no advance). **MID trap (caught + fixed):**
  forwarding `selected_target:undefined` *unconditionally* broke **Gates 1 AND 2** (a present key with
  an undefined value fails `orchestration.respond`'s `type:"string"` schema) — surfaced by the LOCK-2
  regression (6/7 red), fixed with `Object.assign`. Same class as the `role_invoked:null` trap on the
  skip path (omit, don't pass null).
- **LOCK-2 (regression):** Gate 1 (**S281, S282, S283**) + Gate 2 (**S311, S312, S313, S314**) GREEN
  under the `{1,2}→{1,2,3}` extension.
- **LOCK-3 (provider override):** `deployProject` defaults `deploy_provider:"openai"`,
  `deploy_model:"gpt-4o"`. Gate #10 used openai/**gpt-4o-2024-08-06**.
- **LOCK-4 (VACUOUS_SKIP reuse):** skip path reuses `orchestration.advance_state(transition_type:
  "VACUOUS_SKIP")` — same as `runS156`; `role_invoked` omitted (null fails the tool's `type:"string"`
  schema; the tool records null via `input.role_invoked || null`).
- **LOCK-5 (finalize reuses summary_writer):** `finalizeDeliverable` CALLS `writeSummary()`;
  `summary_writer.js` UNMODIFIED.
- **LOCK-6 (body-driven `deployment_enabled`):** default (undefined) → gated path (Gate 3 exercised by default).

---

## 5. Gate #10 — REAL (HONEST_EVIDENCE, PASS) — pipeline-completing

**Result:** PASS → real tail `DEPLOYMENT_OR_END → gate_pending:3 → APPROVE(vercel) → LIVE_DELIVERABLE
→ finalize → COMPLETE`.
- provider/model: openai / **gpt-4o-2024-08-06**
- cost: **$0.01728** (real ledger row, role=deployment, tokens_in 1109 / tokens_out 782, outcome success)
- latency: **9633ms** real deployment role (deploy HTTP 9795ms) vs mock ~tens of ms — decisive real-vs-mock contrast
- per-step states: **DEPLOYMENT_OR_END → DEPLOYMENT_OR_END** (persist-then-BLOCK: deployProject did
  NOT advance) **→ LIVE_DELIVERABLE** (Gate 3 APPROVE, selected_target=vercel) **→ COMPLETE** (finalize)
- `deployment_plan.json` written: **3532 bytes** (all 9 OUTPUT_SCHEMA keys; target_environment=container)
- `orchestration_summary.md` written: **1425 bytes** (content confirmed)
- final graph `current_state` on disk = **COMPLETE** (terminal) — the pipeline-completing proof
- CLEAN deploy body `{ project_id, loop_id }` (no scenario_id / mock / _test_*) → genuinely non-mock
- vision-lock + budget L3 gates (non-mock-only) first exercised by this real run and passed (locked
  vision.md seeded — the PHASE-32 attempt-1 lesson honored; no VISION_NOT_FOUND)
- Evidence: `artifacts/spikes/gate34_phase34/gate34_result.json` (+ step1/2/4/5/6 evidence files).

---

## 6. FINDINGS (honest)

1. **Advisory role vs owner choice (correct behavior):** the real deployment role proposed
   `target_environment=container`; the owner's Gate 3 `selected_target` was `"vercel"`. **No conflict**
   — the deployment role is **ADVISORY** (it produces a plan); the **owner's Gate 3 choice drives
   `selected_target`**. Identical to PHASE-33 (quality_judge advisory vs owner Gate 2 driving the transition).
2. **Full-suite memory footprint:** the suite now needs `node --max-old-space-size=4096` to avoid heap
   OOM under full load (322 scenarios accumulate in one process). This is a **runtime flag, NOT a code
   change** (zero source edits). Backlog candidate: release memory between scenarios in the runner.

---

## 7. Track A / counts

- `conversationEngine.js`: `fs.*Sync` = **2** (unchanged); `child_process|fetch(|new OpenAI(` = **1**
  (pre-existing benign string, unchanged). `deployProject` / `finalizeDeliverable` / `respondGate` use
  `reg.invoke` only (`orchestration.get_status` / `advance_state` / `respond`, `fs.read_file` /
  `fs.write_file`, `role.invoke`) + the pure `shouldSkipGate3` import + `summary_writer.writeSummary`
  (itself `reg.invoke`-only).
- `apiServer.js`: 2 new 4-line mirror routes; 0 new `fs.*Sync`.
- **5 wiring-only files byte-identical** (git-confirmed): `conversation_graph.js`, `approval_gates.js`,
  `deployment_role.js`, `orchestration_tools.js`, `summary_writer.js`.
- **§ARC = 8** (no new exception, no new graph node, no new RULING, no new L2 tool). **L2 = 80** ·
  **roles = 13** · **doctor = 35** — all unchanged. `node bin/forge-doctor.js` → exit 0 (0 critical, 6
  pre-existing warnings).

---

## 8. Files

**Created:** `code/src/testing/helpers/deploy_project_test_helper.js`,
`code/src/testing/scenarios/S315..S324_*.json` (10 files), `scripts/spikes/gate34_phase34_deploy.js`,
`artifacts/decisions/_phase_34_checkpoints/{stage_mid,stage_a,stage_final}.md`, this file,
`artifacts/spikes/gate34_phase34/*` (Gate #10 evidence), `artifacts/projects/phase34_gate10/*` (seeded Gate #10 project).

**Modified:** `code/src/ai_os/conversationEngine.js` (deployProject + finalizeDeliverable + respondGate
Gate-3 extension + exports), `code/src/workspace/apiServer.js` (deploy-project + finalize-deliverable
routes), `code/src/runtime/agents/adapters/mock_responses.json` (mock-dep-s316, mock-dep-s321),
`progress/status.json` (closure).

---

## 9. Closure gate

- [x] All DEPLOYMENT_OR_END transitions + finalization covered (S315–S318, S323) + fail-closed guards
      (S319–S322, S324) GREEN.
- [x] Full SU suite **317/0/5 (322 total)** exit 0; no new fails; 5 skips = docker-container scenarios.
- [x] Track A clean; §ARC=8; L2=80; roles=13; doctor=35; 5 wiring files byte-identical; doctor exit 0.
- [x] LOCK-1 / LOCK-2 / LOCK-3 / LOCK-4 / LOCK-5 / LOCK-6 applied + verified.
- [x] Gate #10 REAL evidence on disk, real persist-then-BLOCK + real APPROVE(vercel) advance to
      LIVE_DELIVERABLE + real finalize advance to **COMPLETE** (PHASE-24 lesson honored: no closure
      text written before `gate34_result.json` existed + read PASS from a real call).
- [x] Decision artifact (this file) + stage_final checkpoint + status.json phase_34 block (`pipeline_complete:true`).
- ★ **PIPELINE COMPLETE** — no pipeline bridges remain. Next: **PHASE-35 (pending decision)** —
  backlog/enhancement ONLY (reviewer/security prompt-tuning, Fixture Engine, §ARC code-vs-ledger drift,
  suite memory footprint, provider-switch-to-Anthropic).
- Closure commit stays **LOCAL** until explicit CTO push GO → (tag) → GitHub clone verify → TRULY CLOSED.
