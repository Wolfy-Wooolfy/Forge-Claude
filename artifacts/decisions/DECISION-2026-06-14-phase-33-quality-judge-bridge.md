# DECISION — PHASE-33: QUALITY_JUDGE Bridge (judgeQuality) + Gate 2

**Decision ID:** DECISION-2026-06-14-phase-33-quality-judge-bridge
**Date:** 2026-06-14
**Status:** CLOSED (LOCAL — pending CTO closure-diff verify + push GO)
**Owner approval:** CTO "PHASE-33 CLOSURE (LOCAL ONLY) — Gate #10 verified by CTO" (2026-06-14, verbatim in session); real-API spend approved by owner in chat before STEP B.
**Phase predecessor:** PHASE-32 CLOSED (documentProject DOCUMENTATION→QUALITY_JUDGE), tag phase-32-complete @ eb03d9f.
**Real spend (this phase):** $0.01900 (one real gpt-4o quality_judge completion). Kill bar $3.00/phase; single-call signal $0.30.

---

## 1. Deliverable

The **QUALITY_JUDGE bridge** — `judgeQuality()` added to `code/src/ai_os/conversationEngine.js`
(after `documentProject`), plus the **respondGate Gate 2 extension** in the same file, plus the
endpoint `POST /api/ai-os/project/judge-quality` in `code/src/workspace/apiServer.js` (4-line mirror).

This is the project's first **gated + branching** bridge (every prior bridge was either
persist-then-advance with `gate_check:null`, or a single loop-back). It is delivered as **two
cooperating functions**, mirroring the PHASE-26 `reportEnv` + `respondGate` (Gate 1) precedent:

### 1.1 `judgeQuality()` — persist-then-BLOCK (NOT persist-then-advance)

Drives the `quality_judge` role at the `QUALITY_JUDGE` state and **does NOT advance**. Every
`QUALITY_JUDGE` outbound edge in `conversation_graph.js` carries a **non-null** `gate_check`
("Gate 2 …"), so only the owner's gate response moves the loop. `judgeQuality` persists
`quality_report.json` and returns `{ gate_pending:2, advanced:false }`; the loop stays at
`QUALITY_JUDGE`.

Flow: resolve project_id + loop_id → `orchestration.get_status` guard (must be `QUALITY_JUDGE`) →
read `spec.json` + `architect_design.json` (REQUIRED) → best-effort optionals → RULING-9
manifest/builder_output handling → `role.invoke("quality_judge", …)` (provider default
**openai/gpt-4o** per LOCK-3; the role's own default is `anthropic`, overridden because the owner
has no ANTHROPIC_API_KEY), 30s timeout → on SUCCESS: persist `quality_report.json` **before**
returning → `{ ok:true, loop_id, quality_report, gate_pending:2, advanced:false, model_used }`.
**No `advance_state`.**

### 1.2 `respondGate()` — extended to Gate 2 (gate_id ∈ {1, 2})

The PHASE-26 Gate-1 `respondGate` is generalised via two module-level maps:

```
_GATE_RESPONSES  = { 1:["APPROVE","REJECT"],
                     2:["APPROVE_SHIP","APPROVE_WITH_CAVEATS","REJECT_AND_LOOP"] }
_GATE_HOST_STATE = { 1:"ENV_REPORT", 2:"QUALITY_JUDGE" }
```

Per-gate response validation + per-gate host-state guard. The `next_state` is owned entirely by
`orchestration.respond` → `fireGate` (`approval_gates.js`) → for `REJECT_AND_LOOP`,
`tryAdvanceForLoopBack` (the existing loop-back mechanism, reused unmodified). `respondGate` only
echoes the resulting `next_state`. Gate 3 is intentionally NOT opened (future phase): an unknown
gate_id falls through to `INVALID_GATE_RESPONSE` (fail-closed).

**Endpoints:** `POST /api/ai-os/project/judge-quality` → `judgeQuality`; the existing
`POST /api/ai-os/project/respond-gate` → `respondGate` now accepts `gate_id:2` (no new endpoint).

---

## 2. The five QUALITY_JUDGE transitions — all covered

`conversation_graph.js` defines five outbound `QUALITY_JUDGE` transitions. Each is proven by a
passing scenario:

| # | Transition (gate_check) | Scenario | Proof |
|---|---|---|---|
| 1 | QUALITY_JUDGE → QUALITY_JUDGE ("Gate 2 — BLOCK") | **S307** | role SUCCESS → quality_report persisted → `gate_pending:2`, `advanced:false`, loop stays QUALITY_JUDGE |
| 2 | QUALITY_JUDGE → DEPLOYMENT_OR_END ("Gate 2 APPROVE_SHIP") | **S311** | `advanced_to:DEPLOYMENT_OR_END`, graph state confirmed |
| 3 | QUALITY_JUDGE → DEPLOYMENT_OR_END ("Gate 2 APPROVE_WITH_CAVEATS") | **S313** | `advanced_to:DEPLOYMENT_OR_END` + GATE_APPROVE audit row (gate 2, QUALITY_JUDGE→DEPLOYMENT_OR_END) = caveats logged |
| 4 | QUALITY_JUDGE → BUILDER ("Gate 2 REJECT_AND_LOOP", iter < cap) | **S312** | `advanced_to:BUILDER` + iteration_count 0→1 + LOOP_BACK audit row `from_state=QUALITY_JUDGE` |
| 5 | QUALITY_JUDGE → ESCALATED ("Cap exceeded") | **S314** | iter=cap(5) → `advanced_to:ESCALATED`, no further increment, ESCALATE row `from_state=QUALITY_JUDGE`, no LOOP_BACK row |

S312 / S314 reuse `fireGate(2)` → `tryAdvanceForLoopBack` unmodified (no new loop-back mechanism),
with the same assertion rigor as the PHASE-31 REVIEWER→BUILDER and PHASE-29 RUN_TESTS→BUILDER
loop-backs (advance + counter + audit row, not just `advanced:true`).

---

## 3. Fail-closed taxonomy + guards

All fail-closed paths return `{ ok:true, advanced:false, quality_error:<CODE> }` (no write):
`WRONG_STATE / INPUT_NOT_FOUND / QUALITY_MANIFEST_CORRUPT / QUALITY_PARSE_FAILED / QUALITY_FAILED /
QUALITY_WRITE_FAILED`. `INVALID_ROLE_OUTPUT` (parse/schema) → `QUALITY_PARSE_FAILED`; any other role
non-SUCCESS reason → `QUALITY_FAILED` (distinguished via `metadata.reason`, mirroring
documentProject/reviewProject).

| Scenario | Coverage | Result |
|---|---|---|
| S308 | wrong-state (parked at DOCUMENTATION) → WRONG_STATE; no role call, no write, no advance | GREEN |
| S309 | input-missing (spec/design absent) → INPUT_NOT_FOUND; no write, no advance | GREEN |
| S310 | RULING-9 manifest-CORRUPT — **3 variants** (unparseable JSON, lists-file-absent, empty `files[]`) → all QUALITY_MANIFEST_CORRUPT, fail-closed | GREEN |

---

## 4. RULING-9 extension — builder_output (NO new RULING)

RULING-9 (Option B, ratified in PHASE-32) governs the OPTIONAL, manifest-restricted code object. The
CTO confirmed at §0 that it **extends to `judgeQuality`'s `builder_output`** without a new RULING:

> **manifest ABSENT** → GRACEFUL: omit `builder_output`; judge from spec+design (+best-effort
> optionals). **PRESENT + valid** → manifest-restricted `builder_output` from the listed files'
> on-disk content. **PRESENT + corrupt/unparseable OR lists a file absent on disk OR empty
> `files[]`** → `QUALITY_MANIFEST_CORRUPT`, FAIL-CLOSED (no role call, no write, no advance).

`quality_judge_role.js` INPUT_SCHEMA already declares `builder_output` (and `security_audit`,
`test_plan`, `documentation`, `cost_estimate`, `environment`, `deployment`) as optional `object`
properties. Per **LOCK-5**, the non-manifest optionals are **plain best-effort** (present→include,
absent→omit, never fail-close); ONLY `build_manifest.json → builder_output` is RULING-9 fail-closed.
S310 proves the three corrupt branches; S307 exercises the present-and-valid path (+ optionals).

---

## 5. LOCKS — applied and verified

- **LOCK-1 (the silent-break trap):** the `orchestration.respond` invoke passes `gate_id: gate_id`
  (the caller's value), **never a literal `1`**. Proven positively by **S311**: had it stayed `1`,
  `fireGate(1,"APPROVE_SHIP")` would reject (APPROVE_SHIP ∉ Gate-1 options) → `advanced:false` →
  S311 would FAIL. S311 green with `advanced_to:DEPLOYMENT_OR_END` is direct evidence gate_id:2
  flows end-to-end.
- **LOCK-2 (regression guard):** the existing Gate-1 scenarios stay green under the new per-gate
  validation — **S281** (APPROVE→TEST_DESIGN), **S282** (REJECT→ESCALATED), **S283** (bad token →
  INVALID_GATE_RESPONSE). All GREEN.
- **LOCK-3 (provider override):** `judgeQuality` defaults `quality_provider:"openai"`,
  `quality_model:"gpt-4o"` (overrides the role's `anthropic` default). The Gate #10 real call used
  openai/gpt-4o-2024-08-06.

---

## 6. Gate #10 — REAL (HONEST_EVIDENCE, PASS)

**Result:** PASS → real path `QUALITY_JUDGE → gate_pending:2 → APPROVE_SHIP → DEPLOYMENT_OR_END`.
- provider/model: openai / **gpt-4o-2024-08-06**
- cost: **$0.01900** (real ledger row, role=quality_judge, tokens_in 1862 / tokens_out 646, outcome success)
- latency: **4982ms** real role (judge HTTP 5035ms) vs mock ~tens of ms — decisive real-vs-mock contrast
- pre_state **QUALITY_JUDGE** → mid_state **QUALITY_JUDGE** (persist-then-BLOCK: judgeQuality did NOT
  advance) → final_state **DEPLOYMENT_OR_END** (on-disk graph.json, after the APPROVE_SHIP gate)
- `quality_report.json` written by this run: **2808 bytes**, all 6 OUTPUT_SCHEMA keys
- CLEAN judge body `{ project_id, loop_id }` (no scenario_id / mock / _test_*) → genuinely non-mock
- vision-lock + budget L3 gates (non-mock-only) first exercised by this real run and passed (locked
  vision.md seeded — the PHASE-32 attempt-1 lesson honored; no VISION_NOT_FOUND)
- Evidence: `artifacts/spikes/gate33_phase33/gate33_result.json` (+ step1/2/4/5 evidence files).

---

## 7. FINDINGS (honest — findings, NOT PHASE-33 defects)

1. **Verdict variance proves real:** the real judge returned **APPROVED_WITH_CONCERNS / confidence
   78**, distinct from the S307 mock fixture (**APPROVED / 88**). Different prose, different verdict
   — genuinely gpt-4o-generated.
2. **The advisory judge adds value over reviewer/security (reinforces the prompt-tuning backlog):**
   the real quality_judge flagged (a) a `this.changes` WARN on `updateTodo` — the **same defect
   class the PHASE-31 reviewer missed** — and (b) an AC-2 test-coverage concern. The cross-role
   judge layer demonstrably catches what the per-role reviewers under-caught. This **reinforces** the
   carried-forward reviewer/security prompt-tuning backlog item (PHASE-35+ candidate) — **NOT actioned
   in this phase.**
3. **Architectural (correct behavior):** the quality_judge is **ADVISORY**; the owner Gate 2 response
   drives the transition. The loop advanced to DEPLOYMENT_OR_END on **APPROVE_SHIP** despite the
   judge's CONCERNS — correct bridge behavior: the owner decides shipping, not the judge. (If the
   owner instead sent REJECT_AND_LOOP, S312/S314 prove the loop-back/escalation path.)

---

## 8. Track A / counts

- `fs.*Sync` in conversationEngine.js = **2** (pre-existing, lines 48/751; judgeQuality/respondGate
  add none — all I/O via `reg.invoke`: `fs.read_file`/`fs.write_file`/`orchestration.get_status`/
  `orchestration.respond`/`role.invoke`).
- `child_process | fetch( | new OpenAI(` in conversationEngine.js = **1 (0 new)** — the pre-existing
  benign `"child_process"` string literal. apiServer endpoint + spike add none in runtime.
- `judge-quality` endpoint = 1 (4-line mirror, no route logic).
- **§ARC = 8** (ledger untouched; zero new exception). **L2 tools = 80** · **roles = 13** ·
  **doctor checks = 35** — all unchanged. `node bin/forge-doctor.js` → exit 0.
- 7 critical files **byte-identical** through the second half + closure: `conversationEngine.js`*,
  `apiServer.js`*, `quality_judge_role.js`, `approval_gates.js`, `iteration_controller.js`,
  `conversation_graph.js`, `orchestration_tools.js`. (*engine + apiServer carry the MID-committed
  judgeQuality/respondGate/endpoint; unchanged since STEP A. Roles/gates/graph/tools never touched —
  wiring-only honored: consumed, not modified.)

---

## 9. Files

**Created:** `code/src/testing/helpers/judge_quality_test_helper.js`,
`code/src/testing/scenarios/S307..S314_*.json` (8 files: S307–S314),
`scripts/spikes/gate33_phase33_judge_quality.js`,
`artifacts/decisions/_phase_33_checkpoints/stage_mid.md`,
`artifacts/decisions/_phase_33_checkpoints/stage_a.md`,
`artifacts/decisions/_phase_33_checkpoints/stage_final.md`,
`artifacts/decisions/DECISION-2026-06-14-phase-33-quality-judge-bridge.md` (this file),
`artifacts/spikes/gate33_phase33/*` (Gate #10 evidence),
`artifacts/projects/phase33_gate10/*` (seeded Gate #10 project).

**Modified:** `code/src/ai_os/conversationEngine.js` (judgeQuality + respondGate extension + export),
`code/src/workspace/apiServer.js` (judge-quality endpoint),
`code/src/runtime/agents/adapters/mock_responses.json` (1 mock entry: mock-qj-s307),
`progress/status.json` (closure).

---

## 10. Closure gate

- [x] All 5 QUALITY_JUDGE transitions covered (S307,S311,S312,S313,S314) + fail-closed guards
      (S308,S309,S310) GREEN.
- [x] Full SU suite **307/0/5 (312 total)** exit 0; no new fails; 5 skips = docker container scenarios.
- [x] Track A clean; §ARC=8; L2=80; roles=13; doctor=35; 7 critical files byte-identical.
- [x] LOCK-1 / LOCK-2 / LOCK-3 / LOCK-5 applied + verified.
- [x] RULING-9 extends to builder_output (no new RULING).
- [x] Gate #10 REAL evidence on disk, real persist-then-BLOCK + real APPROVE_SHIP advance to
      DEPLOYMENT_OR_END (PHASE-24 lesson honored: no closure text written before gate33_result.json
      existed + read PASS from a real call).
- [x] Decision artifact (this file) + stage_final checkpoint + status.json phase_33 block.
- Remaining pipeline gap: **ONE bridge** — DEPLOYMENT (`deployProject` DEPLOYMENT_OR_END →
  LIVE_DELIVERABLE, Gate 3) → PHASE-34 (pending decision).
- Closure commit stays **LOCAL** until explicit CTO push GO → tag phase-33-complete → GitHub clone
  verify → TRULY CLOSED.
