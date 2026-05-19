# 18 — Agent Roles Contract

> Implemented: PHASE-7-F-1 (architect, spec_writer, reviewer Phase A), PHASE-7-F-2 (builder, security_auditor, test_designer, reviewer Phase B), PHASE-7-F-3 (cost_estimator, environment, documentation, deployment, quality_judge + Activity Indicator System).
> Authority: `artifacts/decisions/DECISION-20260510-2100-phase-7-F-1-foundation-roles.md`, `artifacts/decisions/DECISION-20260511-0930-phase-7-F-2-build-verify-roles.md`, `artifacts/decisions/DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md`
> System prompts: `docs/10_runtime/18b_ROLE_PROMPTS.md`
> Activity indicators: `docs/10_runtime/19_ACTIVITY_INDICATORS.md`

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
  role_id:     "architect",           // required — registered role id
  input:       { intent: "...", project_id: "..." }, // role-specific input
  project_id:  "my_project",          // required — used for agent.invoke
  provider:    "anthropic",           // optional override
  model:       "claude-opus-4-7",     // optional override
  scenario_id: "S83"                  // optional — TEST mode only; injects SCENARIO_TAG
}, { root: "/path/to/project" });
```

`scenario_id` is propagated through `innerCtx` to the role's `run()`. When present it appends `\nSCENARIO_TAG: <id>\n` to the prompt, enabling scenario-id-based mock keys in the test harness (see §Mock Keys below).

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

## Prompt Loader

`code/src/runtime/agents/_prompt_loader.js` is the single source of truth for all role system prompts.

- Reads `docs/10_runtime/18b_ROLE_PROMPTS.md` once and caches in memory
- Normalizes CRLF → LF before parsing (Windows-safe)
- Parses sections matching: `` ## <id> (<date>) `` followed by a fenced code block
- Throws `Error("prompt_loader: unknown prompt id '<id>'")` for unregistered ids — fail-closed
- `resetPromptCache()` available for test isolation

Usage: `const SYSTEM_PROMPT = loadPrompt("builder_v1");` (called at module load time)

---

## Role Lifecycle (Inside `role.run`)

Every role's `run()` function follows this sequence:

1. Validate `input` against `input_schema` → FAILED `INVALID_INPUT` on violation
2. (Phase-gated roles) Validate phase-specific required fields → FAILED `INVALID_INPUT` on violation
3. Build prompt: `{role_id}|{project_id}\n[SCENARIO_TAG]\n{SYSTEM_PROMPT}\n\nINPUT:\n{JSON}\n\nRESPOND WITH VALID JSON ONLY.`
4. Call `agent.invoke` via lazy `require("../../tools/_registry").getDefaultRegistry()`
5. If `agent.invoke` fails → FAILED `AGENT_FAILED`
6. `JSON.parse(output.text)` → FAILED `INVALID_ROLE_OUTPUT` on parse error
7. Validate parsed JSON against `output_schema` → FAILED `INVALID_ROLE_OUTPUT` on violation
8. Return `roleOk(parsed, { role, model, provider })`

Phase-specific validation (step 2) fires **before** the schema check to produce a meaningful error reason. Example: reviewer/security_auditor Phase B/CODE require a `code` field and validate it in `run()` before delegating to schema.

---

## Mock Keys

Two key formats are supported by `mock_adapter.js`:

**Prefix-based (legacy, S83–S91):** `mock|<model>|<first 500 chars of prompt>`

Used when no SCENARIO_TAG is present. Fragile — sensitive to system prompt changes.

**Scenario-id-based (S92+):** `mock|<model>|scenario:<id>`

Enabled by passing `scenario_id` to `role.invoke` input. The role injects `\nSCENARIO_TAG: <id>\n` into the prompt; the mock adapter extracts it and builds a stable key. Preferred for all new test scenarios.

---

## Role Invoke Wrapper — Activity Emit Points (PHASE-7-F-3)

`role.invoke` in `role_tools.js` generates a `crypto.randomUUID()` invocation_id and emits activity events at 3 points:

1. **INVOKING_ADAPTER** — immediately before `role.run()`
2. **COMPLETED** — on `role.run()` SUCCESS, with `duration_ms` and `outcome: "success"`
3. **FAILED** — on `role.run()` failure or uncaught error, with `duration_ms` and `outcome: "failed"`

Inside each role's `run()`, 2 additional emit points fire on success:

4. **PARSING_OUTPUT** — after successful `JSON.parse()`
5. **VALIDATING_SCHEMA** — after successful schema validation

All emits are best-effort (wrapped in try/catch). Emit failures never block role execution. Events are written to `artifacts/agent/activity.jsonl` (one JSON object per line).

See `docs/10_runtime/19_ACTIVITY_INDICATORS.md` for indicator text per role per state.

---

## Registered Roles (PHASE-7-F-1 + PHASE-7-F-2 + PHASE-7-F-3)

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
| `system_prompt_id` | `reviewer_v2` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ phase: "A"|"B", spec: object, design: object, project_id: string, code?: object }`

**Output schema:** `{ verdict: "APPROVED"|"APPROVED_WITH_CONCERNS"|"REJECTED", findings[], summary }`

Phase A reviews spec completeness against design. Phase B reviews Builder's code plan — `code` field required (validated before schema check in `run()`).

**Verdict rules:**
- `APPROVED` — no BLOCKER findings
- `APPROVED_WITH_CONCERNS` — no BLOCKER findings, 1+ WARN findings
- `REJECTED` — one or more BLOCKER findings

---

### builder

| Field | Value |
|---|---|
| `id` | `builder` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `builder_v1` |
| `default_provider` | `claude_code` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object, target_files?: array }`

**Output schema:** `{ files_written[], summary, dependencies_added[], notes[] }`

Plans the implementation by describing files to create or modify. Delegates actual file writing to executor adapters (claude_code provider). Does not write files directly — Track A compliant.

---

### security_auditor

| Field | Value |
|---|---|
| `id` | `security_auditor` |
| `authority_level` | `BLOCKING` |
| `system_prompt_id` | `security_auditor_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, phase: "SPEC"|"CODE", spec: object, design: object, code?: object }`

**Output schema:** `{ threat_level: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"NONE", findings[], summary }`

Phase SPEC reviews spec for security gaps before code is written. Phase CODE reviews the Builder's implementation plan for vulnerabilities — `code` field required in Phase CODE. BLOCKER findings must be resolved before pipeline proceeds.

---

### test_designer

| Field | Value |
|---|---|
| `id` | `test_designer` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `test_designer_v2` (v1 DEPRECATED 2026-05-13) |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object }`

**Output schema:** `{ scenarios[], coverage_summary: { acs_total, acs_covered, gaps[] } }`

Each scenario item (L5b-compatible executable format, upgraded per DECISION-20260513-0930):
```js
{
  id:          string,       // "T-1", "T-2", ...
  name:        string,       // short descriptive name (snake_case)
  description: string,       // what the scenario verifies
  category:    string,       // "http" | "cli"
  fixture:     string,       // e.g. "fresh_db"
  setup:       { actions: [{ type: "start_server", command, wait_for_port, timeout_ms }] },
  execution:   { type: "http_request", method, url, headers, body },
  assertions:  [{ type: <one of 8 L5b types>, ...params }],
  teardown:    { actions: [{ type: "stop_server" }] },
  metadata:    { covers_ac: string[], estimated_duration_ms: number }
}
```

Generates **executable** L5b test scenarios for the project being built (not for Forge). Each scenario maps to one or more spec acceptance criteria via `metadata.covers_ac`. Uses only the 8 L5b assertion types. Never invents ACs not present in the spec. Never uses non-localhost URLs.

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

### §ARC Exceptions (authorized infrastructure deviations)

| Exception | File | Deviation | Authorization |
|---|---|---|---|
| §ARC-1 | `cost_ledger.js`, `_activity_emitter.js`, `_prompt_loader.js`, `_role_registry.js` | Direct `fs` reads/writes (re-entrancy prevention) | `DECISION-20260510-1938-phase-7-E-agent-adapters.md`, `DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md` |
| §ARC-2 | `live_smoke_runner.js` | Direct `fs.writeFileSync` / `fs.mkdirSync` (test infrastructure) | `DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md` |
| §ARC-3 | `code/src/runtime/builtproject/harness_runner.js` | `child_process.spawn` directly for server lifecycle management (start, stdout capture, port polling, teardown) | `DECISION-202605131800-phase-8-arc-3-spawn-exception.md` |
| §ARC-4 | `code/src/runtime/kb/manifests.js`, `code/src/runtime/kb/cost_ledger.js` (**NOTE:** distinct from §ARC-1's `code/src/runtime/agents/cost_ledger.js`) | Direct `fs` operations for atomic JSONL append (`manifests.js`: `.tmp → fsync → rename` per KB Contract §11.2; `cost_ledger.js`: `fs.appendFileSync` for line-level atomicity) — re-entrancy prevention when called from within L2 `kb.*` / `research.*` tool execute() | `DECISION-202605132000-phase-9-arc-4-kb-manifest-fs-exception.md` |
| §ARC-5 | `code/src/runtime/secrets/secret_provider.js`, `code/src/runtime/secrets/windows_credential_manager.js`, `code/src/runtime/secrets/mac_keychain.js`, `code/src/runtime/secrets/linux_secret_service.js` | Direct `child_process.execFile` to invoke OS keychain CLIs (`security`, `cmdkey`/PowerShell, `secret-tool`). Keychain APIs do not map to the L2 tool contract — they are platform-specific system calls. NOT a license for `child_process` use outside §ARC-5 scope. | `DECISION-2026-05-18T11-30-phase-12-plan.md §6` |
| §ARC-6 | `code/src/runtime/logging/log_writer.js` | Direct `fs.appendFileSync`, `fs.mkdirSync`, `fs.statSync`, `fs.renameSync`, `fs.unlinkSync` for high-frequency log writes + rotation cleanup. Routing log writes through L2 would create re-entrancy (every L2 call generates log entries — circular dependency) and unacceptable hot-path latency. `fs.unlinkSync` covers oldest-slot deletion required for Windows cross-platform rotation (`renameSync` throws EEXIST on existing destination, unlike Linux POSIX). Same rationale as §ARC-4 (re-entrancy prevention). NOT a license for `fs.*` direct use outside §ARC-6 scope. | `DECISION-2026-05-18T11-30-phase-12-plan.md §6` |

---

### cost_estimator

| Field | Value |
|---|---|
| `id` | `cost_estimator` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `cost_estimator_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object }`

**Output schema:** `{ phases[], total_effort_low_hours, total_effort_mid_hours, total_effort_high_hours, external_costs[], top_risks[], uncertainty_flags[], summary }`

Produces effort and cost estimates for the project based on spec and design. Reports developer hours only (no calendar dates, no team sizing). Flags high-uncertainty ACs in `uncertainty_flags`.

---

### environment

| Field | Value |
|---|---|
| `id` | `environment` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `environment_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object }`

**Output schema:** `{ target_environment, runtime_dependencies[], environment_variables[], external_services[], os_requirements, container_recommendation, filesystem_requirements[], assumption_flags[], summary }`

Produces environment requirements report. Defaults to Docker container target. Forbids auto-install — reports only. Never marks a secret env var as non-secret.

---

### documentation

| Field | Value |
|---|---|
| `id` | `documentation` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `documentation_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object, code?: object }`

**Output schema:** `{ overview, components[], api_reference[], quickstart, operations, known_limitations[], summary }`

Generates structured documentation package for the project being built (not for Forge). `code` field is optional; when provided, enriches API reference.

---

### deployment

| Field | Value |
|---|---|
| `id` | `deployment` |
| `authority_level` | `ADVISORY` |
| `system_prompt_id` | `deployment_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object, environment?: object }`

**Output schema:** `{ target_environment, prerequisites[], build_steps[], deployment_sequence[], rollback_procedure[], health_verification, post_deployment_tasks[], deployment_risks[], summary }`

Produces deployment plan in prose (no shell commands). Flags irreversible steps. `environment` field optional; when provided, enriches prerequisites and build steps.

---

### quality_judge

| Field | Value |
|---|---|
| `id` | `quality_judge` |
| `authority_level` | `BLOCKING` |
| `system_prompt_id` | `quality_judge_v1` |
| `default_model` | `claude-opus-4-7` |

**Input schema:** `{ project_id: string, spec: object, design: object, security_audit?: object, test_plan?: object, documentation?: object, cost_estimate?: object, environment?: object, deployment?: object, builder_output?: object }`

**Output schema:** `{ verdict: "APPROVED"|"APPROVED_WITH_CONCERNS"|"REJECTED", confidence_score: 0-100, cross_role_issues[], role_assessments: {architect, spec_writer, ...}, action_items[], summary }`

Final cross-role quality gate before delivery. Hard gate: REJECTED if any preceding role had unresolved CRITICAL/BLOCKER finding. `confidence_score` < 60 → REJECTED. All 10 role assessments required in output.

---

## Per-Role Provider/Model Recommendations

Based on PHASE-7-F-3 Live Smoke Tests + retry findings (see `DECISION-20260512-0900-phase-7-F-3-override.md`):

| Role | Recommended Model | Rationale |
|---|---|---|
| architect | gpt-4o-mini or claude-opus-4-7 | Simple schema, JSON reliability adequate |
| spec_writer | gpt-4o-mini or claude-opus-4-7 | Simple schema, JSON reliability adequate |
| reviewer | gpt-4o-mini or claude-opus-4-7 | Adequate for both Phase A and Phase B |
| builder | gpt-4o or claude-opus-4-7 | Higher quality matters for code planning |
| **security_auditor** | **gpt-4o or claude-opus-4-7 (MINIMUM)** | **Complex nested schema; gpt-4o-mini insufficient (per retry)** |
| test_designer | gpt-4o-mini or claude-opus-4-7 | Adequate |
| cost_estimator | gpt-4o-mini | Cheap, simple schema |
| environment | gpt-4o-mini | Cheap, simple schema |
| documentation | gpt-4o-mini or gpt-4o | Either works; quality matters for user-facing docs |
| **quality_judge** | **gpt-4o or claude-opus-4-7 (MINIMUM)** | **High-stakes synthesis** |
| deployment | gpt-4o-mini or gpt-4o | Either works |

**Default behavior:** Roles use their declared `default_model`. Vision can override per project. For production use, set `default_model` in vision to match recommendations above.

**Note on JSON extraction:** All real adapters (anthropic, openai, claude_code, aider) apply `extractJsonFromResponse()` (from `_adapter_contract.js`) to strip markdown code fences before returning `output.text`. This handles models that wrap JSON in ` ```json...``` ` blocks despite "RESPOND WITH VALID JSON ONLY" in their prompt.

---

## Future Roles (PHASE-11+)

| Role | Phase | Status |
|---|---|---|
| Reverse Architect | PHASE-11 | DEFERRED |
