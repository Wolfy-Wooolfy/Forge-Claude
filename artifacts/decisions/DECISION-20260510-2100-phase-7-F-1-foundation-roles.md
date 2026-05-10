# DECISION-20260510-2100-phase-7-F-1-foundation-roles

| Field | Value |
|---|---|
| Date | 2026-05-10 |
| Timestamp | 20260510-2100 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-10 |
| Phase | PHASE-7-F-1 |
| Authority | `DECISION-20260510-vision-shift-multi-agent-conductor.md` (Layer-0) |
| Vision context | `architecture/VISION-PHASE-7-F.md` |
| Track | Track B |
| Depends on | PHASE-7-E (CLOSED) |

---

## §2-A. Scope

- 1 role contract module + 1 role registry module
- 1 JSON Schema validator module (in-house, no new dependencies)
- 1 L2 tool: `role.invoke`
- 3 specialized agent role modules:
  - `architect_role.js`
  - `spec_writer_role.js`
  - `reviewer_role.js` (Phase A — spec review only; Phase B added in PHASE-7-F-2)
- 3 system prompts versioned in `docs/10_runtime/18b_ROLE_PROMPTS.md`
- 1 contract documentation file: `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md`
- 1 doctor check: `roles_runtime`
- 9 new test scenarios: S83–S91

**Out of scope (explicit):**
- Builder, Security Auditor, Test Designer, Reviewer Phase B — PHASE-7-F-2
- Cost Estimator, Environment, Documentation, Quality Judge, Deployment — PHASE-7-F-3
- Reverse Architect — PHASE-11
- Inter-role orchestration loop — PHASE-10
- Real LLM invocation (production use of API) — tested via mock only

---

## §2-B. Namespace

The new L2 tool lives under the `role.*` namespace. This namespace is **separate from `agent.*`**. Roles are clients of agents, not agents themselves.

---

## §2-C. Role Contract (`defineRole` shape)

```js
defineRole({
  id:          string,    // unique role id (e.g. "architect")
  label:       string,    // human-readable (e.g. "Architect")
  description: string,    // one-sentence purpose

  default_provider: string,    // e.g. "anthropic"
  default_model:    string,    // e.g. "claude-opus-4-7"

  system_prompt_id: string,    // references entry in 18b_ROLE_PROMPTS.md

  input_schema:  object,
  output_schema: object,

  authority_level: "ADVISORY" | "BLOCKING",

  typical_cost_usd_min: number,
  typical_cost_usd_max: number,

  async run(input, ctx) → { status, output, metadata }
})
```

`defineRole` validates the spec at construction and returns a frozen object. Any required field missing → throws at module load time (fail-closed at boot).

---

## §2-D. Required Decisions (binding behaviors)

### §2-D1. Role authority taxonomy
- `architect`   → ADVISORY
- `spec_writer` → ADVISORY
- `reviewer`    → BLOCKING (BLOCKER findings stop the pipeline)

### §2-D2. System prompts are versioned, not editable
Once a system prompt is committed (e.g., `architect_v1`), it is **never edited**. Changes create a new version (`architect_v2`). Both versions stay in `18b_ROLE_PROMPTS.md` until the old one is formally deprecated.

### §2-D3. Roles invoke `agent.invoke` (L2 tool from PHASE-7-E) — never adapters directly
Track A discipline. Roles never `require("../adapters/...")`. They go through the tool registry → `agent.invoke` → adapter. This ensures cost ledger entry, vision lock, budget enforcement, permission policy gating.

Implementation: `role.run()` calls `getDefaultRegistry().invoke("agent.invoke", ...)`. The lazy `require("./_registry")` inside `execute()` avoids circular dependency at module load time (Node.js module cache guarantees correctness at invocation time).

### §2-D4. The `role` field in the cost ledger MUST be populated
Every `agent.invoke` call from a role includes `context: { role: <role_id> }`. The `agent_tools.js` modification (§2-F) also reads `ctx.role_id` as a secondary source. The `role.invoke` L2 tool passes `{ root: ctx.root, role_id: input.role_id }` as the inner ctx.

### §2-D5. Output is structured JSON, validated on every invocation
Role's `run()` function:
1. Calls `agent.invoke` with prompt instructing JSON-only response
2. Parses the JSON from `output.text`
3. Validates against `output_schema` via in-house validator
4. Returns FAILED with reason `INVALID_ROLE_OUTPUT` if parse or validation fails

### §2-D6. Mock-first scenarios
All 9 scenarios use `provider: "mock"` exclusively. The `mock_responses.json` file is extended with scripted responses for each role's expected inputs. Each scenario uses a unique `model` string (e.g., `mock-arch-s83`) so mock keys are deterministic and non-colliding.

### §2-D7. JSON Schema validation library
Minimal in-house validator. No new npm dependency. Supports:
- `type` (string, number, object, array, boolean, null)
- `required` (array of field names)
- `properties` (nested schemas)
- `items` (for arrays)
- `enum`
- `minLength` (string)
- `minimum` (number)

Function signature: `validate(value, schema) → { valid: boolean, errors: string[] }`

### §2-D8. Reviewer in this sub-phase reviews SPECS only (Phase A)
Input schema accepts `{ phase: "A", spec, design, project_id }`. Phase B input rejected with `UNSUPPORTED_PHASE`. PHASE-7-F-2 will extend input_schema for Phase B.

### §2-D9. The role registry validates at boot
- Each role's `id` must be unique
- `system_prompt_id` must reference an existing entry in `18b_ROLE_PROMPTS.md` (registry does one `fs.readFileSync` at load time)
- `input_schema` and `output_schema` must be valid
- `authority_level` must be "ADVISORY" or "BLOCKING"
- `default_provider` must be in `VALID_PROVIDERS` from `_adapter_contract.js`
Boot fails with clear error if any role fails validation.

### §2-D10. The `role.invoke` L2 tool is the single entry point
External code never calls `role.run()` directly. Always:
```
reg.invoke("role.invoke", { role_id: "architect", input: {...}, project_id: "..." })
```
The `role.invoke` execute function wraps the role output with `role_id` at the top level for assertion access:
```js
return ok({ role_id: input.role_id, ...roleOutput });
```

---

## §2-E. Files to Create

```
code/src/runtime/agents/_role_contract.js
code/src/runtime/agents/_role_registry.js
code/src/runtime/agents/_json_schema_validator.js
code/src/runtime/agents/roles/architect_role.js
code/src/runtime/agents/roles/spec_writer_role.js
code/src/runtime/agents/roles/reviewer_role.js
code/src/runtime/tools/role_tools.js
code/src/runtime/doctor/checks/roles_runtime.js
docs/10_runtime/18_AGENT_ROLES_CONTRACT.md
docs/10_runtime/18b_ROLE_PROMPTS.md
artifacts/decisions/DECISION-20260510-2100-phase-7-F-1-foundation-roles.md  (this file)
```

---

## §2-F. Files to Modify

```
code/src/runtime/agents/adapters/mock_responses.json  — extend with scripted responses
code/src/runtime/tools/agent_tools.js                 — agent.invoke reads ctx.role_id → ledger
code/src/runtime/doctor/_registry.js                  — register roles_runtime check (19 → 20)
code/src/testing/scenarios/                           — add S83–S91 (9 new files)
verify/smoke/test_tool_runtime.js                     — bump 54 → 55
verify/smoke/test_doctor.js                           — bump 19 → 20
verify/smoke/test_harness_meta.js                     — bump 82 → 91, extend ID list
progress/status.json                                  — PHASE-7-F-1-CLOSED, next: PHASE-7-F-2
```

Note: `code/src/runtime/tools/_registry.js` does NOT require modification — it auto-discovers all `*_tools.js` files including `role_tools.js`.

---

## §2-G. Acceptance Criteria

- AC-1: `_role_contract.js` exports `defineRole` with full spec validation; throws at module load on missing fields
- AC-2: `_role_registry.js` auto-discovers `*_role.js` files in `roles/`; exports `pickRole`, `listRoles`, `resetRoleCache`
- AC-3: 3 roles registered: architect, spec_writer, reviewer
- AC-4: `role.invoke` L2 tool registered (tool count 54 → 55)
- AC-5: Doctor check `roles_runtime` PASS (3 roles loaded, registry valid)
- AC-6: Each role's system prompt versioned in `18b_ROLE_PROMPTS.md` (3 prompts: architect_v1, spec_writer_v1, reviewer_v1)
- AC-7: Each role validates output JSON against schema; returns INVALID_ROLE_OUTPUT on failure
- AC-8: `role.invoke` output includes `role_id` field; ledger entries show role attribution
- AC-9: Reviewer in Phase A accepts spec input; rejects Phase B input with UNSUPPORTED_PHASE
- AC-10: 9 new scenarios (S83–S91) all PASS using mock provider
- AC-11: Track A discipline — no child_process, no fs.(write|append|unlink|mkdir|rm)Sync, no fetch() in roles/ layer or new tool/doctor/contract files
- AC-12: Tool count: 54 → 55
- AC-13: Doctor checks: 19 → 20
- AC-14: Scenarios: 82 → 91
- AC-15: All 5 smoke suites PASS exit 0

---

## Architectural Deviations

### §ARC-1: Role Registry Uses `fs.readFileSync` for System Prompt Validation

**Deviation:** `_role_registry.js` uses `fs.readFileSync` to validate that `system_prompt_id` references an existing entry in `18b_ROLE_PROMPTS.md` at registry load time.

**Reason:** Track A validation grep (`§5`) prohibits `fs.(write|append|unlink|mkdir|rm)Sync` but NOT `fs.readFileSync`. The grep pattern is `fs\.(write|append|unlink|mkdir|rm)Sync`. Read operations are explicitly allowed (same precedent: `visionEngine.readVisionSync()` uses `fs.readFileSync`).

**Impact:** Zero. Read-only access to a documentation file at registry boot time. Consistent with established patterns.

### §ARC-2: `role.run()` Uses Lazy `require("./_registry")` to Call `agent.invoke`

**Deviation:** Inside `role.run()`, the code calls `require("../../tools/_registry").getDefaultRegistry()` to invoke `agent.invoke`. This creates a runtime dependency from `roles/*.js` on `tools/_registry.js`.

**Reason:** The circular dependency at module load time is avoided because the `require()` is inside the `run()` function body (not at module top level). By the time `run()` is called, both modules are fully initialized in Node.js module cache.

**Impact:** Zero. Standard Node.js lazy require pattern for circular-avoiding runtime dependencies. No circular dep at load time.

---

## Owner Approval

Owner approval received via chat directive to begin PHASE-7-F-1 implementation (2026-05-10).
