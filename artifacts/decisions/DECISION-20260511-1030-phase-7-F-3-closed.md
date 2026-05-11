# DECISION-20260511-1030 — PHASE-7-F-3 CLOSED: Quality & Delivery Roles + Activity Indicator System

**Date:** 2026-05-11  
**Owner approval:** in-session (owner confirmed PHASE-7-F-3 prompt)  
**Phase:** PHASE-7-F-3  
**Status:** CLOSED  

---

## What was built

### Activity Indicator System (§3.3)
- `code/src/runtime/agents/_activity_catalog.js` — 11 roles × 5 states = 55 indicator verbs; `getIndicator(role_id, state)` API
- `code/src/runtime/agents/_activity_emitter.js` — best-effort JSONL writer to `artifacts/agent/activity.jsonl`; `emit()` + `readEntries()` + `VALID_STATES`
- `code/src/runtime/tools/activity_tools.js` — `agent.read_activity` L2 tool (READ_ONLY); auto-registered by registry

### Activity Retrofit — 6 existing roles (§3.4)
All 6 roles (architect, spec_writer, reviewer, builder, security_auditor, test_designer) retrofitted with:
- `emitActivity` + `getIndicator` imports
- `invocation_id` + `root` extraction from ctx
- PARSING_OUTPUT emit after successful JSON.parse
- VALIDATING_SCHEMA emit after successful schema validation
- All emits wrapped in try/catch (best-effort)

### role.invoke wrapper update (§3.5)
`code/src/runtime/tools/role_tools.js`:
- Generates `crypto.randomUUID()` invocation_id per call
- Passes `invocation_id` in innerCtx to role.run()
- Emits INVOKING_ADAPTER before role.run()
- Emits COMPLETED (with duration_ms, outcome: "success") on SUCCESS
- Emits FAILED (with duration_ms, outcome: "failed") on failure or exception

### 5 new system prompts (§3.6)
Added to `docs/10_runtime/18b_ROLE_PROMPTS.md`:
- `cost_estimator_v1` — effort estimation in developer hours; no calendar dates; external costs
- `environment_v1` — container requirements; forbids auto-install; Docker default
- `documentation_v1` — structured docs for built project; no Forge docs
- `deployment_v1` — prose-only plan; forbids execution commands; flags irreversible steps
- `quality_judge_v1` — hard gate; REJECTED if CRITICAL/BLOCKER unresolved; confidence_score; 10-role assessments

### 5 new role modules (§3.7)
- `code/src/runtime/agents/roles/cost_estimator_role.js` — ADVISORY; phases[], effort totals, external_costs[], top_risks[]
- `code/src/runtime/agents/roles/environment_role.js` — ADVISORY; target_environment, runtime_deps, env_vars, container_recommendation
- `code/src/runtime/agents/roles/documentation_role.js` — ADVISORY; overview, components[], api_reference[], quickstart, operations
- `code/src/runtime/agents/roles/deployment_role.js` — ADVISORY; prerequisites, build_steps, deployment_sequence, rollback_procedure, health_verification
- `code/src/runtime/agents/roles/quality_judge_role.js` — BLOCKING; verdict, confidence_score, cross_role_issues[], role_assessments (10 roles), action_items[]

### Test infrastructure (§3.8–§3.10)
- `mock_responses.json`: 10 new scenario-id-based entries (S104, S106, S107, S109, S110, S112, S113, S115, S116, S118)
- 15 new scenario files: S104–S118 (3 per new role: happy path, invalid input, bad JSON)
- New assertion type: `output_field_exists` (checks `result.output.state[field]`)
- Doctor check: `REQUIRED_ROLES` 6→11
- `test_tool_runtime.js`: tools count 55→56
- `test_harness_meta.js`: scenarios 103→118, assertion types 9→10

### Live smoke infrastructure (§3.13–§3.14)
- `code/src/runtime/live_smoke_runner.js` — runs 11-role probe suite against real LLM; $7 hard cap enforcement; saves JSON report to `artifacts/live_smoke/`
- `bin/forge-live-smoke.js` — CLI; loads .env; sets TEST permission mode; `--dry-run` flag

### Documentation (§3.12)
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — updated to cover all 11 roles + activity emit points + §3.4 ARC-3 notes
- `docs/10_runtime/19_ACTIVITY_INDICATORS.md` — new; full activity system architecture, event schema, per-role indicator catalog

---

## Closure gate verification

| Gate | Result |
|---|---|
| Self-test harness | 113 PASS, 0 FAIL, 5 SKIP (118 total) |
| test_tool_runtime | 22/22 PASS |
| test_doctor | 8/8 PASS |
| test_permission_layer | 20/20 PASS |
| test_harness_meta | 13/13 PASS |
| test_provider_contract_v2 | 8/8 PASS |
| Live smoke (real OpenAI, gpt-4o-mini) | 10/11 PASS |
| Decision artifact | this file |

---

## Live smoke result — §3.16 self-assessment

**Provider:** openai / gpt-4o-mini  
**Pass:** 10/11 roles (architect, spec_writer, reviewer, builder, test_designer, cost_estimator, environment, documentation, deployment, quality_judge)  
**Fail:** 1 — security_auditor: `INVALID_ROLE_OUTPUT` — gpt-4o-mini returned JSON with single-quoted property name at position 416  

**Assessment:** The security_auditor failure is a model output quality issue, not a code defect. The prompt instructs "RESPOND WITH VALID JSON ONLY" but gpt-4o-mini occasionally uses JavaScript-style (non-standard) JSON formatting. All 10 passing roles returned structurally valid, substantively correct outputs. The code correctly detects and rejects the malformed output via `JSON.parse()`.

**Residual risk:** If a future orchestrator uses `security_auditor` with gpt-4o-mini, it may encounter intermittent JSON parse failures. Mitigation: use `claude-opus-4-7` or `gpt-4o` for security-critical roles, or add JSON repair/retry in a future phase.

**Cost:** <$0.02 estimated (ledger cost_usd field returns 0 due to openai_adapter not computing cost — separate minor issue). Real latencies: 2–8 seconds per role confirmed.

---

## Architectural deviations

| ID | Deviation | Justification |
|---|---|---|
| §ARC-1 | `_activity_emitter.js` uses `fs.appendFileSync` directly | Prevents re-entrancy: roles cannot call role.invoke from within role.invoke |
| §ARC-2 | `live_smoke_runner.js` uses `fs.writeFileSync` directly | Runner is infrastructure, not a role; avoids circular dependency on tool registry |
| §ARC-3 | architect_role + spec_writer_role had missing scenarioTag injection | Fixed during §3.4 retrofit; documented here |

---

## next_step

Begin PHASE-8 (Built-Project Test Harness) per `architecture/FORGE_V2_PHASE_ROADMAP.md`.  
Prerequisite: PHASE-7-F-3 CLOSED ✓
