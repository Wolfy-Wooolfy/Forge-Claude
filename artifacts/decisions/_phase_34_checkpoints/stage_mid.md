# PHASE-34 — MID CHECKPOINT (the simple half)

**Phase:** PHASE-34 — DEPLOYMENT bridge (`deployProject`) + Gate 3 (`respondGate` extension)
**Checkpoint:** MID (skip path + gated-block path + Gate 3 APPROVE wiring, scenario-green) — STOP here for CTO verify
**Date:** 2026-06-15
**Predecessor:** PHASE-33 CLOSED, HEAD `15a79ab`, tag `phase-33-complete`
**Scope authority:** CTO GO (§0 VERIFIED), rulings #1–#4 + LOCK-1..6
**Cost this checkpoint:** $0.00 (mock-only; no real calls — Gate #10 is STEP B, owner-approved spend)

---

## 1. What was built (MID scope only)

### 1.1 `deployProject()` — `code/src/ai_os/conversationEngine.js`
Added after `reportEnv`, before the respondGate block. Drives the `DEPLOYMENT_OR_END` state. Two paths:

- **SKIP path (LOCK-4 + LOCK-6):** `deployment_enabled === false` (body-driven, via reused
  `approval_gates.shouldSkipGate3({ deployment_enabled: body.deployment_enabled })`) →
  `orchestration.advance_state(to:"LIVE_DELIVERABLE", transition_type:"VACUOUS_SKIP")` — the same
  mechanism as `e2e_loop_helper.runS156`. No role call, no gate. Returns
  `{ advanced:true, advanced_to:"LIVE_DELIVERABLE", skipped:true }`. `shouldSkipGate3` skips ONLY
  on explicit `=== false`; missing/null/undefined/true → gated path (so Gate 3 is exercised by default).
- **GATED path (default):** state guard `DEPLOYMENT_OR_END` (else `WRONG_STATE`) → read
  `spec.json` + `architect_design.json` (REQUIRED → `INPUT_NOT_FOUND`) → best-effort optional
  `env_report.json` → `role.invoke("deployment", …, provider:"openai", model:"gpt-4o")` (LOCK-3;
  role default is anthropic, owner has no key), 30s timeout → on SUCCESS persist
  `deployment_plan.json` **before** returning → `{ gate_pending:3, advanced:false }`. **No
  `advance_state`** — every gated DEPLOYMENT_OR_END edge carries a non-null Gate 3 gate_check; only
  the owner's Gate 3 response moves the loop. The deployment role is ADVISORY — it produces a
  deployment PLAN, not a live deploy (bridge-only; no `deploy.*` execution). No `build_manifest`
  dependency → no RULING-9 branch (simpler than `judgeQuality`).

Fail-closed taxonomy (no write, no advance): `WRONG_STATE / INPUT_NOT_FOUND / DEPLOY_PARSE_FAILED`
(INVALID_ROLE_OUTPUT) `/ DEPLOYMENT_FAILED` (other, via `metadata.reason`) `/ DEPLOY_WRITE_FAILED`
(+ `SKIP_ADVANCE_FAILED` on the skip path). Guards for these are STEP A scenarios.

### 1.2 `respondGate()` Gate 3 extension — same file
- `_GATE_RESPONSES[3] = ["APPROVE","REJECT"]`; `_GATE_HOST_STATE[3] = "DEPLOYMENT_OR_END"`.
- **LOCK-1 (selected_target):** forwards `body.selected_target` into `orchestration.respond` →
  `fireGate` **conditionally** (only when present, via `Object.assign`). `next_state` stays owned by
  `orchestration.respond`/`fireGate` (LOCK-1: caller's `gate_id`, never a literal).
- APPROVE (with `selected_target`) → `LIVE_DELIVERABLE`; REJECT → `ESCALATED` (REJECT proven STEP A).

### 1.3 Endpoint — `code/src/workspace/apiServer.js`
`POST /api/ai-os/project/deploy-project` → `conversationEngine.deployProject(body)` (4-line mirror).
`respond-gate` route unchanged (already whole-body passthrough → `selected_target` flows for free).

### 1.4 Mock fixture — `mock_responses.json`
Added `mock|mock-dep-s316|scenario:S316` (a valid deployment-plan JSON matching the role OUTPUT_SCHEMA).

---

## 2. Two schema-validation traps found + fixed (same class)

Both are the **"present key with a non-string value fails the tool input_schema"** trap:

1. **`role_invoked: null` (skip path):** `orchestration.advance_state`'s `role_invoked` is typed
   `"string"` → explicit `null` failed validation → `SKIP_ADVANCE_FAILED` (S315 red). **Fix:** omit
   `role_invoked` entirely; the tool still records `role_invoked:null` via its `input.role_invoked ||
   null` default (LOCK-4 audit-row shape preserved). (`runS156`'s `_advance` already omits it.)
2. **`selected_target: undefined` (respondGate, the LOCK-1 trap in reverse):** forwarding
   `selected_target` unconditionally broke **Gates 1 AND 2** (undefined value, typed `"string"` →
   `orchestration.respond` validation fail). Caught by the LOCK-2 regression (6/7 red). **Fix:**
   conditional `Object.assign` — include `selected_target` only when present (mirrors the
   model/scenario_id pattern). This is exactly why LOCK-2 exists.

---

## 3. Scenarios — GREEN (mock-only)

| ID | Path | Result |
|---|---|---|
| **S315** | skip: `deployment_enabled=false` → VACUOUS_SKIP → LIVE_DELIVERABLE (no role/gate/plan; audit row `from=DEPLOYMENT_OR_END,to=LIVE_DELIVERABLE,role_invoked=null`) | ✓ PASS |
| **S316** | gated happy: role SUCCESS → `deployment_plan.json` persisted → `gate_pending:3, advanced:false`, loop STAYS `DEPLOYMENT_OR_END` | ✓ PASS |
| **S317** | Gate 3 APPROVE (+`selected_target`) → LIVE_DELIVERABLE (GATE_APPROVE row gate 3) — **positive LOCK-1 proof** (no `selected_target` → fireGate throws → would FAIL) | ✓ PASS |

**LOCK-2 regression (all GREEN):** Gate 1 — **S281, S282, S283**; Gate 2 — **S311, S312, S313, S314**.
Combined run: **10 passed / 0 failed / 0 skipped**.

---

## 4. Track A / counts

- `code/src/ai_os/conversationEngine.js`: `fs.*Sync` = **2** (unchanged); `child_process|fetch(|new
  OpenAI(` = **1** (pre-existing benign string, unchanged). deployProject + respondGate use only
  `reg.invoke` (`orchestration.get_status` / `orchestration.advance_state` / `orchestration.respond` /
  `fs.read_file` / `fs.write_file` / `role.invoke`) + the pure `shouldSkipGate3` import.
- `apiServer.js`: deploy-project route is a 4-line mirror (0 new `fs.*Sync`; the 28 is pre-existing).
- **Wiring-only files byte-UNMODIFIED (git-confirmed):** `conversation_graph.js`, `approval_gates.js`,
  `deployment_role.js`, `orchestration_tools.js` (+ `summary_writer.js` untouched — reserved for STEP A
  `finalizeDeliverable`).
- **§ARC = 8** (no new exception). **L2 = 80**, **roles = 13**, **doctor = 35** — all unchanged
  (no new tools/roles/checks this checkpoint).

---

## 5. Files

**Modified:** `code/src/ai_os/conversationEngine.js` (deployProject + respondGate Gate-3 + export),
`code/src/workspace/apiServer.js` (deploy-project route), `mock_responses.json` (mock-dep-s316).
**Created:** `code/src/testing/helpers/deploy_project_test_helper.js`,
`code/src/testing/scenarios/S315_deploy_skip_path.json`, `S316_deploy_gated_happy_path.json`,
`S317_respond_gate3_approve.json`, this checkpoint.

*Incidental (not PHASE-34): `artifacts/projects/test_conv_s06/…` (M) + `test_conv_s11/` (??) are
harness scratch left by the earlier full-suite run; unrelated to this phase.*

---

## 6. Deferred to STEP A (NOT wired/proven at MID — per GO)

- **`finalizeDeliverable` (LIVE_DELIVERABLE → COMPLETE, LOCK-5):** distinct explicit step + own
  endpoint, reusing `summary_writer.writeSummary()` (do NOT rewrite). Closes the pipeline to COMPLETE.
- **Gate 3 REJECT → ESCALATED** scenario.
- **Fail-closed guards:** wrong-state, input-not-found, role-failure (DEPLOY_PARSE_FAILED /
  DEPLOYMENT_FAILED), **APPROVE-missing-selected_target → GATE_RESPOND_FAILED**.
- **Full SU suite** run (≥ 307 + new, 0 fail) + Track A full grep + doctor exit 0.
- **Gate #10** real-path evidence (STEP B; explicit owner spend approval in chat first; openai/gpt-4o).

---

**STATUS: MID checkpoint complete — STOPPING for CTO verification.** No STEP A work begun.
Awaiting CTO "GO STEP A".
