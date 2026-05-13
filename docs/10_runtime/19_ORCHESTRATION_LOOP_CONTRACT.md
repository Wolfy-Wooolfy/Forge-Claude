# Orchestration Loop Contract v1.2.0

> **Status:** BINDING from Stage 10.0 close — 2026-05-13
> **Version:** v1.2.0
> **Authority chain:** `DECISION-20260510-vision-shift-multi-agent-conductor.md §5`
>   → `DECISION-20260513-1000-phase-10-plan.md`
>   → this document
>   → `code/src/runtime/orchestration/conversation_graph.js` (Stage 10.1)
> **Authored:** Claude (CTO advisor), Stage 10.0, 2026-05-13
> **Owner:** KhElmasry

---

## §1 — Purpose & Authority

### 1.1 Purpose

This document is the authoritative specification for the **Multi-Agent
Orchestration Loop** — the system that sequences Forge's 12 agent roles
through design, build, review, test, and deployment of owner-requested projects.

It defines:
- The 17-state state machine the loop traverses
- The conversation graph schema persisted per loop
- The message envelopes passed between agents
- The debate protocol that resolves agent disagreement
- The iteration controller that enforces the cap
- The 3 owner approval gates that gate progression
- The L3 permission policy integration
- The cost ledger integration
- The mock mode contract
- The failure and escalation semantics
- The audit trail requirements
- The boot validation that fails closed on mismatch

### 1.2 Authority Hierarchy

```
Layer-0 (peer authority):
  DECISION-20260510-vision-shift-multi-agent-conductor.md
    §5 — The 14-step iteration loop (source of truth for loop shape)
    §4 — Owner approval gates (source of truth for gate semantics)

Binding plan (PHASE-10 scope + stages):
  DECISION-20260513-1000-phase-10-plan.md

This contract (authoritative for implementation):
  docs/10_runtime/19_ORCHESTRATION_LOOP_CONTRACT.md  ← YOU ARE HERE

Implementation (Stages 10.1–10.5, does not exist yet):
  code/src/runtime/orchestration/conversation_graph.js
  code/src/runtime/orchestration/debate_protocol.js
  code/src/runtime/orchestration/iteration_controller.js
  code/src/runtime/orchestration/approval_gates.js
  code/src/runtime/tools/orchestration_tools.js
```

Any conflict between this contract and the implementation code is
resolved by this contract. Any conflict between this contract and
Decision §5/§4 is resolved by a new decision artifact (§14).

### 1.3 What This Contract Does NOT Govern

- Individual role system prompts → `docs/10_runtime/18b_ROLE_PROMPTS.md`
- Agent adapter selection → `docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md`
- KB memory integration → resolved in PHASE-9
- Frontend visibility of agent dialogue → PHASE-13
- Built-project scenario format → `docs/10_runtime/20_BUILT_PROJECT_HARNESS_CONTRACT.md`

---

## §2 — The 17-State State Machine

### 2.1 State Enum

The loop uses exactly **17 state IDs** (14 forward + 3 terminal).
No implementation may add, remove, or rename these IDs without a new
decision artifact + version bump (§14).

#### 14 Forward States

| # | State ID | Corresponding Decision §5 Step | Gate Hosted |
|---|---|---|---|
| 1 | `OWNER_INTENT` | 1. Owner intent | — |
| 2 | `ARCHITECT_DESIGN` | 2. Architect designs | — |
| 3 | `SPEC_WRITER_FORMALIZE` | 3. Spec Writer formalizes §2 artifact | — |
| 4 | `REVIEWER_SPEC` | 4. Reviewer reviews spec (Phase A) | — |
| 5 | `COST_ESTIMATE` | 5. Cost Estimator predicts cost | — |
| 6 | `ENV_REPORT` | 6. Environment Agent reports requirements | **Owner Gate 1** (exit guard) |
| 7 | `TEST_DESIGN` | 7. Test Designer generates scenarios | — |
| 8 | `BUILDER` | 8. Builder implements | — |
| 9 | `RUN_TESTS` | 9. Forge runs tests deterministically | — |
| 10 | `REVIEWER_CODE_AND_SECURITY` | 10. Reviewer (Phase B) + Security Auditor | Debate Protocol (§5) |
| 11 | `DOCUMENTATION` | 11. Documentation Agent | — |
| 12 | `QUALITY_JUDGE` | 12. Quality Judge synthesizes verdict | **Owner Gate 2** (exit guard) |
| 13 | `DEPLOYMENT_OR_END` | 13. Deployment (if enabled) | **Owner Gate 3** (conditional exit guard) |
| 14 | `LIVE_DELIVERABLE` | 14. Live deliverable + audit trail | — |

#### 3 Terminal States

| # | State ID | Entered When |
|---|---|---|
| 15 | `COMPLETE` | `LIVE_DELIVERABLE` finalizes audit trail |
| 16 | `ESCALATED` | Iteration cap hit · hard failure · budget exceeded · gate REJECT |
| 17 | `ABORTED_BY_OWNER` | Owner invokes `orchestration.abort` tool (any state) |

**Gate states note:** `OWNER_GATE_1`, `OWNER_GATE_2`, `OWNER_GATE_3` are NOT
state IDs. They are blocking guards on the exit transitions of `ENV_REPORT`,
`QUALITY_JUDGE`, and `DEPLOYMENT_OR_END` respectively. The loop remains in the
host state while the gate is blocking.

### 2.2 Transition Table

Full state machine transitions. Column `Gate Check` names the gate where the
transition is gated; `—` means the transition fires unconditionally on trigger.

| From | To | Trigger | Gate Check |
|---|---|---|---|
| *(loop created)* | `OWNER_INTENT` | `orchestration.start_loop` invoked | — |
| `OWNER_INTENT` | `ARCHITECT_DESIGN` | Owner intent captured in graph | — |
| `ARCHITECT_DESIGN` | `SPEC_WRITER_FORMALIZE` | `role.invoke(architect)` → SUCCESS | — |
| `SPEC_WRITER_FORMALIZE` | `REVIEWER_SPEC` | `role.invoke(spec_writer)` → SUCCESS | — |
| `REVIEWER_SPEC` | `COST_ESTIMATE` | Reviewer Phase A output has zero BLOCKER issues | — |
| `REVIEWER_SPEC` | `ESCALATED` | Reviewer Phase A output has ≥1 BLOCKER issue | — |
| `COST_ESTIMATE` | `ENV_REPORT` | `role.invoke(cost_estimator)` → SUCCESS | — |
| `ENV_REPORT` | `ENV_REPORT` | `role.invoke(environment)` → SUCCESS; blocks on Gate 1 | Gate 1 — BLOCK |
| `ENV_REPORT` | `TEST_DESIGN` | Gate 1 owner response = `APPROVE` | Gate 1 APPROVE |
| `ENV_REPORT` | `ESCALATED` | Gate 1 owner response = `REJECT` | Gate 1 REJECT |
| `TEST_DESIGN` | `BUILDER` | `role.invoke(test_designer)` → SUCCESS | — |
| `BUILDER` | `RUN_TESTS` | `role.invoke(builder)` → SUCCESS | — |
| `RUN_TESTS` | `REVIEWER_CODE_AND_SECURITY` | `builtproject.run_scenarios` completes | — |
| `REVIEWER_CODE_AND_SECURITY` | `DOCUMENTATION` | Debate resolves (AGREE or ARBITRATED); no unresolved BLOCKER | — |
| `REVIEWER_CODE_AND_SECURITY` | `ESCALATED` | Unresolved BLOCKER after debate; or hard failure | — |
| `DOCUMENTATION` | `QUALITY_JUDGE` | `role.invoke(documentation)` → SUCCESS | — |
| `QUALITY_JUDGE` | `QUALITY_JUDGE` | `role.invoke(quality_judge)` → SUCCESS; blocks on Gate 2 | Gate 2 — BLOCK |
| `QUALITY_JUDGE` | `DEPLOYMENT_OR_END` | Gate 2 owner response = `APPROVE_SHIP` | Gate 2 APPROVE_SHIP |
| `QUALITY_JUDGE` | `DEPLOYMENT_OR_END` | Gate 2 owner response = `APPROVE_WITH_CAVEATS`; caveats logged in audit trail | Gate 2 APPROVE_WITH_CAVEATS |
| `QUALITY_JUDGE` | `BUILDER` | Gate 2 owner response = `REJECT_AND_LOOP`; `iteration_count < ITERATION_CAP` | Gate 2 REJECT_AND_LOOP |
| `QUALITY_JUDGE` | `ESCALATED` | Gate 2 `REJECT_AND_LOOP`; `iteration_count >= ITERATION_CAP` | Cap exceeded |
| `DEPLOYMENT_OR_END` | `LIVE_DELIVERABLE` | `deployment_enabled = false`; Gate 3 vacuous skip | — |
| `DEPLOYMENT_OR_END` | `DEPLOYMENT_OR_END` | `deployment_enabled = true`; blocks on Gate 3 | Gate 3 — BLOCK |
| `DEPLOYMENT_OR_END` | `LIVE_DELIVERABLE` | Gate 3 owner response = `APPROVE`; deploy tools execute | Gate 3 APPROVE |
| `DEPLOYMENT_OR_END` | `ESCALATED` | Gate 3 owner response = `REJECT` | Gate 3 REJECT |
| `LIVE_DELIVERABLE` | `COMPLETE` | `orchestration_summary.md` written; audit trail finalized | — |
| *(any non-terminal)* | `ESCALATED` | Hard failure: L3 deny · schema validation fail · budget exceeded · missing role | — |
| *(any non-terminal)* | `ABORTED_BY_OWNER` | `orchestration.abort` tool invoked | — |

---

## §3 — Conversation Graph JSON Schema

All schemas in this section use `"$schema": "http://json-schema.org/draft-07/schema#"`.

### 3.1 ConversationNode Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ConversationNode",
  "type": "object",
  "required": ["node_id", "role_id", "timestamp", "invocation_id", "mock_mode", "cost_usd"],
  "properties": {
    "node_id":         { "type": "string", "description": "Unique ID for this node within the loop" },
    "role_id":         { "type": "string", "description": "ID of the agent role invoked (e.g. 'architect', 'builder')" },
    "input_envelope":  { "type": "object", "description": "Inbound message envelope (see §4)" },
    "output_envelope": { "type": "object", "description": "Outbound result from role.invoke" },
    "timestamp":       { "type": "string", "format": "date-time" },
    "invocation_id":   { "type": "string", "description": "Unique ID returned by role.invoke / agent.invoke" },
    "model_id":        { "type": "string", "description": "Model used for this invocation (null if mock)" },
    "mock_mode":       { "type": "boolean" },
    "cost_usd":        { "type": "number", "minimum": 0 }
  },
  "additionalProperties": false
}
```

### 3.2 ConversationEdge Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ConversationEdge",
  "type": "object",
  "required": ["from_node_id", "to_node_id", "transition_type", "decision_basis"],
  "properties": {
    "from_node_id":    { "type": "string" },
    "to_node_id":      { "type": "string" },
    "transition_type": {
      "type": "string",
      "enum": ["NORMAL", "GATE_APPROVE", "GATE_REJECT", "LOOP_BACK", "ESCALATE", "ABORT", "VACUOUS_SKIP"]
    },
    "decision_basis":  { "type": "string", "description": "Human-readable reason for this transition" }
  },
  "additionalProperties": false
}
```

### 3.3 ConversationGraph Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ConversationGraph",
  "type": "object",
  "required": ["project_id", "loop_id", "iteration_count", "current_state",
               "nodes", "edges", "started_at", "last_advanced_at"],
  "properties": {
    "project_id":       { "type": "string" },
    "loop_id":          { "type": "string" },
    "iteration_count":  { "type": "integer", "minimum": 0, "maximum": 5,
                          "description": "Number of QUALITY_JUDGE→BUILDER loops. 0 = first pass. Max = ITERATION_CAP = 5." },
    "current_state": {
      "type": "string",
      "enum": [
        "OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
        "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT", "TEST_DESIGN",
        "BUILDER", "RUN_TESTS", "REVIEWER_CODE_AND_SECURITY", "DOCUMENTATION",
        "QUALITY_JUDGE", "DEPLOYMENT_OR_END", "LIVE_DELIVERABLE",
        "COMPLETE", "ESCALATED", "ABORTED_BY_OWNER"
      ]
    },
    "nodes":            { "type": "array", "items": { "$ref": "ConversationNode" } },
    "edges":            { "type": "array", "items": { "$ref": "ConversationEdge" } },
    "started_at":       { "type": "string", "format": "date-time" },
    "last_advanced_at": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
```

The graph is persisted at:
`artifacts/projects/<project_id>/orchestration/<loop_id>/graph.json`

Written via `tools.fs.write_file`. Never mutated directly — always replaced
atomically via `tools.state.patch_state` or a dedicated write tool in Stage 10.4.

---

## §4 — Message Envelope Contract

### 4.1 Inbound Envelope (caller → role)

```
{
  from_role:    string            // sending role ID, or "orchestration" if loop-originated
  intent:       string            // short human-readable description of this invocation
  payload:      object            // role-specific content (design doc, spec draft, code, etc.)
  attachments:  string[]          // paths to artifact files role may read (READ_ONLY access)
  iteration_id: string            // "<loop_id>/<iteration_count>" (e.g. "loop_abc/0")
}
```

### 4.2 Outbound Envelope (role → loop)

The loop consumes the standard `role.invoke` output envelope as defined in
`code/src/runtime/tools/role_tools.js`. This contract does NOT duplicate
that schema; it references it. Key fields the loop reads:

```
status:         "SUCCESS" | "FAIL" | "BLOCKED"
output:         object            // role-specific result
metadata:       {
  role_id,
  invocation_id,
  model_id,
  mock_mode,
  cost_usd,
  issues: []    // BLOCKER / WARN / INFO (for reviewer, security_auditor)
}
```

The loop MUST NOT modify the outbound envelope before writing it to the
conversation graph node.

### 4.3 Audit Envelope

Every state transition produces one audit row appended to:
`artifacts/projects/<project_id>/orchestration/<loop_id>/conversation_log.jsonl`

Written via `tools.fs.append_file`. The row schema is defined in §12.
This file is **append-only**. No loop operation may truncate or overwrite it.

---

## §5 — Debate Protocol

The Debate Protocol fires inside `REVIEWER_CODE_AND_SECURITY` when the
Reviewer Agent (Phase B) and the Security Auditor Agent disagree on any
BLOCKER-level finding.

### 5.1 Debate State Machine

```
PROPOSE   →   COUNTER   →   ARBITRATE   →   RESOLVED
```

| State | Who acts | What happens |
|---|---|---|
| `PROPOSE` | Reviewer + Security Auditor | Each submits initial findings independently |
| `COUNTER` | Reviewer ↔ Security Auditor | Each responds to the other's findings (max 3 rounds) |
| `ARBITRATE` | Quality Judge | If still disagreeing after 3 rounds, Quality Judge arbitrates |
| `RESOLVED` | Loop | Debate outcome recorded; loop advances or escalates |

**Participants:**
- Debater A: `reviewer` role (role_id = `reviewer`)
- Debater B: `security_auditor` role (role_id = `security_auditor`)
- Arbitrator: `quality_judge` role (role_id = `quality_judge`)

**Termination rules:**
1. Debaters reach agreement on all BLOCKER items → `RESOLVED` (verdict = `AGREE`)
2. 3 debate rounds completed without agreement → `ARBITRATE` → Quality Judge decides → `RESOLVED` (verdict = `ARBITRATED`)
3. Debaters agree on their own during COUNTER → early `RESOLVED` (verdict = `AGREE`)

**NOTE:** Debate Protocol fires ONLY on BLOCKER-level disagreements. WARN and INFO
disagreements are logged without triggering the protocol.

### 5.2 DebateVerdict Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "DebateVerdict",
  "type": "object",
  "required": ["verdict", "winning_position", "basis", "debate_log"],
  "properties": {
    "verdict": {
      "type": "string",
      "enum": ["AGREE", "DISAGREE", "ARBITRATED"],
      "description": "AGREE = consensus reached; ARBITRATED = quality_judge decided; DISAGREE only if debate exits without resolution (should not occur normally)"
    },
    "winning_position": {
      "type": "string",
      "description": "Summary of the accepted position (from agreement or arbitration)"
    },
    "basis": {
      "type": "string",
      "description": "Reasoning for the verdict"
    },
    "debate_log": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["round", "speaker", "content"],
        "properties": {
          "round":   { "type": "integer", "minimum": 0 },
          "speaker": { "type": "string", "description": "role_id of the speaking agent" },
          "content": { "type": "string" }
        }
      }
    }
  },
  "additionalProperties": false
}
```

### 5.3 Debate Cost

Each debate round generates role.invoke calls for both debaters.
Arbitration generates one additional quality_judge invocation.
These costs are tracked in the cost ledger with category `debate_round` (§9).

### 5.4 Post-Debate Loop Behavior

After `RESOLVED`:
- `verdict = AGREE` or `ARBITRATED`, no unresolved BLOCKER → loop advances to `DOCUMENTATION`
- `verdict = AGREE` or `ARBITRATED`, BLOCKER remains unresolved → loop → `ESCALATED`

An `ARBITRATED` verdict with a resolved BLOCKER is treated the same as `AGREE`
for loop progression purposes.

---

## §6 — Iteration Controller

### 6.1 Cap Constant

```
ITERATION_CAP = 5
```

This is a literal constant, not a configurable value. No project-level
override is permitted. Any change to this value requires a new decision
artifact + major version bump of this contract.

### 6.2 Counter Semantics

`iteration_count` tracks the number of times the loop has returned
from `QUALITY_JUDGE` → `BUILDER` on a REJECT_AND_LOOP verdict.

- Initialized to `0` when the loop is created.
- Incremented by `1` on each `QUALITY_JUDGE` → `BUILDER` transition.
- The maximum value reached before the cap triggers is `ITERATION_CAP` (= 5).
- Transition `QUALITY_JUDGE` → `BUILDER` is allowed when `iteration_count < ITERATION_CAP`.
- Transition `QUALITY_JUDGE` → `ESCALATED` fires when `iteration_count >= ITERATION_CAP`
  at the moment of a `REJECT_AND_LOOP` response.

```
iteration_count = 0: first pass (no loop-back yet)
iteration_count = 1: first loop-back
...
iteration_count = 5 = ITERATION_CAP: cap reached → ESCALATED on next REJECT
```

### 6.3 Escalation Artifact

When the cap fires, the loop:
1. Transitions to `ESCALATED`
2. Writes an escalation artifact at:
   `artifacts/projects/<project_id>/orchestration/<loop_id>/escalation_<ts>.md`
   (written via `tools.artifact_tools.write_artifact`)
3. Records the transition in `conversation_log.jsonl` (§12)

The escalation artifact contains: full iteration history, Quality Judge verdicts
per iteration, outstanding BLOCKER issues, and a recommendation for owner action.

---

## §7 — The 3 Owner Approval Gates (Binding Semantics)

### 7.1 OwnerGateEnvelope Schema

All 3 gates share this envelope schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "OwnerGateEnvelope",
  "type": "object",
  "required": ["gate_id", "project_id", "loop_id", "payload", "timeout_behavior"],
  "properties": {
    "gate_id":          { "type": "integer", "enum": [1, 2, 3] },
    "project_id":       { "type": "string" },
    "loop_id":          { "type": "string" },
    "payload":          { "type": "object", "description": "Gate-specific content (see §7.2–7.4)" },
    "timeout_behavior": { "type": "string", "const": "BLOCK_INDEFINITELY",
                          "description": "Gates never time out automatically. Loop stays blocked until owner responds." },
    "responded_at":     { "type": ["string", "null"], "format": "date-time" },
    "response":         { "type": ["string", "null"],
                          "description": "Owner's response token (gate-specific enum values)" }
  },
  "additionalProperties": false
}
```

**Timeout behavior:** `BLOCK_INDEFINITELY`. There is no automatic timeout or
fallback response. The loop stays in the host state until the owner responds
via `orchestration.respond`. Exception: in scenario harness, `FORGE_OWNER_AUTO_APPROVE=1`
provides automatic `APPROVE` responses to unblock the loop (§10).

### 7.2 Gate 1 — Design + Cost + Environment Review

**Host state:** `ENV_REPORT` (loop remains here until gate clears)

**Owner sees:**
- Architect's design summary
- Spec Writer's §2 artifact draft
- Cost Estimator's prediction
- Environment Agent's requirements report (missing dependencies, installation guidance)

**Owner response options:**
- `APPROVE` → loop advances to `TEST_DESIGN`
- `REJECT` → loop transitions to `ESCALATED` (project requires redesign before a new loop)

**Envelope payload:**
```
{
  gate_id:      1,
  design_doc_path:      "artifacts/projects/<id>/design.md",
  spec_draft_path:      "artifacts/projects/<id>/spec_draft.md",
  cost_estimate:        { ... cost estimator output ... },
  env_report:           { ... environment agent output ... }
}
```

### 7.3 Gate 2 — Quality Verdict Review

**Host state:** `QUALITY_JUDGE` (loop remains here after quality_judge fires)

**Owner sees:**
- Quality Judge's verdict (APPROVED / APPROVED_WITH_CAVEATS / REJECTED)
- Full reviewer report (Phase B)
- Security Auditor threat report
- Test results (scenario pass/fail counts)
- Debate verdict (if debate fired in REVIEWER_CODE_AND_SECURITY)
- Documentation artifacts

**Owner response options:**
- `APPROVE_SHIP` → loop advances to `DEPLOYMENT_OR_END`
- `APPROVE_WITH_CAVEATS` → loop advances to `DEPLOYMENT_OR_END`; caveats appended to audit trail
- `REJECT_AND_LOOP` → `iteration_count++`; loop returns to `BUILDER`; iteration cap checked (§6)

**Envelope payload:**
```
{
  gate_id:              2,
  quality_verdict:      "APPROVED" | "APPROVED_WITH_CAVEATS" | "REJECTED",
  reviewer_report_path: "artifacts/projects/<id>/review_phase_b.md",
  security_report_path: "artifacts/projects/<id>/security_report.md",
  test_results:         { pass: N, fail: N, skip: N },
  debate_verdict:       { ... DebateVerdict | null ... },
  docs_path:            "artifacts/projects/<id>/docs/"
}
```

### 7.4 Gate 3 — Deployment Authorization

**Host state:** `DEPLOYMENT_OR_END` (only when `deployment_enabled = true` in project vision)

**Vacuous skip:** If `deployment_enabled = false`, Gate 3 does not fire.
The loop transitions directly from `DEPLOYMENT_OR_END` → `LIVE_DELIVERABLE`.

**Owner sees:**
- Deployment options (targets detected by Environment/Deployment agents)
- Estimated infrastructure costs per option
- Any irreversible consequences of deployment

**Owner response options:**
- `APPROVE` (with selected `deployment_target`) → deploy tools execute → loop → `LIVE_DELIVERABLE`
- `REJECT` → loop transitions to `ESCALATED`

**Envelope payload:**
```
{
  gate_id:              3,
  deployment_options:   [ { target, estimated_cost_usd, description }, ... ],
  selected_target:      null,   // populated by owner response
  infra_cost_estimate:  { ... }
}
```

**Hard restriction:** The loop NEVER selects a deployment target on the owner's
behalf. Owner selection is mandatory. An APPROVE response without a
`selected_target` is rejected by the gate handler (treated as BLOCK_INDEFINITELY).

---

## §8 — L3 Permission Policy Integration

### 8.1 Active Mode for Orchestration

The orchestration loop runs in `WORKSPACE_WRITE` mode (the default server mode).
No special mode override is needed or permitted for the loop itself.

### 8.2 role.invoke and agent.invoke

Every `role.invoke` and `agent.invoke` call goes through L3 permission policy:

```
loop calls role.invoke(role_id, input_envelope)
  → L3: agent_budget_rule fires
       → checks project budget cap
       → ALLOW if under cap, DENY if over cap
  → if ALLOW: adapter executes
  → if DENY:  loop transitions to ESCALATED (budget exceeded)
```

The loop MUST check the `EnforcementResult` from every `role.invoke` call.
A DENY verdict transitions the loop to `ESCALATED`. There is no bypass.

### 8.3 builtproject.run_scenarios

```
loop calls builtproject.run_scenarios(project_id, scenario_ids)
  → L3: builtproject_vision_rule fires
       → checks project is vision_locked
       → ALLOW if vision_locked=true, DENY if not
  → if ALLOW: test harness executes
  → if DENY:  loop transitions to ESCALATED (vision not locked)
```

### 8.4 PROMPT Mode — Restricted to Owner-Facing Tools

The following tools STAY in `PROMPT` mode (require explicit owner interaction)
and are NEVER called by the loop on the owner's behalf:

| Tool | Reason |
|---|---|
| `vision.propose_amendment` | Vision changes are owner decisions, not loop decisions |
| `vision.approve_amendment` | Same — the loop cannot approve vision amendments for the owner |
| `shell.run_with_prompt` | Owner-irreversible shell operations require owner presence |

The loop is architecturally prevented from calling these tools. If a scenario
or future stage introduces a code path that calls them from within the loop,
that is a §4 STOP-AND-REPORT trigger.

### 8.5 READ_ONLY Tools

The loop may call any `READ_ONLY` tool without a permission event (e.g.,
`orchestration.get_status`, `orchestration.read_log`, `agent.read_ledger`,
`kb.retrieve`). These are always permitted in `WORKSPACE_WRITE` mode.

---

## §9 — Cost Ledger Integration

### 9.1 Per-Invocation Tracking

Every `role.invoke` and `agent.invoke` inside the loop writes to the existing
cost ledger at `artifacts/ai/cost_ledger.jsonl` (the same ledger used by all
Forge operations). No separate ledger for orchestration.

### 9.2 Budget Check Before Each Transition

Before every non-terminal state transition, the loop calls:
```
budget_enforcer.checkBudget(project_id)
```
If the result is `OVER_CAP`:
- Loop transitions to `ESCALATED`
- Escalation artifact written (§6.3)
- Transition logged to `conversation_log.jsonl`

This check fires **before** the role invocation for the next state.

### 9.3 Orchestration Overhead Category

Debate rounds produce additional role invocations beyond the main 14-step path.
These are logged with category `orchestration_overhead`:

```jsonc
{
  "ts": "...",
  "project_id": "...",
  "role": "reviewer",          // or "security_auditor", "quality_judge"
  "category": "orchestration_overhead",
  "sub_category": "debate_round",
  "debate_round_number": 1,
  "provider": "...",
  "cost_usd_actual": 0.0,
  "mock": true
}
```

### 9.4 $0.00 in Mock Mode

When `mock_mode = true` (§10), all cost_usd fields are `0.0` and rows carry
`"mock": true`. The budget check still fires (for logic correctness) but
the mock cost never triggers the cap in a correctly configured scenario.

---

## §10 — Mock Mode Contract

### 10.1 When Mock Mode Is Active

Mock mode is active when either:
- `FORGE_MOCK_PROVIDER=1` environment variable is set, OR
- The project's `mock_mode` field in vision.md is `true`

### 10.2 Behavior in Mock Mode

| Aspect | Mock Mode Behavior |
|---|---|
| `role.invoke` calls | Route to `mock_adapter` (existing) |
| `agent.invoke` calls | Route to `mock_adapter` |
| State machine execution | Full 14-step machine executes unchanged |
| Cost ledger | Records `cost_usd: 0.0`, `mock: true` per row |
| Budget enforcer | Fires; mock cost (0.0) never triggers cap |
| Owner approval gates | **Still block** — manual response required |
| `FORGE_OWNER_AUTO_APPROVE=1` | Gates auto-respond with `APPROVE`; ONLY valid in scenario harness |
| Audit trail | Written normally (same path, same schema) |
| Escalation artifacts | Written if triggered (same path, same schema) |

### 10.3 Stage 10.5 Closure in Mock Mode

Stage 10.5 closes using full mock mode: 5 scenarios run the complete
14-step loop (S152–S156), all with `FORGE_MOCK_PROVIDER=1` and
`FORGE_OWNER_AUTO_APPROVE=1`. Cost actual = $0.00.

This is how the orchestration loop is proven correct before any live
API call is made. Mock mode is the **only** acceptable path to Stage 10.0 closure.

### 10.4 Live Ratification

If Khaled chooses to run the loop against a real API after Stage 10.5 closes,
a separate decision artifact is required before any live call. That artifact:
- Specifies the project and API target
- Authorizes the cost budget for that run
- Records the live results

Live ratification does NOT block Stage 10.5 closure or PHASE-10 closure.

---

## §11 — Failure & Escalation Semantics

### 11.1 Hard Failure (Immediate ESCALATED)

The following conditions halt the loop immediately:

| Condition | Detection point | Transition |
|---|---|---|
| L3 DENY on `role.invoke` or `agent.invoke` | Before adapter call | → `ESCALATED` |
| Missing role in role registry | Before `role.invoke` | → `ESCALATED` |
| Schema validation fail on graph node | After role output | → `ESCALATED` |
| Budget exceeded (§9.2) | Before each transition | → `ESCALATED` |
| `role.invoke` returns `status: "FAIL"` with no retry path | After adapter call | → `ESCALATED` |

On hard failure:
1. Current state freezes (no partial state mutation)
2. Escalation artifact written at `artifacts/projects/<id>/orchestration/<loop_id>/escalation_<ts>.md`
3. Transition logged to `conversation_log.jsonl` with `transition_type: "ESCALATE"`
4. No auto-recovery. Owner must inspect the escalation artifact and start a new loop.

### 11.2 Soft Failure (Quality Judge REJECTED → Iteration Loop)

When `role.invoke(quality_judge)` produces a REJECTED verdict AND Gate 2 owner
response is `REJECT_AND_LOOP`:
1. Check whether `iteration_count >= ITERATION_CAP` at the moment of `REJECT_AND_LOOP`
2. If `iteration_count < ITERATION_CAP`: increment by 1 (count goes N → N+1, max 5),
   loop returns to `BUILDER`; Builder receives Quality Judge's rejection reasons
3. If `iteration_count >= ITERATION_CAP`: hard escalation (§11.1 path above);
   `iteration_count` is NOT incremented (stays at its current value ≤ 5)

### 11.3 Owner Abort

The owner may call `orchestration.abort` from any non-terminal state.

1. Loop transitions immediately to `ABORTED_BY_OWNER`
2. Full graph is preserved in `conversation_graph.json`
3. Full audit log is preserved in `conversation_log.jsonl`
4. `orchestration_summary.md` is written (same as normal close, tagged `status: ABORTED`)
5. No automatic restart. A new `orchestration.start_loop` is required to resume.

**Preservation rule:** `ABORTED_BY_OWNER` preserves all artifacts. Nothing is
deleted on abort. The owner can inspect the full dialogue before deciding to restart.

---

## §12 — Audit Trail Requirements

### 12.1 Audit Log Location

```
artifacts/projects/<project_id>/orchestration/<loop_id>/conversation_log.jsonl
```

Written via `tools.fs.append_file`. One JSON object per line. Append-only.

### 12.2 AuditLogRow Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "AuditLogRow",
  "type": "object",
  "required": ["ts", "loop_id", "from_state", "to_state", "transition_type", "mock", "cost_usd"],
  "properties": {
    "ts":              { "type": "string", "format": "date-time" },
    "loop_id":         { "type": "string" },
    "from_state":      {
      "type": "string",
      "enum": [
        "OWNER_INTENT", "ARCHITECT_DESIGN", "SPEC_WRITER_FORMALIZE",
        "REVIEWER_SPEC", "COST_ESTIMATE", "ENV_REPORT", "TEST_DESIGN",
        "BUILDER", "RUN_TESTS", "REVIEWER_CODE_AND_SECURITY", "DOCUMENTATION",
        "QUALITY_JUDGE", "DEPLOYMENT_OR_END", "LIVE_DELIVERABLE",
        "COMPLETE", "ESCALATED", "ABORTED_BY_OWNER"
      ]
    },
    "to_state":        { "$ref": "#/properties/from_state" },
    "transition_type": {
      "type": "string",
      "enum": ["NORMAL", "GATE_APPROVE", "GATE_REJECT", "LOOP_BACK", "ESCALATE", "ABORT", "VACUOUS_SKIP"]
    },
    "role_invoked":    { "type": ["string", "null"],
                         "description": "role_id of the agent invoked on entry to to_state, or null" },
    "mock":            { "type": "boolean" },
    "cost_usd":        { "type": "number", "minimum": 0 },
    "owner_gate_id":   { "type": ["integer", "null"], "enum": [1, 2, 3, null],
                         "description": "Gate ID if this transition was gated; null otherwise" }
  },
  "additionalProperties": false
}
```

### 12.3 Append-Only Invariant

The loop MUST NOT:
- Truncate `conversation_log.jsonl`
- Seek and overwrite a prior row
- Delete the file

Any code path that mutates prior rows is a Track A violation.

### 12.4 Loop Close Summary

On loop reaching `COMPLETE`, `ESCALATED`, or `ABORTED_BY_OWNER`, the loop writes:
```
artifacts/projects/<project_id>/orchestration/<loop_id>/orchestration_summary.md
```

Content:
- Loop ID, project ID, final state
- Start/end timestamps, total duration
- Iteration count
- Cost actual (total USD across all role invocations)
- State transitions list (condensed)
- Escalation reason (if ESCALATED)
- Key artifacts produced (design doc, spec, review reports, test results, docs)

---

## §13 — Boot Validation

### 13.1 When Validation Runs

The orchestration module (when it lands in Stage 10.1 as `_registry.js`) validates
on Forge boot, before any loop can be started.

### 13.2 What Is Validated

```
1. State ID count:
     Validate the 17 state IDs in this contract are present in the module's
     enum definition. Missing ID → boot failure.
     Extra ID not in this contract → boot failure.
     Exact match required.

2. Iteration cap:
     Validate ITERATION_CAP === 5 (strict equality, not >=).
     Any other value → boot failure.

3. Role registry:
     Validate all role_ids referenced in the loop contract exist in the
     role registry (code/src/runtime/agents/_role_registry.js).
     Required roles: architect, spec_writer, reviewer, cost_estimator,
     environment, builder, security_auditor, test_designer, documentation,
     quality_judge, deployment, research.
     Missing role → boot failure.

4. Orchestration tools:
     Validate 6 orchestration tools are registered:
     orchestration.start_loop, orchestration.advance_state,
     orchestration.respond, orchestration.abort,
     orchestration.get_status, orchestration.read_log.
     (Available after Stage 10.4.)
```

### 13.3 Fail-Closed Behavior

If any validation above fails:
- Boot continues for all other Forge modules (the rest of Forge is not blocked)
- The orchestration module logs a FAIL to the doctor system
- `orchestration.start_loop` returns `{ status: "FAIL", reason: "BOOT_VALIDATION_FAILED", detail: "..." }`
- No loop can be created until the mismatch is resolved

This is NOT a hard server failure (Forge still starts) but the orchestration
capability is non-functional until the mismatch is fixed. Doctor will report
`orchestration_runtime: FAIL` with the specific mismatch detail.

---

## §14 — Versioning & Amendment

### 14.1 Version

This contract is **v1.0.0**, binding from Stage 10.0 close.

### 14.2 Amendment Process

Any change to this contract requires:

1. A new decision artifact in `artifacts/decisions/DECISION-<ts>-orchestration-loop-<slug>.md`
2. Owner approval in chat
3. `progress/status.json` update reflecting the amendment
4. Version bump in this document's header:
   - Backward-compatible change → minor bump (v1.0.0 → v1.1.0)
   - Breaking change (state IDs, cap value, gate semantics) → major bump (v1.0.0 → v2.0.0)
5. Boot validator updated to match the new state ID list and cap value

A "breaking change" is any modification that would cause existing conversation
graphs serialized under the prior version to fail schema validation under the
new version.

### 14.3 What Requires a Major Bump

| Change | Bump |
|---|---|
| Add, remove, or rename a state ID | Major |
| Change `ITERATION_CAP` value | Major |
| Change gate semantics (host state, response enum) | Major |
| Change AuditLogRow required fields | Major |
| Add optional field to any schema | Minor |
| Add a new non-mandatory section to this document | Minor |
| Clarify existing text without semantic change | Patch |

---

## §15 — Glossary & Cross-References

### 15.1 Terminology

| Term | Definition |
|---|---|
| **Loop** | One complete execution of the 14-step orchestration sequence for a single project, identified by `loop_id`. |
| **Iteration** | One pass through steps 8–12 (BUILDER → RUN_TESTS → REVIEWER_CODE_AND_SECURITY → DOCUMENTATION → QUALITY_JUDGE). The first pass is iteration 0. |
| **Round (Debate Round)** | One exchange in the Debate Protocol: one COUNTER message from Reviewer and one from Security Auditor. Up to 3 rounds before arbitration. |
| **Owner Gate** | A blocking guard on a state transition. The loop holds in the host state until the owner responds via `orchestration.respond`. Not a state ID. |
| **Forward State** | Any of the 14 non-terminal states the loop traverses in the happy path. |
| **Terminal State** | Any of the 3 states that end the loop: COMPLETE, ESCALATED, ABORTED_BY_OWNER. |
| **ITERATION_CAP** | The constant value `5` that limits the number of QUALITY_JUDGE→BUILDER loop-backs before the loop escalates. |
| **Mock Mode** | Loop execution with all role.invoke calls routed to the mock adapter; no real API calls; cost = $0.00. |

### 15.2 Cross-References

| What | Where |
|---|---|
| 14-step iteration loop (source of truth) | `DECISION-20260510-vision-shift-multi-agent-conductor.md §5` |
| Owner approval gates (source of truth) | `DECISION-20260510-vision-shift-multi-agent-conductor.md §4` |
| Binding implementation plan | `DECISION-20260513-1000-phase-10-plan.md` |
| role.invoke output envelope schema | `code/src/runtime/tools/role_tools.js` |
| agent.invoke output envelope schema | `code/src/runtime/tools/agent_tools.js` |
| Permission policy + authorize() | `code/src/runtime/permission/permissionPolicy.js` |
| agent_budget_rule.js | `code/src/runtime/permission/rules/agent_budget_rule.js` |
| builtproject_vision_rule.js | `code/src/runtime/permission/rules/builtproject_vision_rule.js` |
| 12 agent role definitions | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` |
| Role system prompts | `docs/10_runtime/18b_ROLE_PROMPTS.md` |
| Agent adapter contract | `docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md` |
| Built-project harness | `docs/10_runtime/20_BUILT_PROJECT_HARNESS_CONTRACT.md` |
| Doctor contract | `docs/10_runtime/12_DOCTOR_CONTRACT.md` |
| Tool runtime contract | `docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md` |

### 14.4 Amendment History

| Version | Date | Change | Decision |
|---|---|---|---|
| v1.1.0 | 2026-05-13 | Per-loop subdirectory inserted into all orchestration artifact paths (`orchestration/<loop_id>/`) to support N concurrent/sequential loops per project without collision. Backward-compatible: no v1.0.0 graphs exist. | DECISION-20260513-1250-orchestration-loop-path-layout-v1-1-0.md |
| v1.2.0 | 2026-05-13 | Iteration cap semantics clarification. Resolves three-way ambiguity between §6.2 (`>=` semantics), §11.2 (`>` semantics), §2.2 transition table (`>` semantics), and §3 schema (`max:5`, implies `>=` semantics). Binding reading: `>=` (count never exceeds 5). Rewrites §11.2 steps 1–3 and two §2.2 trigger condition strings. No schema change, no code semantics change; Stage 10.1 `validateGraph` was already correct. Also synchronizes 2 trigger string literals in Stage 10.1 `conversation_graph.js` TRANSITION_TABLE (documentation mirrors of §2.2) — no logic change. | DECISION-20260513-1500-orchestration-loop-iteration-cap-clarification-v1-2-0.md |

---

**END OF ORCHESTRATION LOOP CONTRACT v1.2.0**

*Authored: 2026-05-13 — Stage 10.0*
*Amended: 2026-05-13 — Stage 10.1 (v1.1.0)*
*Amended: 2026-05-13 — Stage 10.3 Step 0 (v1.2.0)*
*Owner: KhElmasry*
*Status: BINDING from Stage 10.0 close*
