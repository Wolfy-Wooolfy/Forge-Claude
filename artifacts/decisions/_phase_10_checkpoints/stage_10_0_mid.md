# PHASE-10 STAGE 10.0 — MID-STAGE CHECKPOINT

**Fired at:** 50% completion (after §1.1 plan artifact, before §1.2 contract doc)
**Date:** 2026-05-13
**Author:** Claude (CTO advisor) — implementation arm

---

## Status

| Item | Status |
|---|---|
| §1.1 plan artifact written | ✓ `DECISION-20260513-1000-phase-10-plan.md` |
| §1.2 contract doc written | ✗ NOT YET — awaiting Khaled GO |
| §1.3 stage checkpoint written | ✗ NOT YET |
| §1.4 status.json patched | ✗ NOT YET |
| Any `.js` files written | ✗ NONE |
| Any L2 tools modified | ✗ NONE |
| Any L3 rules modified | ✗ NONE |
| Any `code/**` writes | ✗ NONE |

---

## Confirmation: 6-Stage Plan Committed

Plan artifact written at:
`artifacts/decisions/DECISION-20260513-1000-phase-10-plan.md`
Status: `OWNER_APPROVAL_PENDING`

The 6 sub-stages with day budgets are:

| Stage | Title | Days |
|---|---|---|
| 10.0 | Foundation + Contract | 1.5 |
| 10.1 | Conversation Graph + Loop State | 3.0 |
| 10.2 | Debate Protocol | 2.0 |
| 10.3 | Iteration Controller + Approval Gates | 2.0 |
| 10.4 | L2 Tools + Doctor + PHASE-9 Item 1 | 1.5 |
| 10.5 | End-to-End Demo + Closure | 2.5 |

---

## The 17 State IDs I Will Encode in §1.2

These are the authoritative state IDs resolved in Step 0 (2026-05-13 session).
The contract §2 state machine and §13 boot validator will use EXACTLY these 17.

### 14 Forward States (one per Decision §5 numbered step)

| # | State ID | Decision §5 step | Gate hosted |
|---|---|---|---|
| 1 | `OWNER_INTENT` | 1. Owner intent | — |
| 2 | `ARCHITECT_DESIGN` | 2. Architect designs | — |
| 3 | `SPEC_WRITER_FORMALIZE` | 3. Spec Writer formalizes | — |
| 4 | `REVIEWER_SPEC` | 4. Reviewer reviews spec (Phase A) | — |
| 5 | `COST_ESTIMATE` | 5. Cost Estimator predicts cost | — |
| 6 | `ENV_REPORT` | 6. Environment Agent reports | Owner Gate 1 (exit transition) |
| 7 | `TEST_DESIGN` | 7. Test Designer generates scenarios | — |
| 8 | `BUILDER` | 8. Builder implements | — |
| 9 | `RUN_TESTS` | 9. Forge runs tests | — |
| 10 | `REVIEWER_CODE_AND_SECURITY` | 10. Reviewer (Phase B) + Security | Debate Protocol |
| 11 | `DOCUMENTATION` | 11. Documentation Agent | — |
| 12 | `QUALITY_JUDGE` | 12. Quality Judge synthesizes | Owner Gate 2 (exit transition) |
| 13 | `DEPLOYMENT_OR_END` | 13. Deployment (if enabled) | Owner Gate 3 (conditional) |
| 14 | `LIVE_DELIVERABLE` | 14. Live deliverable + audit trail | — |

### 3 Terminal States

| # | State ID | Entered when |
|---|---|---|
| 15 | `COMPLETE` | Successful exit from LIVE_DELIVERABLE |
| 16 | `ESCALATED` | Iteration cap hit OR hard failure OR budget exceeded |
| 17 | `ABORTED_BY_OWNER` | Owner calls orchestration.abort tool |

**NOTE on gate states (not in the 17):** OWNER_GATE_1, OWNER_GATE_2, OWNER_GATE_3
are NOT state IDs. They are blocking semantics embedded in the exit-transition
guards of ENV_REPORT, QUALITY_JUDGE, and DEPLOYMENT_OR_END respectively.
Per Step 0 authoritative resolution.

---

## JSON Schemas I Will Define in §1.2

All schemas will use `"$schema": "http://json-schema.org/draft-07/schema#"`.
Minimum 5 schemas (PROMPT §1.2 §3 requirement):

### 1. ConversationNode
```json
{
  "node_id": "string",
  "role_id": "string",
  "input_envelope": "object",
  "output_envelope": "object",
  "timestamp": "string (ISO 8601)",
  "invocation_id": "string",
  "model_id": "string",
  "mock_mode": "boolean",
  "cost_usd": "number"
}
```

### 2. ConversationEdge
```json
{
  "from_node_id": "string",
  "to_node_id": "string",
  "transition_type": "enum: NORMAL | GATE_APPROVE | GATE_REJECT | LOOP_BACK | ESCALATE | ABORT",
  "decision_basis": "string"
}
```

### 3. ConversationGraph
```json
{
  "project_id": "string",
  "loop_id": "string",
  "iteration_count": "integer (0..5)",
  "current_state": "enum: <17 state IDs>",
  "nodes": "ConversationNode[]",
  "edges": "ConversationEdge[]",
  "started_at": "string (ISO 8601)",
  "last_advanced_at": "string (ISO 8601)"
}
```

### 4. OwnerGateEnvelope
```json
{
  "gate_id": "enum: 1 | 2 | 3",
  "project_id": "string",
  "loop_id": "string",
  "payload": "object (gate-specific content)",
  "timeout_behavior": "BLOCK_INDEFINITELY",
  "responded_at": "string (ISO 8601) | null",
  "response": "string | null"
}
```

### 5. DebateVerdict
```json
{
  "verdict": "enum: AGREE | DISAGREE | ARBITRATED",
  "winning_position": "string",
  "basis": "string",
  "debate_log": "DebateRound[]"
}
```

### Additional schemas (contract §12 audit row):
```json
{
  "ts": "string (ISO 8601)",
  "loop_id": "string",
  "from_state": "enum: <17 state IDs>",
  "to_state": "enum: <17 state IDs>",
  "transition_type": "enum: NORMAL | GATE_APPROVE | GATE_REJECT | LOOP_BACK | ESCALATE | ABORT",
  "role_invoked": "string | null",
  "mock": "boolean",
  "cost_usd": "number",
  "owner_gate_id": "integer | null"
}
```

---

## Open Questions / Scope Concerns

None. Step 0 ambiguity was resolved authoritatively by the CTO. No new
ambiguities identified while writing the plan artifact.

The one item to watch during §1.2 drafting: the Debate Protocol (§1.2 §5)
specifies "Reviewer ↔ Security Auditor debate, Quality Judge arbitrates."
The contract must be precise about which role IDs map to which agents:
- Reviewer = `reviewer` role (REVIEWER_CODE_AND_SECURITY state)
- Security Auditor = `security_auditor` role (same state, parallel)
- Arbitrator = `quality_judge` role

This is not an ambiguity — it is a drafting note for §1.2 §5.

---

## Awaiting GO

PAUSE. Will not write §1.2 until Khaled confirms GO.

*Mid-checkpoint authored: 2026-05-13*
