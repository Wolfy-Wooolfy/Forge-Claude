# VISION-PHASE-7-F — 11 Specialized Agent Roles

| Field | Value |
|---|---|
| Date | 2026-05-10 |
| Authority | Companion to `DECISION-20260510-vision-shift-multi-agent-conductor.md` |
| Status | Active — guides PHASE-7-F-1, 7-F-2, 7-F-3 |
| Type | Vision/context document (NOT a binding contract — see binding §2 in each sub-phase prompt) |

---

## 1. Purpose

PHASE-7-F implements the 11 specialized agent roles defined in `DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 3. Because of the size (14-21 days, 11 roles, 33+ scenarios), PHASE-7-F is split into 3 sub-phases for manageable delivery.

This document is the **shared context** Claude Code reads before each sub-phase starts. It explains:
- What each sub-phase delivers
- Why the roles are grouped this way
- How a role builds on PHASE-7-E's agent runtime
- Patterns that apply to ALL roles
- What is shared vs what is sub-phase-specific

The binding contract for each sub-phase is its own §2 in its PROMPT. This vision document is interpretive — when in doubt, the sub-phase §2 wins.

---

## 2. The 3 Sub-Phases at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│  PHASE-7-F — 11 Specialized Agent Roles                          │
│  Total estimate: 14-21 days                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PHASE-7-F-1 — Foundation Roles (4-6 days)                │   │
│  │   🧠  Architect Agent                                     │   │
│  │   📝 Spec Writer Agent                                   │   │
│  │   🔍 Reviewer Agent (Phase A — spec review only)         │   │
│  │                                                          │   │
│  │   These are the entry-point roles. They convert owner    │   │
│  │   intent into a reviewed spec ready for the build phase. │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PHASE-7-F-2 — Build & Verify Roles (5-7 days)            │   │
│  │   🔨 Builder Agent (delegates to claude_code/codex/aider)│   │
│  │   🛡️  Security Auditor Agent                             │   │
│  │   🧪 Test Designer Agent                                 │   │
│  │   🔍 Reviewer Agent (Phase B — code review added)        │   │
│  │                                                          │   │
│  │   These are the core build cycle. They take the spec     │   │
│  │   and produce verified code with security review.        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ PHASE-7-F-3 — Quality & Delivery Roles (5-7 days)        │   │
│  │   📚 Documentation Agent                                 │   │
│  │   💰 Cost Estimator Agent                                │   │
│  │   🌍 Environment Agent                                   │   │
│  │   ⚖️ Quality Judge Agent                                 │   │
│  │   🚀 Deployment Agent                                    │   │
│  │                                                          │   │
│  │   These are wrap-up roles. They handle docs, cost,       │   │
│  │   environment, final verdict, and ship.                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

🔬 Reverse Architect Agent (12th role) — deferred to PHASE-11
```

---

## 3. What Every Role Has in Common

Every role across all 3 sub-phases shares this contract:

### 3.1 Role Module Shape

```js
// code/src/runtime/agents/roles/<role_name>_role.js

const { defineRole } = require("../_role_contract");

module.exports = defineRole({
  id:          "architect",                      // unique role identifier
  label:       "Architect",                      // human-readable name
  description: "Designs the system structure",   // one-sentence purpose

  // Default provider (overridable per project via vision)
  default_provider: "anthropic",
  default_model:    "claude-opus-4-7",

  // System prompt — versioned, lives in 18b_ROLE_PROMPTS.md
  system_prompt_id: "architect_v1",

  // Input/output schemas — what this role expects and produces
  input_schema:  { /* JSON Schema */ },
  output_schema: { /* JSON Schema */ },

  // Permission requirements
  required_mode:       "PROMPT",     // owner approves invocation
  authority_level:     "ADVISORY",   // ADVISORY | BLOCKING

  // Cost estimate hints (used by Cost Estimator Agent)
  typical_cost_usd_min: 0.10,
  typical_cost_usd_max: 0.50,

  // The actual invocation — runs through agent.invoke
  async run(input, ctx) {
    // 1. Validate input
    // 2. Load system prompt
    // 3. Compose full prompt (system + role instructions + input)
    // 4. Invoke via agent.invoke L2 tool
    // 5. Parse output (structured JSON expected)
    // 6. Validate output against schema
    // 7. Return success/failed envelope
  }
});
```

### 3.2 Role Authority Levels

Two levels:

- **ADVISORY** — output is a recommendation. Pipeline can proceed even if role flags issues. Owner sees the warning.
- **BLOCKING** — output can halt the pipeline. BLOCKER findings stop progression until addressed.

The decision artifact specifies authority per role:
- BLOCKING: Reviewer (BLOCKERs only), Security Auditor (BLOCKERs only), Quality Judge
- ADVISORY: Architect, Spec Writer, Cost Estimator, Environment, Builder, Test Designer, Documentation, Deployment

### 3.3 System Prompts Live in `docs/10_runtime/18b_ROLE_PROMPTS.md`

All system prompts versioned in one document. Format:

```markdown
## architect_v1 (2026-05-10)

You are the Architect Agent for Forge, a multi-agent code generation system.
Your role is to convert owner intent into a system design document.

[full prompt text]

### Input format
[JSON schema description]

### Output format
You must respond with valid JSON matching this schema:
[JSON schema with examples]

### Constraints
- Never write code (that's the Builder's job)
- Never invent test scenarios (that's the Test Designer's job)
- Focus on architecture, components, data flow, technology choices
- Identify risks and dependencies
```

Versioning is critical. Changing a system prompt = new version (architect_v2). Old version preserved in the doc with deprecation marker.

### 3.4 Role Output is Structured JSON

Every role returns structured JSON, never freeform text. Output schemas enforced by validateOutput().

Example — Architect output:
```json
{
  "design_summary": "Customer management web app with email notifications",
  "components": [
    { "name": "API Server", "tech": "Flask", "purpose": "..." },
    { "name": "Database", "tech": "SQLite", "purpose": "..." }
  ],
  "data_flow": "...",
  "technology_choices": [...],
  "integration_points": [...],
  "identified_risks": [
    { "risk": "...", "severity": "MEDIUM", "mitigation": "..." }
  ]
}
```

### 3.5 Role Invocation Pattern (Uniform)

Every role is invoked the same way:

```js
const role = require("./roles/architect_role");
const result = await role.run(input, { project_id, root, ... });
```

Internally, every `role.run()`:
1. Composes the prompt (system + role-specific + input)
2. Calls `agent.invoke` (the L2 tool from PHASE-7-E)
3. Parses the structured JSON response
4. Validates against output schema
5. Returns envelope

This means **every role automatically gets:**
- Cost ledger entry
- Vision lock enforcement (non-mock)
- Budget enforcement
- Permission policy gating
- Audit trail

No role re-implements infrastructure. They're all clients of PHASE-7-E.

---

## 4. The Role Registry (`_role_registry.js`)

Same pattern as adapter registry from PHASE-7-E:

```js
// code/src/runtime/agents/_role_registry.js

const _roles = new Map();

function _autoLoad() {
  const dir = path.join(__dirname, "roles");
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith("_role.js")) continue;
    const role = require(path.join(dir, file));
    _roles.set(role.id, role);
  }
}

function listRoles() { return Array.from(_roles.values()); }
function pickRole(id) { return _roles.get(id) || null; }
```

The registry validates each role at boot:
- `id` is unique
- All required fields present
- `input_schema` and `output_schema` are valid JSON Schemas
- `system_prompt_id` references an existing prompt in 18b_ROLE_PROMPTS.md

---

## 5. The `role.invoke` L2 Tool

A single new L2 tool wraps role invocation:

```js
// code/src/runtime/tools/role_tools.js

{
  name: "role.invoke",
  required_mode: "PROMPT",
  description: "Invoke a specialized agent role",
  input_schema: {
    role_id:     { type: "string", required: true },
    input:       { type: "object", required: true },
    project_id:  { type: "string", required: true },
    provider:    { type: "string" },   // optional override
    model:       { type: "string" }    // optional override
  },
  // ...
}
```

This tool:
1. Resolves the role from registry
2. Calls `role.run(input, ctx)`
3. Returns the role's output via standard envelope

The tool is added in PHASE-7-F-1 (since Foundation Roles need it). Sub-phases 2 and 3 add NEW roles to the registry but don't add new L2 tools.

---

## 6. Mock-First Testing Strategy

Every role has scenarios that use **provider: "mock"** exclusively. This is non-negotiable:

```
Cost during scenarios: $0
Determinism:           Required
Reproducibility:       Required across machines
```

For each role, `mock_responses.json` (from PHASE-7-E) is extended with scripted responses for the role's expected inputs. Example:

```json
{
  "anthropic|claude-opus-4-7|<hashed prompt for architect role with input X>": {
    "text": "{\"design_summary\": \"...\", ...}",
    "tokens_in": 1500,
    "tokens_out": 800,
    "finish_reason": "stop"
  }
}
```

Scenarios assert structural correctness (output is valid JSON, has expected fields, role-specific constraints satisfied), NOT semantic correctness (we don't assert the design is "good"). Semantic quality is verified in real production runs, not test scenarios.

---

## 7. Agent Pipeline Composition (Preview — Implemented in PHASE-10)

PHASE-7-F builds the **roles**. PHASE-10 builds the **orchestration loop** that calls them in sequence.

For now, sub-phases test roles in isolation:
- PHASE-7-F-1: scenarios call `role.invoke("architect", ...)` directly
- PHASE-7-F-2: scenarios call individual roles, then verify role-to-role compatibility
- PHASE-7-F-3: scenarios verify the final delivery roles produce shippable output

PHASE-10 will then chain them:
```
architect → spec_writer → reviewer(A) → owner_gate_1 →
  test_designer → builder → reviewer(B) + security →
  documentation → quality_judge → owner_gate_2 → deployment
```

---

## 8. Acceptance Criteria Pattern (Common Across Sub-Phases)

Every sub-phase's §2-G has at minimum:

- AC: Each role registered in `_role_registry.js`
- AC: Each role has ≥3 scenarios (mock provider only)
- AC: Each role's output schema validated on every invocation
- AC: Each role's system prompt versioned in 18b_ROLE_PROMPTS.md
- AC: `role.invoke` L2 tool functional (PHASE-7-F-1 only — added then; later sub-phases reuse)
- AC: Track A discipline preserved (no direct fs/spawn/fetch in roles/ layer)
- AC: All scenarios PASS or SKIP, zero FAIL
- AC: Tool count + doctor checks + scenarios count update reflected in status.json

---

## 9. STOP-AND-REPORT Reinforcement (Lessons from PHASE-7-E)

PHASE-7-E surfaced 3 architectural deviations made without explicit STOP. Going into PHASE-7-F:

**The §2 contract is binding. Deviations require STOP-AND-REPORT, even if "obviously necessary."**

Specific cases that MUST trigger STOP:
- Modifying any infrastructure outside the role being implemented (visionSchema, assertions, doctor, permissionPolicy)
- Adding L2 tools not specified in the sub-phase §2
- Changing input/output schemas after the §2 fixes them
- Discovering a system prompt cannot be expressed in the agreed format
- Realizing the mock_responses.json schema needs extension beyond PHASE-7-E format
- Any pre-existing scenario S01-S82 starts failing

The owner would rather pause and align than discover deviations at closure.

---

## 10. Cost Ledger `role` Field — Now Populated

PHASE-7-E left the `role` field nullable in the cost ledger. Starting PHASE-7-F-1:

Every `agent.invoke` call from a role MUST include `role: "<role_id>"` in the ledger entry. This enables:
- Per-role cost attribution ("Builder cost 60% of total")
- Cost prediction refinement (Cost Estimator Agent in PHASE-7-F-3 uses this)
- Owner visibility into where money goes

The `role.invoke` L2 tool injects `role: <role_id>` into every downstream `agent.invoke` automatically. Roles never set the role field manually.

---

## 11. The 12th Role — Reverse Architect

`DECISION-20260510-vision-shift-multi-agent-conductor.md` Section 3.12 defines the Reverse Architect Agent for analyzing existing projects. This role is **deferred to PHASE-11** because:

1. It depends on the existing-project intake infrastructure (PHASE-11 scope)
2. It's only useful when paired with the 4 flows (Improve/Add Feature/Bug Fix/Understand) defined in PHASE-11
3. PHASE-7-F is already large at 11 roles

This is intentional, not an oversight. PHASE-7-F-3's closure does NOT require Reverse Architect.

---

## 12. Closing Note

PHASE-7-E built the **engine** (agent runtime). PHASE-7-F builds the **brains** (specialized roles). PHASE-10 wires them into the **organism** (the orchestration loop).

Each sub-phase of 7-F delivers working roles ready for invocation. Even if PHASE-10 takes time, an owner can already invoke individual roles via `role.invoke` L2 tool starting from PHASE-7-F-1.

This is the manifestation of the multi-agent conductor vision. Care matters.

— Vision authored by Claude (CTO advisor) 2026-05-10.
