# PHASE-10 STAGE 10.3 MID-STAGE CHECKPOINT

| Field | Value |
|---|---|
| Stage | 10.3 — Iteration Controller + Approval Gates |
| Checkpoint | Mid-stage (§1.1 + §1.2 complete, before §1.3–§1.6 scenarios) |
| Date | 2026-05-13 |
| Author | Claude (implementation arm) |

---

## §1 — Contract Amendment Note (A3 — per DECISION-20260513-1500)

**Contract version at time of this checkpoint: v1.2.0**

The contract was amended from v1.1.0 → v1.2.0 prior to any Stage 10.3 code.
Authority: `DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0.md`
(Status: OWNER_APPROVED, 2026-05-13)

**Binding semantics applied in this stage:**
- `iteration_controller.js` implements Path B (`>=`): `exceeded := iteration_count >= ITERATION_CAP`
- The counter NEVER exceeds `ITERATION_CAP` (= 5) in any persisted graph
- `tryAdvanceForLoopBack` checks BEFORE incrementing — if exceeded, escalates without incrementing
- Replaces the originally-planned `incrementIteration` API (per CTO resolution)

This checkpoint is the A3 action from DECISION-20260513-1500 §5.

---

## §2 — JS Files Confirmed Written

| # | Path | Lines | Status |
|---|---|---|---|
| 1 | `code/src/runtime/orchestration/iteration_controller.js` | 159 | ✓ CREATED |
| 2 | `code/src/runtime/orchestration/approval_gates.js` | 233 | ✓ CREATED |

### Exports confirmed — iteration_controller.js

```
ITERATION_CAP     — re-exported from conversation_graph.js (contract §6.1)
checkCap          — pure: (graph) → { exceeded: bool, count: int, cap: int }
tryAdvanceForLoopBack — async: (project_id, loop_id, ctx) → { advanced, escalated, graph[, escalation_path] }
triggerEscalation — async: (project_id, loop_id, reason, ctx) → { escalation_path, ts }
```

### Exports confirmed — approval_gates.js

```
GATE_IDS              — [1, 2, 3]
GATE_HOST_STATES      — { 1: "ENV_REPORT", 2: "QUALITY_JUDGE", 3: "DEPLOYMENT_OR_END" }
GATE_RESPONSE_OPTIONS — { 1: ["APPROVE","REJECT"], 2: ["APPROVE_SHIP","APPROVE_WITH_CAVEATS","REJECT_AND_LOOP"], 3: ["APPROVE","REJECT"] }
validateGateEnvelope  — pure: (envelope) → { valid: bool, errors: string[] }
shouldSkipGate3       — pure: (project_config) → bool
fireGate              — async: (gate_id, project_id, loop_id, payload, ctx) → { envelope, response, responded_at, next_state[, escalated, escalation_path] }
```

---

## §3 — Path B Semantics in iteration_controller.js

**`checkCap` (pure):**
```javascript
function checkCap(graph) {
  const count = (graph && typeof graph.iteration_count === "number")
    ? graph.iteration_count : 0;
  return { exceeded: count >= ITERATION_CAP, count, cap: ITERATION_CAP };
}
```
`exceeded = true` when `count >= 5`. Count 5 → exceeded, not count 6.

**`tryAdvanceForLoopBack` decision tree:**
```
checkCap(graph).exceeded === true  → triggerEscalation (NO increment) → ESCALATED
checkCap(graph).exceeded === false → graph.iteration_count += 1 → saveLoop → LOOP_BACK audit → BUILDER
```
`validateGraph` (in `loop_state.js`) would throw if count > 5 were attempted — the check-before-increment design makes this impossible.

**`triggerEscalation` — escalation reason constraint:**
The ESCALATE audit row does NOT include an `escalation_reason` field (schema `additionalProperties: false`).
The reason appears ONLY in the escalation markdown artifact (v1.1.0 path: `orchestration/<loop_id>/escalation_<ts>.md`).

---

## §4 — ctx.gate_responder Convention in approval_gates.js

**Code excerpt:**
```javascript
if (typeof ctxObj.gate_responder === "function") {
  respData = await ctxObj.gate_responder(envelope);
} else if (process.env.FORGE_OWNER_AUTO_APPROVE === "1") {
  respData = _AUTO_RESPONSE[gate_id];
} else {
  throw new Error(
    "fireGate: gate " + gate_id + " would block indefinitely — " +
    "no gate_responder in ctx and FORGE_OWNER_AUTO_APPROVE is not set"
  );
}
```

**Auto-approve defaults (FORGE_OWNER_AUTO_APPROVE=1):**

| Gate | Auto-response |
|---|---|
| 1 | `{ response: "APPROVE" }` |
| 2 | `{ response: "APPROVE_SHIP" }` |
| 3 | `{ response: "APPROVE", selected_target: "_test_default" }` |

**Gate 3 APPROVE hard restriction (contract §7.4):**
An APPROVE response without `selected_target` throws: `"Gate 3 APPROVE requires selected_target"`.
This is enforced in both the response validation step AND `validateGateEnvelope`.

---

## §5 — Gate 2 REJECT_AND_LOOP Delegation Pattern

`fireGate` delegates Gate 2 REJECT_AND_LOOP entirely to `tryAdvanceForLoopBack`:

```javascript
if (gate_id === 2 && response === "REJECT_AND_LOOP") {
  const adv = await tryAdvanceForLoopBack(project_id, loop_id, ctxObj);
  return {
    envelope, response, responded_at,
    next_state:      adv.escalated ? "ESCALATED" : "BUILDER",
    escalated:       adv.escalated,
    escalation_path: adv.escalation_path || null
  };
}
```

`tryAdvanceForLoopBack` owns: the cap check, the increment, the LOOP_BACK audit row, and the state mutation.
`fireGate` does NOT append a second audit row for this case. The LOOP_BACK / ESCALATE row from `iteration_controller.js` is the sole audit record for this transition.

---

## §6 — Track A Verification (All 0)

```
gate_responder in code/src/runtime/ outside approval_gates.js:   1 file found = approval_gates.js only ✓
direct fs.* in approval_gates.js:                                 0 ✓
new OpenAI / child_process / fetch in approval_gates.js:          0 ✓
gate_responder in iteration_controller.js:                        0 ✓
```

All I/O in both files routes through `getDefaultRegistry().invoke()` (Track A compliant).

---

## §7 — Stage 10.1/10.2 Files Unmodified

The following files are unchanged from their respective stage closures:
- `conversation_graph.js` — TRANSITION_TABLE trigger strings already updated to v1.2.0 in amendment A2
- `loop_state.js` — unchanged
- `_registry.js` — unchanged
- `debate_protocol.js` — unchanged

---

## Next Steps

1. Write `code/src/testing/helpers/gates_test_helper.js` (S145–S148 helpers)
2. Write S145 — `S145_iteration_cap_triggers_escalated.json`
3. Write S146 — `S146_owner_gate_1_blocks_until_approve.json`
4. Write S147 — `S147_gate_2_reject_loops_back_to_builder.json`
5. Write S148 — `S148_gate_3_skipped_when_deployment_disabled.json`
6. Run full test suite → target 143/0/5
7. Write `stage_10_3.md` closure checkpoint (12 criteria)
8. Patch `progress/status.json` (A4: add `contract_amendment` field to stage 10_3)
9. Post 12-criterion closure gate

---

*Mid-checkpoint authored: 2026-05-13 — Stage 10.3*
