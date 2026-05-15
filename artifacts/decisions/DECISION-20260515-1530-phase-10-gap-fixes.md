# DECISION-20260515-1530 — PHASE-10 Known-Gap Fixes (Step 3)

| Field | Value |
|---|---|
| Date | 2026-05-15 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED — 2026-05-15 |
| Scope | PHASE-10 Step 3 — Gap 3 (tryAdvanceForLoopBack state setter) + Gap 4 (_validateAuditRow additionalProperties) |
| Related | `DECISION-20260514-1500-phase-10-closure.md` (§3 three-step plan, OWNER_APPROVED) |
| Related | `DECISION-2026-05-15T14-00-live-ratification-pre-phase-11-final.md` (LIVE-RAT APPROVED) |

---

## 1. Header

Two production gaps from PHASE-10 closure §3 remediated in this step. Mock-only changes,
$0.00 cost. Three gaps deferred as specified in the closure plan.

---

## 2. What Was Fixed

### Gap 3 — tryAdvanceForLoopBack does not call setCurrentState

**Problem:** `tryAdvanceForLoopBack` in `iteration_controller.js` incremented `iteration_count`
and appended the `LOOP_BACK` audit row, but never updated `graph.current_state` from
`QUALITY_JUDGE` to `BUILDER`. The returned `graph` object had stale `current_state`.
Any caller reading the returned graph (or re-loading it) would see the wrong state.

**Impact:** Production blocker. The loop-back path left persisted graph in wrong state.
Workaround was present in `e2e_loop_helper.js` line 271 (now removed).

**Fix:**

File: [iteration_controller.js](code/src/runtime/orchestration/iteration_controller.js)

After `appendAuditRow` call (line ~146), before the return:
```javascript
// ADDED:
await setCurrentState(project_id, loop_id, "BUILDER", ctxObj);
const updatedGraph = await loadLoop(project_id, loop_id, ctxObj);
return { advanced: true, escalated: false, graph: updatedGraph };
```

Pattern matches the escalation path (lines 123–128) which reloads via `loadLoop` after
`triggerEscalation`. `setCurrentState` was already imported on line 12.

**Workaround removed:** `e2e_loop_helper.js` lines 270–271 (comment + duplicate `setCurrentState`
call) deleted. S154 still passes via the now-correct source code path.

**Regression guard added:** `gates_test_helper.js` `runS147Sequence` now returns
`persisted_state: updated.current_state`. S147 gains assertion
`{ "type": "state_field_equals", "field": "persisted_state", "expected": "BUILDER" }` — any
future revert of this fix fails S147 loudly.

---

### Gap 4 — _validateAuditRow does not enforce additionalProperties: false

**Problem:** `_validateAuditRow` in `loop_state.js` validated presence and type of required
fields, but did not reject rows with unexpected fields. Contract §12.2 specifies
`additionalProperties: false`.

**Fix:**

File: [loop_state.js](code/src/runtime/orchestration/loop_state.js)

Added two constants after `AUDIT_REQUIRED` (line ~9):
```javascript
const AUDIT_OPTIONAL = Object.freeze(["role_invoked", "owner_gate_id"]);
const AUDIT_ALLOWED  = Object.freeze([...AUDIT_REQUIRED, ...AUDIT_OPTIONAL]);
```

Added check inside `_validateAuditRow` after all type checks, before `return errors`:
```javascript
// Contract §12.2: additionalProperties: false
for (const key of Object.keys(row)) {
  if (!AUDIT_ALLOWED.includes(key)) {
    errors.push("unexpected field: " + key + " (contract §12.2 additionalProperties:false)");
  }
}
```

`appendAuditRow` already throws on any validation error — no callers need changes.

**Regression scenario:** S157 (`S157_audit_row_rejects_extra_field.json`) + helper
`loop_state_validation_helper.js`. The helper calls `appendAuditRow` with a valid base row
plus `bogus_field: "x"`, catches the thrown Error, and asserts both
`rejected_with_unexpected_field: true` and `rejection_message_contains_contract_ref: true`.
`appendAuditRow` throws before any `fs.append_file` call — no I/O required for the test.

---

## 3. What Was Deferred

| Gap | Reason | Target |
|---|---|---|
| Gap 1 — orchestration_summary auto-wire | Belongs with PHASE-11 runner integration; no standalone value without full runner | PHASE-11 |
| Gap 2 — debate_verdicts.jsonl schema | Test-helper-only writer; low immediate production risk | PHASE-12 |
| Gap 5 — kb.ingest_url per-chunk budget | PHASE-9 closure explicitly deferred to PHASE-12 | PHASE-12 |

---

## 4. SU Test Results

**Before:** 151 passed, 0 failed, 5 skipped (156 total)

**After:** **152 passed, 0 failed, 5 skipped (157 total)**

Changes:
- S147 — 4 assertions → 5 assertions (added `persisted_state` check); still PASS ✓
- S154 — workaround line removed; still PASS (now via corrected source path) ✓
- S157 — new scenario; PASS ✓

No existing scenario changed pass/fail status.

---

## 5. Track A Compliance

| File | writeFileSync/etc | new OpenAI() | child_process | fetch() | Verdict |
|---|---|---|---|---|---|
| `iteration_controller.js` | 0 | 0 | 0 | 0 | CLEAN |
| `loop_state.js` | 0 | 0 | 0 | 0 | CLEAN |
| `e2e_loop_helper.js` | 0* | 0 | 0* | 0 | CLEAN |
| `gates_test_helper.js` | 0 | 0 | 0 | 0 | CLEAN |
| `S147_gate_2_reject_loops_back_to_builder.json` | 0 | 0 | 0 | 0 | CLEAN |
| `loop_state_validation_helper.js` | 0 | 0 | 0 | 0 | CLEAN |
| `S157_audit_row_rejects_extra_field.json` | 0 | 0 | 0 | 0 | CLEAN |

*`e2e_loop_helper.js` grep reports 1 hit — false positive: the string `child_process` appears
in a pre-existing Track A compliance comment on line 7, not in executable code.

**Track A verdict: CLEAN across all 7 files.**

---

## 6. Cost Actuals

$0.00 — mock-only changes, no LLM invocations.

---

## 7. Owner Approval

**Status:** OWNER_APPROVED — 2026-05-15

Ratified by owner KhElmasry on 2026-05-15 with phrase:

> "STEP-3 APPROVED. PHASE-10 closed."

**PHASE-10 closure cascade now complete:**
- PHASE-10 technical closure: DECISION-20260514-1500 (OWNER_APPROVED 2026-05-15)
- Live ratification: DECISION-2026-05-15T14-00 (OWNER_APPROVED 2026-05-15, semantic review waived)
- Gap fixes (Gap 3 + Gap 4): this artifact (OWNER_APPROVED 2026-05-15)

**Remaining deferred items** (per §3 above):
- Gap 1 → PHASE-11 runner integration
- Gap 2 → PHASE-12 production hardening
- Gap 5 → PHASE-12 production hardening

**Next:** PHASE-11 (Existing Project Intake) prompt to follow.
