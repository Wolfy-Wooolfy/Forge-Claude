# 18 — Agent Roles Contract

> Implemented: PHASE-7-F-1.
> Authority: `artifacts/decisions/DECISION-20260510-2100-phase-7-F-1-foundation-roles.md`
> System prompts: `docs/10_runtime/18b_ROLE_PROMPTS.md`

---

## Overview

Forge roles are specialized LLM agents that convert owner intent into structured, machine-readable outputs. Each role:

- Runs through `agent.invoke` (never calls adapters directly — Track A discipline)
- Validates its input against a JSON schema before invocation
- Validates the LLM's output against a JSON schema before returning
- Contributes a cost ledger entry with `role` attribution
- Is addressable via the `role.invoke` L2 tool

---

## Namespace

`role.*` — separate from `agent.*`. Roles are **clients** of agents, not agents themselves.

---

## Role Invocation (Public API)

All external code uses the `role.invoke` L2 tool. Direct `role.run()` calls are forbidden.

```js
reg.invoke("role.invoke", {
  role_id:    "architect",           // required — registered role id
  input:      { intent: "...", project_id: "..." }, // role-specific input
  project_id: "my_project",          // required — used for agent.invoke
  provider:   "anthropic",           // optional override
  model:      "claude-opus-4-7"      // optional override
}, { root: "/path/to/project" });
```

**Output (SUCCESS):**
```js
{
  status:   "SUCCESS",
  output:   { role_id: "architect", design_summary: "...", ... },
  metadata: { role: "architect", model: "...", provider: "..." }
}
```

The `role_id` field is always present at the top level of `output` for assertion access.

**Output (FAILED):**
```js
{
  status:   "FAILED",
  output:   null,
  metadata: { reason: "INVALID_INPUT" | "INVALID_ROLE_OUTPUT" | "AGENT_FAILED" | "...", detail: "..." }
}
```

---

## Role Lifecycle (Inside `role.run`)

Every role's `run()` function follows this sequence:

1. Validate `input` against `input_schema` → FAILED `INVALID_INPUT` on violation
2. Build prompt: `{role_id}|{project_id}\n{SYSTEM_PROMPT}\n\nINPUT:\n{JSON}\n\nRESPOND WITH VALID JSON ONLY.`
3. Call `agent.invoke` via lazy `require("../../tools/_registry").getDefaultRegistry()`
4. If `agent.invoke` fails → FAILED `AGENT_FAILED`
5. `JSON.parse(output.text)` → FAILED `INVALID_ROLE_OUTPUT` on parse error
6. Validate parsed JSON against `output_schema` → FAILED `INVALID_ROLE_OUTPUT` on violation
7. Return `roleOk(parsed, { role, model, provider })`

---

## Registered Roles (PHASE-7-F-1)

### architect

| Field | Value |
|---|---|
| `id` | `architect` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `architect_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ intent: string, project_id: string }`

**Output schema:** `{ design_summary, components[], data_flow, technology_choices[], integration_points[], identified_risks[] }`

Converts owner intent into a structured system design document. Does not write code, invent test scenarios, or add undeclared requirements.

---

### spec_writer

| Field | Value |
|---|---|
| `id` | `spec_writer` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `spec_writer_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ design: object, project_id: string }`

**Output schema:** `{ scope, decisions[], acceptance_criteria[], files_to_create[], files_to_modify[], out_of_scope[] }`

Converts an Architect design into a formal implementation contract. Does not add architecture, generate code, or exceed design scope.

---

### reviewer

| Field | Value |
|---|---|
| `id` | `reviewer` |
| `authority_level` | `BLOCKING` |
| `system_prompt_id` | `reviewer_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ phase: "A"|"B", spec: object, design: object, project_id: string }`

**Output schema:** `{ verdict: "APPROVED"|"APPROVED_WITH_CONCERNS"|"REJECTED", findings[], summary }`

Phase A only in PHASE-7-F-1. Phase B input rejected with `UNSUPPORTED_PHASE`. BLOCKER findings stop pipeline progression.

**Verdict rules:**
- `APPROVED` — no BLOCKER findings, at most 2 WARN findings
- `APPROVED_WITH_CONCERNS` — no BLOCKER findings, 3+ WARN findings
- `REJECTED` — one or more BLOCKER findings

---

## Role Registry

`code/src/runtime/agents/_role_registry.js` auto-discovers `*_role.js` files in the `roles/` directory at first access. It validates at boot:

- Each role loads without error
- No duplicate `id` values
- Each role's `system_prompt_id` references an existing entry in `18b_ROLE_PROMPTS.md`

Boot fails with a clear error if any validation fails (fail-closed).

---

## System Prompt Versioning

All system prompts live in `docs/10_runtime/18b_ROLE_PROMPTS.md`. Versioning rules:

- Once committed, a prompt version is **never edited**
- Changes create a new version (e.g., `architect_v2`)
- Old versions remain until formally deprecated

---

## JSON Schema Validation

`code/src/runtime/agents/_json_schema_validator.js` validates input and output on every invocation. Supports: `type`, `required`, `properties`, `items`, `enum`, `minLength`, `minimum`. No external dependencies.

---

## Track A Compliance

No role file or contract file uses:
- `fs.(write|append|unlink|mkdir|rm)Sync`
- `child_process.spawn` / `exec`
- `fetch()` directly

All side effects go through `agent.invoke` (which writes to cost ledger) and the tool registry infrastructure.

---

## Future Roles (PHASE-7-F-2 and beyond)

| Role | Phase | Status |
|---|---|---|
| Builder | PHASE-7-F-2 | PENDING |
| Security Auditor | PHASE-7-F-2 | PENDING |
| Test Designer | PHASE-7-F-2 | PENDING |
| Reviewer (Phase B) | PHASE-7-F-2 | PENDING |
| Documentation | PHASE-7-F-3 | PENDING |
| Cost Estimator | PHASE-7-F-3 | PENDING |
| Environment | PHASE-7-F-3 | PENDING |
| Quality Judge | PHASE-7-F-3 | PENDING |
| Deployment | PHASE-7-F-3 | PENDING |
| Reverse Architect | PHASE-11 | DEFERRED |
