# 17 — Agent Runtime Contract

> Authority: this document governs all agent-related tool execution in Forge.
> Implemented: PHASE-7-E.
> Decision artifact: `artifacts/decisions/DECISION-20260510-1938-phase-7-E-agent-adapters.md`

---

## 1. Overview

The agent runtime layer (`agent.*` namespace) provides a uniform interface for Forge to invoke
LLM agents (Anthropic Claude, OpenAI GPT, Claude Code CLI, Aider CLI) and a deterministic
mock for testing. It sits on top of Track A's L2 Tool Runtime and L3 Permission Policy.

```
L1  Provider Contract   (LLM calls — untouched by agent layer)
L2  Tool Runtime        code/src/runtime/tools/agent_tools.js  (4 tools)
L3  Permission Policy   permissionPolicy.authorize() — Step 1.8 (agent_budget_rule)
L4  Doctor              checks/agent_runtime.js   (19th check)
```

---

## 2. Adapter Contract

### Input shape (uniform for all adapters)

```js
{
  provider:    string,   // "anthropic" | "openai" | "claude_code" | "aider" | "mock"
  model:       string,   // provider-specific (e.g. "claude-opus-4-7", "gpt-4o")
  prompt:      string,   // the actual prompt to send
  context:     object,   // { project_id, role, prior_messages, vision_excerpt }
  budget_ms:   number,   // timeout in milliseconds
  budget_usd:  number,   // cost cap for this single invocation
  project_id:  string    // REQUIRED for ledger + budget enforcement
}
```

### Output shape on success

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
    invocation_id: string,  // UUID v4
    cached:        boolean
  }
}
```

### Output shape on failure

```js
{
  status:   "FAILED" | "DENIED",
  output:   null,
  metadata: { reason: string, detail: string|null, context: object|null }
}
```

---

## 3. Provider Catalog

### anthropic

- **Binary/API:** Anthropic Messages API (`https://api.anthropic.com/v1/messages`)
- **Auth:** `ANTHROPIC_API_KEY` env var
- **Default model:** `claude-opus-4-7`
- **Cost rates:** $0.003/1K input tokens, $0.015/1K output tokens (approximate)
- **Available:** when `ANTHROPIC_API_KEY` is set

### openai

- **Binary/API:** OpenAI Chat Completions API (`https://api.openai.com/v1/chat/completions`)
- **Auth:** `OPENAI_API_KEY` env var
- **Default model:** `gpt-4o`
- **Cost rates:** $0.005/1K input tokens, $0.015/1K output tokens (approximate)
- **Available:** when `OPENAI_API_KEY` is set

### claude_code

- **Binary/API:** Claude Code CLI binary (`claude`)
- **Auth:** Inherits from ambient Claude Code auth
- **Default model:** `claude-opus-4-7`
- **Available:** when `claude` binary is in PATH and responds to `env.probe_binary`
- **Execution:** via `shell.run_in_workspace` (Track A discipline)

### aider

- **Binary/API:** Aider CLI (`aider`)
- **Auth:** Inherits from ambient model auth
- **Default model:** `claude-opus-4-7`
- **Available:** when `aider` binary is in PATH
- **Execution:** via `shell.run_in_workspace` (Track A discipline)

### mock

- **Binary/API:** None — reads from `adapters/mock_responses.json`
- **Auth:** None required
- **Cost:** Always $0
- **Available:** Always true
- **Used for:** TEST mode, CI, scenario testing
- **Determinism:** Same `{provider, model, prompt}` key → same response every time

---

## 4. Cost Ledger

### Path

`artifacts/agent/cost_ledger.jsonl`

### Schema (one JSON object per line)

```json
{
  "ts":                  "2026-05-15T12:34:56.789Z",
  "invocation_id":       "uuid-v4",
  "project_id":          "customer_app",
  "provider":            "anthropic",
  "model":               "claude-opus-4-7",
  "role":                null,
  "tokens_in":           4500,
  "tokens_out":          12000,
  "latency_ms":          3421,
  "cost_usd_estimated":  2.10,
  "cost_usd_actual":     2.34,
  "outcome":             "success"
}
```

### Rules

- Append-only. Never edit or delete entries.
- Every `agent.invoke` call writes exactly one entry, regardless of success/failure.
- Mock provider writes entries with `cost_usd_actual: 0`.
- `role` is null in PHASE-7-E (populated by PHASE-7-F roles).
- `outcome` is one of: `success`, `failed`, `budget_exceeded`, `timeout`, `auth_error`.

---

## 5. Budget Enforcement

Three levels, checked at L3 (Step 1.8) before `agent.invoke` executes:

| Threshold | Behavior |
|---|---|
| Projected cost < 80% of cap | Allow — no warning |
| Projected cost 80–94% of cap | Allow — `BUDGET_80_PCT` warn emitted to audit |
| Projected cost 95–99% of cap | DENIED — `BUDGET_95_PCT_REQUIRES_APPROVAL` |
| Projected cost ≥ 100% of cap | DENIED — `BUDGET_EXCEEDED` |

**Caps** are read from project vision frontmatter:
- `max_total_usd` (default: 50.00)
- `max_per_iteration_usd` (default: 5.00, enforced per-call)

**Projected cost** = `getTotalCost(project_id)` + `estimateCost(provider, prompt)`.

---

## 6. Vision Lock Interaction

`agent.invoke` with any non-mock provider requires the project's vision to be locked:

```
vision_locked: true  → proceed to budget check
vision_locked: false → DENIED: VISION_NOT_LOCKED
vision not found     → DENIED: VISION_NOT_FOUND
```

**Mock exception:** `provider === "mock"` bypasses vision lock check entirely.
This allows tests to run without a vision document.

---

## 7. Mock Mode

In TEST permission mode, route all invocations to mock:
- Set `provider: "mock"` in input
- Mock reads `code/src/runtime/agents/adapters/mock_responses.json`
- Key format: `"mock|<model>|<prompt_first_500_chars>"`
- If no scripted response: returns `"[mock] no scripted response for this input"`
- Cost: always $0.00
- Vision lock: bypassed
- Budget enforcement: bypassed

---

## 8. Examples

### Example 1: Mock invocation (TEST mode)

```js
// Input
{
  provider:   "mock",
  model:      "mock",
  prompt:     "List 3 HTTP status codes",
  project_id: "test_project"
}

// Output
{
  status: "SUCCESS",
  output: {
    text:          "[mock] no scripted response for this input",
    tokens_in:     10,
    tokens_out:    20,
    latency_ms:    0,
    cost_usd:      0,
    provider:      "mock",
    model:         "mock",
    finish_reason: "stop"
  },
  metadata: { invocation_id: null, cached: false }
}
```

### Example 2: Check available providers

```js
// agent.list_available — no input required
// Output:
{
  providers: [
    { name: "anthropic",   available: true,  reason: null },
    { name: "openai",      available: false, reason: "OPENAI_API_KEY not set" },
    { name: "claude_code", available: false, reason: "binary not found or unavailable" },
    { name: "aider",       available: false, reason: "binary not found or unavailable" },
    { name: "mock",        available: true,  reason: null }
  ]
}
```

### Example 3: Estimate cost before invoking

```js
// Input
{ provider: "anthropic", prompt: "Design a REST API for user management with CRUD operations..." }

// Output
{ estimated_usd: 0.042, tokens_in: 125, tokens_out: 250, confidence: "low" }
```

### Example 4: Vision lock failure

```js
// Input (vision NOT locked for project)
{ provider: "anthropic", model: "claude-opus-4-7", prompt: "...", project_id: "unlocked_project" }

// L3 rule fires at Step 1.8 → DENIED before execute() is called
{ status: "DENIED", output: null, metadata: { reason: "VISION_NOT_LOCKED" } }
```

### Example 5: Budget exceeded

```js
// Project has spent $48.50 of $50.00 cap. New invocation estimated at $2.10.
// Projected: 48.50 + 2.10 = $50.60 → 101% of cap

// Output
{ status: "DENIED", output: null, metadata: { reason: "BUDGET_EXCEEDED" } }
```
