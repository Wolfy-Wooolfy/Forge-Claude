# PHASE-33 — Stage MID Checkpoint

**Phase:** PHASE-33 — QUALITY_JUDGE bridge (`judgeQuality`) + Gate 2 (`respondGate` extension)
**Stage:** MID (STOP point — simple half only; REJECT_AND_LOOP / APPROVE_WITH_CAVEATS / Gate #10 NOT yet wired; full suite NOT run; status.json NOT touched)
**Date:** 2026-06-14
**Author:** Claude (Opus 4.8), under CTO GO "PHASE-33 §0 VERIFIED — GO (proceed to MID checkpoint)"
**Cost so far:** $0.00 (mock-only)

---

## 1. Deliverable (the simple half)

Two production changes in `code/src/ai_os/conversationEngine.js` + one endpoint mirror + mocks/scenarios.

### 1.1 `judgeQuality(body)` — persist-then-BLOCK (mirrors `reportEnv`, NOT `documentProject`)

Inserted after `documentProject()` and before the Cost-Estimate bridge; added to the engine's
return/export block. It drives the `quality_judge` role at the `QUALITY_JUDGE` state and **does NOT
advance** — the loop stays at `QUALITY_JUDGE` pending owner Gate 2 (resolved later by `respondGate`).
This is correct because every `QUALITY_JUDGE` outbound edge in `conversation_graph.js` carries a
**non-null** `gate_check` ("Gate 2 …") — only the owner's gate response moves the loop.

Control flow (exact):
1. Resolve `project_id` + `loop_id` (same path as `documentProject`). Missing → `PROJECT_NOT_FOUND` /
   `NO_LOOP_ID` (`advanced:false`).
2. `orchestration.get_status` guard: `current_state === "QUALITY_JUDGE"`, else `WRONG_STATE`
   (echoes `current_state`).
3. Read `spec.json` + `architect_design.json` via `reg.invoke("fs.read_file")` (REQUIRED) →
   missing/unparseable → `INPUT_NOT_FOUND`.
4. **Best-effort optionals (LOCK-5 — present→include, absent→omit, NO fail-close):**
   `review_report.json → security_audit`, `test_plan.json → test_plan`,
   `documentation.json → documentation`, `cost_estimate.json → cost_estimate`,
   `env_report.json → environment`. Read via a local `_bestEffortObj()` helper (returns `undefined`
   on miss/parse-fail; never throws, never fail-closes).
5. **RULING-9 (Option B) — `builder_output` is OPTIONAL, manifest-restricted** (same rule
   `documentProject` applies to its `code` object; CTO confirmed §0 it extends to `builder_output`,
   no new RULING):
   - `build_manifest.json` ABSENT → GRACEFUL: omit `builder_output`; judge from spec+design (+optionals).
   - PRESENT + valid → manifest-restricted `builder_output` `{ files_written, summary,
     dependencies_added:[] }` from the listed files' on-disk content.
   - PRESENT + corrupt/unparseable, OR lists a file absent on disk, OR empty `files[]` →
     `QUALITY_MANIFEST_CORRUPT`, FAIL-CLOSED (no role call, no write, no `gate_pending`).
6. `role.invoke("quality_judge", { project_id, spec, design, [optionals…], [builder_output] })`,
   provider default **openai/gpt-4o** (LOCK-3 — overrides the role's `anthropic` default), 30s timeout
   race (mirrors `reportEnv`).
7. On role SUCCESS: persist `quality_report.json` via `reg.invoke("fs.write_file")` (fail-closed →
   `QUALITY_WRITE_FAILED`). **No `advance_state`.** Return `{ ok:true, loop_id, quality_report,
   gate_pending:2, advanced:false, model_used }`.
8. On role non-SUCCESS → fail-closed (no write). `metadata.reason === "INVALID_ROLE_OUTPUT"` →
   `QUALITY_PARSE_FAILED`; any other reason → `QUALITY_FAILED` (mirrors `documentProject`).

Fail-closed taxonomy (all `advanced:false`, no write):
`WRONG_STATE / INPUT_NOT_FOUND / QUALITY_MANIFEST_CORRUPT / QUALITY_PARSE_FAILED / QUALITY_FAILED /
QUALITY_WRITE_FAILED`.

### 1.2 `respondGate(body)` — extended to Gate 2 (LOCK-1 + LOCK-2 applied)

The existing Gate-1 `respondGate` is generalised to `gate_id ∈ {1, 2}` via two module-level maps:

```
_GATE_RESPONSES = { 1: ["APPROVE","REJECT"],
                    2: ["APPROVE_SHIP","APPROVE_WITH_CAVEATS","REJECT_AND_LOOP"] }
_GATE_HOST_STATE = { 1: "ENV_REPORT", 2: "QUALITY_JUDGE" }
```

- **LOCK-1 (the silent-break trap — fixed):** the `orchestration.respond` invoke now passes
  `gate_id: gate_id` (the caller's value), **NOT** a literal `1`. The returned `gate_id` echo is also
  the caller's value (was hardcoded `1`).
- **LOCK-2 (regression guard):** validation is now per-gate (`_GATE_RESPONSES[gate_id]`) and the host
  state is per-gate (`_GATE_HOST_STATE[gate_id]`). Gate 1 semantics are byte-equivalent: APPROVE/REJECT
  valid only when at ENV_REPORT; any other token → `INVALID_GATE_RESPONSE`.
- Gate 3 is intentionally NOT opened (future phase): `_GATE_RESPONSES[3]` is `undefined` →
  `validResponses` falsy → `INVALID_GATE_RESPONSE` (fail-closed).
- `next_state` is owned entirely by `orchestration.respond` → `fireGate` (`approval_gates.js`);
  `respondGate` only echoes it. APPROVE_SHIP / APPROVE_WITH_CAVEATS → `DEPLOYMENT_OR_END`;
  REJECT_AND_LOOP → `BUILDER` / `ESCALATED` (resolved inside `fireGate` → `tryAdvanceForLoopBack`).

### 1.3 Endpoint (apiServer.js) — 4-line mirror

`POST /api/ai-os/project/judge-quality` → `conversationEngine.judgeQuality(body)`, inserted verbatim
after the `/document-project` block. No route logic. (`respondGate` needs no new endpoint — the
existing `respond-gate` path now accepts gate_id:2.)

### 1.4 Mocks

`mock_responses.json` + 1 entry: `mock|mock-qj-s307|scenario:S307` (verdict APPROVED, all 10
`role_assessments`, schema-valid quality_judge output). The existing `mock-qj-s116`/`s118` (PHASE-7-F
role tests) are untouched.

---

## 2. LOCK compliance — explicit

| LOCK | Requirement | Status |
|---|---|---|
| **LOCK-1** | `orchestration.respond` must pass `body.gate_id`, not literal `1` | **APPLIED** — `gate_id: gate_id`. Proven by S311 (see §4). |
| **LOCK-2** | S281/S282/S283 stay green under new per-gate validation | **GREEN** (§3) — all 3 pass; S283 still catches the bad token. |
| **LOCK-3** | Real call provider override to `openai` | judgeQuality defaults `quality_provider:"openai"`, `quality_model:"gpt-4o"` (relevant at STEP B; mock bypasses). |
| **LOCK-4** | Dedicated APPROVE_WITH_CAVEATS scenario (S313) | DEFERRED to second half per GO MID scope (only S307+S311 wired now). |
| **LOCK-5** | Optional inputs best-effort; only `build_manifest`→`builder_output` is RULING-9 fail-closed | **APPLIED** — `_bestEffortObj` for the 5 optionals; RULING-9 only on the manifest. |

---

## 3. Scenario results (mock provider, $0)

MID set + LOCK-2 regression:

```
✓ S307  judgeQuality happy → quality_report persisted, gate_pending:2, advanced:false, stays QUALITY_JUDGE
✓ S311  respondGate Gate 2 APPROVE_SHIP → DEPLOYMENT_OR_END
✓ S281  Gate 1 APPROVE → TEST_DESIGN          (LOCK-2 regression)
✓ S282  Gate 1 REJECT → ESCALATED              (LOCK-2 regression)
✓ S283  Gate 1 invalid token → INVALID_GATE_RESPONSE, graph unchanged (LOCK-2 regression)
ALL PASS — 5 passed, 0 failed, 0 skipped (954ms)
```

Adjacent-bridge regression (respondGate change is shared infra — verified no collateral):

```
✓ S277 ✓ S278 ✓ S279 ✓ S280   (reportEnv / Gate-1 host)
✓ S302 ✓ S303 ✓ S304 ✓ S305 ✓ S306   (documentProject — feeds QUALITY_JUDGE)
ALL PASS — 9 passed, 0 failed (492ms)
```

---

## 4. LOCK-1 trap — positive proof (not just "green")

S311 seeds the loop at QUALITY_JUDGE and calls `respondGate({ gate_id:2, response:"APPROVE_SHIP" })`,
asserting `advanced_to === "DEPLOYMENT_OR_END"`. **If `gate_id` were still hardcoded to `1`**, the
engine would call `orchestration.respond({ gate_id:1, response:"APPROVE_SHIP" })` → `fireGate(1, …)` →
`"APPROVE_SHIP"` is NOT in Gate 1's option set → `fireGate` throws
`gate_responder returned invalid response 'APPROVE_SHIP' for Gate 1` → `respondResult` non-SUCCESS →
`{ gate_error:"GATE_RESPOND_FAILED", advanced:false }` → `advanced_to_deployment` would be **false** →
**S311 FAILS**. S311 passing with `advanced_to === DEPLOYMENT_OR_END` is therefore direct evidence the
caller's `gate_id:2` is honoured end-to-end (UI→engine→tool→fireGate). The silent-break trap is closed.

---

## 5. Track A (preliminary — full greps at STEP A)

- `fs.*Sync` in conversationEngine.js = **2** (pre-existing, lines 48/751; judgeQuality adds none —
  all I/O via `reg.invoke("fs.read_file"/"fs.write_file"/"orchestration.*"/"role.invoke")`).
- `child_process | fetch( | new OpenAI(` in conversationEngine.js = **1 (0 new)** — the pre-existing
  benign `"child_process"` string literal (Node builtin-names array). judgeQuality/respondGate add none.
- `judge-quality` endpoint = 1. apiServer adds no logic (4-line mirror).
- §ARC unchanged = **8**. L2 tools = **80** (no new tools). Roles = **13**. Doctor = **35**.
- `quality_judge_role.js` / `approval_gates.js` / `orchestration_tools.js` / graph: **NOT modified**
  (derived gate semantics live entirely in the existing `fireGate`/graph; the bridge only invokes).

---

## 6. Change surface (MID)

**Modified:**
- `code/src/ai_os/conversationEngine.js` — `judgeQuality()` (new) + `respondGate()` extended +
  `judgeQuality` in return block.
- `code/src/workspace/apiServer.js` — `POST /api/ai-os/project/judge-quality` (4-line mirror).
- `code/src/runtime/agents/adapters/mock_responses.json` — +1 entry (`mock-qj-s307`).

**New:**
- `code/src/testing/helpers/judge_quality_test_helper.js` — `_seedLoopAtQualityJudge` + `runS307…` +
  `runS311…` (S308–S310, S312, S313 runners added in the second half).
- `code/src/testing/scenarios/S307_judge_happy_path.json`
- `code/src/testing/scenarios/S311_respond_gate2_approve_ship.json`

**NOT touched (per MID rules):** `progress/status.json`, the quality_judge role, approval_gates,
orchestration tools/graph. NO real API call. Local-only; not committed/pushed.

---

## 7. STOP — awaiting CTO MID verification

Per GO, implementation halts here. **Not yet wired/proven:** S308 (wrong-state), S309 (input-missing),
S310 (manifest-corrupt / QUALITY_MANIFEST_CORRUPT), S312 (REJECT_AND_LOOP → BUILDER, seed iter-0,
cap=5), S313 (APPROVE_WITH_CAVEATS → DEPLOYMENT_OR_END), and Gate #10.

**Next (after CTO MID verify):** second half — S308–S310 + S312 + S313 + full SU suite (expect
306/0/5, 311 total) + Track A greps + `stage_a.md` → STOP → then STEP B Gate #10 (explicit owner
approval in chat required first; provider:"openai" per LOCK-3).

**WAITING FOR CTO.**
