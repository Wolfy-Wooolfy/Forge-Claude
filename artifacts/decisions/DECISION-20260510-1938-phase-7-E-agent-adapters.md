# DECISION-20260510-1938-phase-7-E-agent-adapters

| Field | Value |
|---|---|
| Date | 2026-05-10 |
| Timestamp | 20260510-1938 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-10 |
| Phase | PHASE-7-E |
| Authority | `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0) |
| Track | Track B |
| Depends on | PHASE-7-C-3 (CLOSED) + Track A foundation |

---

## §2-A. Scope

- 5 agent adapters: `anthropic`, `openai`, `claude_code`, `aider`, `mock`
- 1 adapter contract module + 1 registry module
- 4 L2 tools: `agent.invoke`, `agent.list_available`, `agent.estimate_cost`, `agent.read_ledger`
- 1 cost ledger module (JSONL writer)
- 1 budget enforcer module
- 1 L3 permission rule for budget enforcement + vision lock
- 1 doctor check
- 1 contract documentation file
- 12 new test scenarios: S71–S82

**Out of scope (explicit):**
- Specialized agent roles (PHASE-7-F)
- Inter-agent message format beyond the basic adapter contract
- Multi-agent orchestration loop (PHASE-10)
- Web UI for agent dialogue (PHASE-13)

---

## §2-B. Namespace

All new L2 tools live under the `agent.*` namespace. Separate from `shell.*`, `pkg.*`, `container.*`, `fs.*`.

---

## §2-C. Adapter Contract

**Input shape (uniform for all adapters):**
```js
{
  provider:    string,   // "anthropic" | "openai" | "claude_code" | "aider" | "mock"
  model:       string,   // provider-specific
  prompt:      string,   // the actual prompt
  context:     object,   // { project_id, role, prior_messages, vision_excerpt }
  budget_ms:   number,   // timeout in milliseconds
  budget_usd:  number,   // cost cap for this single invocation
  project_id:  string    // REQUIRED for ledger + budget enforcement
}
```

**Output shape on success:**
```js
{
  status: "SUCCESS",
  output: {
    text:          string,
    tokens_in:     number,
    tokens_out:    number,
    latency_ms:    number,
    cost_usd:      number,
    provider:      string,
    model:         string,
    finish_reason: string   // "stop" | "length" | "error" | "budget_exceeded"
  },
  metadata: {
    invocation_id: string,  // UUID
    cached:        boolean
  }
}
```

On failure: `failed(reason, detail, context)` per tool contract.

---

## §2-D. Pre-Decided Behaviors

**§2-D1.** All 5 adapters expose the same contract surface (input/output shapes). Provider quirks absorbed inside adapter.

**§2-D2.** Adapters never spawn or fetch directly:
- HTTP: http_tools.js execute() calls (same pattern as container_tools → shell_tools)
- CLI spawn: shell.run_in_workspace execute() call
- Filesystem: cost_ledger uses direct fs (infrastructure exception — see Architectural Deviation §ARC-1)

**§2-D3.** Mock adapter is deterministic. Reads `mock_responses.json`. Same input → same output. Never calls external services.

**§2-D4.** Cost ledger is append-only JSONL at `artifacts/agent/cost_ledger.jsonl`. Schema:
```json
{
  "ts":                  "ISO 8601",
  "invocation_id":       "uuid-v4",
  "project_id":          "string",
  "provider":            "string",
  "model":               "string",
  "role":                null,
  "tokens_in":           0,
  "tokens_out":          0,
  "latency_ms":          0,
  "cost_usd_estimated":  0.0,
  "cost_usd_actual":     0.0,
  "outcome":             "success|failed|budget_exceeded|timeout|auth_error"
}
```

**§2-D5.** Budget enforcer at L3 (agent_budget_rule.js):
- 80% → `{ allow: true, warn: "BUDGET_80_PCT" }`
- 95% → `{ allow: false, reason: "BUDGET_95_PCT_REQUIRES_APPROVAL" }`
- 100% → `{ allow: false, reason: "BUDGET_EXCEEDED" }`

**§2-D6.** `project_id` is mandatory. Without it → INVALID_INPUT (enforced by tool schema).

**§2-D7.** Mock provider bypasses budget enforcement. Still logs to ledger with cost_usd_actual: 0.

**§2-D8.** `agent.list_available` checks each adapter's health (API key presence + binary presence).

**§2-D9.** `agent.estimate_cost` uses heuristic: `Math.ceil(prompt.length / 4)` × rate × 2× buffer. Returns `{ estimated_usd, confidence: "low"|"medium"|"high" }`.

**§2-D10.** Vision lock applies to `agent.invoke` when project_id present AND provider !== "mock". Unlocked vision → DENIED VISION_NOT_LOCKED (checked in L3 rule, same as container_privilege_rule B3 step).

---

## §2-E. Files to Create

```
code/src/runtime/agents/_adapter_contract.js
code/src/runtime/agents/_adapter_registry.js
code/src/runtime/agents/adapters/anthropic_adapter.js
code/src/runtime/agents/adapters/openai_adapter.js
code/src/runtime/agents/adapters/claude_code_adapter.js
code/src/runtime/agents/adapters/aider_adapter.js
code/src/runtime/agents/adapters/mock_adapter.js
code/src/runtime/agents/adapters/mock_responses.json
code/src/runtime/agents/cost_ledger.js
code/src/runtime/agents/budget_enforcer.js
code/src/runtime/tools/agent_tools.js
code/src/runtime/permission/rules/agent_budget_rule.js
code/src/runtime/doctor/checks/agent_runtime.js
docs/10_runtime/17_AGENT_RUNTIME_CONTRACT.md
artifacts/decisions/DECISION-20260510-1938-phase-7-E-agent-adapters.md  (this file)
```

---

## §2-F. Files to Modify

```
code/src/runtime/permission/permissionPolicy.js  — wire agent_budget_rule at Step 1.8
code/src/runtime/doctor/_registry.js             — add agent_runtime check
code/src/testing/scenarios/                       — add S71–S82
verify/smoke/test_tool_runtime.js                — 50 → 54
verify/smoke/test_doctor.js                      — 18 → 19 + agent_runtime in list
verify/smoke/test_harness_meta.js                — 70 → 82, S71–S82 in ID list
verify/smoke/test_permission_layer.js            — 2 new assertions for agent_budget_rule
progress/status.json                              — after closure
```

---

## §2-G. Acceptance Criteria

- AC-1: All 5 adapters loaded via registry
- AC-2: mock provider returns deterministic output (same input → same output)
- AC-3: `agent.list_available` returns 5 providers
- AC-4: `agent.estimate_cost` returns a number for valid input
- AC-5: `agent.read_ledger` returns entries for project_id (READ_ONLY)
- AC-6: Cost ledger writes valid JSONL on every invocation
- AC-7: Budget enforcer 80%/95%/100% per §2-D5
- AC-8: `project_id` missing → INVALID_INPUT (enforced by schema `required: ["project_id"]`)
- AC-9: Vision not locked + non-mock provider → DENIED VISION_NOT_LOCKED
- AC-10: Vision not locked + mock provider → SUCCESS
- AC-11: Track A discipline — no direct spawn/fetch in agents/ layer
- AC-12: Doctor check `agent_runtime` PASS (registry valid, mock available)
- AC-13: Harness 70 → 82, all PASS or SKIP, zero FAIL
- AC-14: Tool count 50 → 54
- AC-15: Doctor checks 18 → 19
- AC-16: All 5 smoke suites PASS exit 0

---

## Architectural Deviations

### §ARC-1: Cost Ledger Uses Direct fs (Infrastructure Exception)

**Deviation:** `cost_ledger.js` uses `fs.appendFileSync` and `fs.readFileSync` directly instead of `fs.*` L2 tools.

**Reason:** Cost ledger is called from within `agent.invoke`'s execute() function. Calling L2 tools from inside an L2 tool's execute() creates the same re-entrant pattern as `toolAuditLog.js` and `permissionPolicy.js`. Those modules also use `fs.appendFileSync` directly for the same reason (see `permissionPolicy.js:29` and `toolAuditLog.js`).

**Precedent:** `visionEngine.readVisionSync()` uses `fs.readFileSync` directly — "Synchronous read for L3 permission hot path — allowed exception per F2 spec".

**Impact:** Zero. The cost ledger is infrastructure, not a tool. Its filesystem access is scoped to `artifacts/agent/cost_ledger.jsonl` only.
